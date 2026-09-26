package com.voiceactivator.Runtime

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaPlayer
import android.util.Base64
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/**
 * AudioPlayback — Streaming PCM ring-buffer playback + WAV file playback.
 *
 * Used by Epic 11 (Custom TTS) to play synthesised audio on device.
 * PCM float32 chunks arrive as base64 strings (bridge-safe transport),
 * are decoded to FloatArray, and written to an AudioTrack in MODE_STREAM.
 *
 * Audio ducking: calls requestAudioFocus(AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
 * when streaming starts or when WAV plays without streaming; abandons focus
 * when that playback ends or [stopStreaming] runs.
 *
 * Thread safety: the player state is reached from at least two threads — the RN
 * bridge thread (playPCMChunk / playWav / stopPlayback) and the background thread
 * synthesizeTTS spawns per call. Every field below was plain and unsynchronized,
 * so a synthesizeTTS thread assigning `mediaPlayer` while a concurrent
 * stopPlayback() released it produced a double-release, or orphaned a player
 * mid-playback with nothing able to stop it. Worse, writeChunk() held a reference
 * to an AudioTrack that stopStreaming() could release underneath its blocking
 * write.
 *
 * State transitions take the write lock; writeChunk takes the read lock for the
 * duration of its blocking write, so a track can never be released while a write
 * is in flight. A read/write lock rather than a plain mutex because the write
 * blocks: holding an exclusive lock across it would make stopPlayback() — and so
 * barge-in — wait for a whole buffer. `stopping` plus an early pause() unblocks a
 * waiting writer first so the exclusive section is short.
 */
internal class AudioPlayback(private val context: Context) {

  private val stateLock = ReentrantReadWriteLock()

  private var audioTrack: AudioTrack? = null
  private var mediaPlayer: MediaPlayer? = null
  private var isStreaming = false
  /** True when WAV requested audio focus (not streaming — streaming already holds focus). */
  private var wavOwnsAudioFocus = false

  /**
   * Set before teardown takes the exclusive lock, so a writer blocked inside
   * AudioTrack.write() bails out instead of resuming against a doomed track.
   */
  @Volatile
  private var stopping = false

  private fun requestPlaybackAudioFocus() {
    val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    @Suppress("DEPRECATION")
    audioManager.requestAudioFocus(
      null,
      AudioManager.STREAM_MUSIC,
      AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
    )
  }

  private fun abandonPlaybackAudioFocus() {
    val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    @Suppress("DEPRECATION")
    audioManager.abandonAudioFocus(null)
  }

  /** Caller must hold the write lock. */
  private fun stopWavLocked(abandonFocusIfWavOwned: Boolean) {
    mediaPlayer?.run {
      runCatching { stop() }
      // release() can throw on an already-released player; it was outside the
      // guard, so a throw here escaped all the way to the unsettled bridge
      // promise.
      runCatching { release() }
    }
    mediaPlayer = null
    if (abandonFocusIfWavOwned && wavOwnsAudioFocus) {
      abandonPlaybackAudioFocus()
      wavOwnsAudioFocus = false
    }
  }

  // ─── Streaming ──────────────────────────────────────────────────────────

  /**
   * Start streaming at [sampleRate] Hz. Idempotent — safe to call again while
   * already streaming (returns without recreating the AudioTrack).
   */
  fun startStreaming(sampleRate: Int) = stateLock.write {
    if (isStreaming) return@write
    stopping = false

    val minBufSize = AudioTrack.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_OUT_MONO,
      AudioFormat.ENCODING_PCM_FLOAT
    ).coerceAtLeast(4096)

    audioTrack = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
          .setSampleRate(sampleRate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build()
      )
      .setBufferSizeInBytes(minBufSize * 4)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()

    requestPlaybackAudioFocus()

    audioTrack?.play()
    isStreaming = true
  }

  /**
   * Decode [pcmBase64] (base64 little-endian float32 bytes) and write to the
   * AudioTrack. Blocks until the internal AudioTrack buffer accepts the data.
   */
  fun writeChunk(pcmBase64: String) {
    // Decode outside the lock: it is pure CPU work on caller-owned data and there
    // is no reason to make teardown wait for it.
    val bytes = Base64.decode(pcmBase64, Base64.DEFAULT)
    val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
    val pcm = FloatArray(buf.remaining())
    buf.get(pcm)

    // The read lock is held across the blocking write, so stopStreaming() cannot
    // release this track underneath it.
    stateLock.read {
      if (stopping) return@read
      val track = audioTrack ?: return@read
      runCatching { track.write(pcm, 0, pcm.size, AudioTrack.WRITE_BLOCKING) }
    }
  }

  /**
   * Stop streaming and any WAV playback. Pauses and flushes the AudioTrack, releases
   * it, then abandons audio focus when this layer owns it.
   */
  fun stopStreaming() {
    // Signal and pause before taking the exclusive lock: pause() makes a blocked
    // WRITE_BLOCKING call return promptly, so the writer releases the read lock
    // rather than holding it for a whole buffer. Without this, stopPlayback —
    // and therefore barge-in — would wait on the buffer draining.
    stopping = true
    runCatching { stateLock.read { audioTrack?.pause() } }

    stateLock.write {
      stopWavLocked(abandonFocusIfWavOwned = true)

      if (!isStreaming) return@write
      isStreaming = false

      runCatching { audioTrack?.flush() }
      runCatching { audioTrack?.release() }
      audioTrack = null

      abandonPlaybackAudioFocus()
    }
  }

  // ─── WAV file playback ──────────────────────────────────────────────────

  /**
   * Play a WAV file at [filePath] asynchronously. Calls [onComplete] on
   * completion (success) or [onError] with a message on failure.
   */
  fun playWav(
    filePath: String,
    onComplete: () -> Unit,
    onError: (String) -> Unit
  ) = stateLock.write {
    stopWavLocked(abandonFocusIfWavOwned = true)

    val player = MediaPlayer()
    mediaPlayer = player

    runCatching {
      player.setDataSource(filePath)
      player.prepare()

      // MediaPlayer callbacks arrive on its own thread, so this must take the
      // lock rather than touching mediaPlayer directly — and must check that it
      // is still the current player, since a newer playWav() may have superseded
      // it while this one was finishing.
      fun finishWav(success: Boolean, errorMsg: String?) {
        val shouldReport = stateLock.write {
          if (mediaPlayer !== player) {
            // Superseded: whoever replaced us already released this player.
            return@write false
          }
          runCatching { player.release() }
          mediaPlayer = null
          if (wavOwnsAudioFocus) {
            abandonPlaybackAudioFocus()
            wavOwnsAudioFocus = false
          }
          true
        }

        // Consumer callbacks run outside the lock: they re-enter this class via
        // stopPlayback in practice, which would deadlock on a non-reentrant
        // write lock held across them.
        if (!shouldReport) return
        if (success) onComplete()
        else onError(errorMsg ?: "AudioPlayback: WAV playback failed")
      }

      player.setOnCompletionListener {
        finishWav(success = true, errorMsg = null)
      }
      player.setOnErrorListener { _, what, extra ->
        finishWav(
          success = false,
          errorMsg = "AudioPlayback: WAV playback error (what=$what, extra=$extra)"
        )
        true
      }

      if (!isStreaming) {
        requestPlaybackAudioFocus()
        wavOwnsAudioFocus = true
      }

      player.start()
    }.onFailure { e ->
      if (mediaPlayer === player) {
        runCatching { player.release() }
        mediaPlayer = null
        if (wavOwnsAudioFocus) {
          abandonPlaybackAudioFocus()
          wavOwnsAudioFocus = false
        }
      }
      onError(e.message ?: "AudioPlayback: unknown error starting WAV playback")
    }
  }

  /** Stop any WAV playback without touching a live stream. */
  fun stopWav() = stateLock.write { stopWavLocked(abandonFocusIfWavOwned = true) }

  fun isStreaming(): Boolean = stateLock.read { isStreaming }
}
