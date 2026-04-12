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
 * Thread safety: writeChunk() is called from the JS bridge thread and blocks
 * until the internal AudioTrack buffer accepts the data. Callers should dispatch off the main
 * thread if write latency matters.
 */
internal class AudioPlayback(private val context: Context) {

  private var audioTrack: AudioTrack? = null
  private var mediaPlayer: MediaPlayer? = null
  private var isStreaming = false
  /** True when WAV requested audio focus (not streaming — streaming already holds focus). */
  private var wavOwnsAudioFocus = false

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

  private fun stopWavInternal(abandonFocusIfWavOwned: Boolean) {
    mediaPlayer?.run {
      runCatching { stop() }
      release()
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
  fun startStreaming(sampleRate: Int) {
    if (isStreaming) return

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
    val track = audioTrack ?: return
    val bytes = Base64.decode(pcmBase64, Base64.DEFAULT)
    val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
    val pcm = FloatArray(buf.remaining())
    buf.get(pcm)
    track.write(pcm, 0, pcm.size, AudioTrack.WRITE_BLOCKING)
  }

  /**
   * Stop streaming and any WAV playback. Pauses and flushes the AudioTrack, releases
   * it, then abandons audio focus when this layer owns it.
   */
  fun stopStreaming() {
    stopWavInternal(abandonFocusIfWavOwned = true)

    if (!isStreaming) return
    isStreaming = false

    runCatching { audioTrack?.pause() }
    runCatching { audioTrack?.flush() }
    runCatching { audioTrack?.release() }
    audioTrack = null

    abandonPlaybackAudioFocus()
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
  ) {
    stopWavInternal(abandonFocusIfWavOwned = true)

    val player = MediaPlayer()
    mediaPlayer = player

    runCatching {
      player.setDataSource(filePath)
      player.prepare()

      fun finishWav(success: Boolean, errorMsg: String?) {
        player.release()
        mediaPlayer = null
        if (wavOwnsAudioFocus) {
          abandonPlaybackAudioFocus()
          wavOwnsAudioFocus = false
        }
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
      player.release()
      mediaPlayer = null
      if (wavOwnsAudioFocus) {
        abandonPlaybackAudioFocus()
        wavOwnsAudioFocus = false
      }
      onError(e.message ?: "AudioPlayback: unknown error starting WAV playback")
    }
  }

  fun isStreaming(): Boolean = isStreaming
}
