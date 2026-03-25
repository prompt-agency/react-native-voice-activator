package com.voiceactivator.Runtime

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * VADCapture — Captures real-time 16kHz mono PCM frames using AudioRecord and
 * delivers them as base64-encoded float32 arrays via the [pcmFrameHandler] callback.
 *
 * One frame = 512 float32 samples (32 ms at 16 kHz).
 * Only active between [start] and [stop] calls.
 *
 * Wake-word detection pauses its own [AudioRecord] before VAD starts, then resumes
 * after VAD stops. That avoids device-specific recorder contention instead of relying
 * on multiple MIC captures to coexist.
 */
class VADCapture {

  private val frameSize = 512 // samples per VAD frame
  private var audioRecord: AudioRecord? = null
  private var captureThread: HandlerThread? = null
  private var captureHandler: Handler? = null

  @Volatile
  var isRunning = false
    private set

  /** Called on each PCM frame with a base64-encoded float32 buffer. Thread-safe. */
  var pcmFrameHandler: ((base64PCM: String) -> Unit)? = null

  /**
   * Start PCM capture at the given [sampleRate] (typically 16000 Hz).
   * Throws [IllegalStateException] if AudioRecord cannot be initialized.
   */
  fun start(sampleRate: Int) {
    if (isRunning) return

    val minBufSize = AudioRecord.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_FLOAT
    )
    require(minBufSize != AudioRecord.ERROR && minBufSize != AudioRecord.ERROR_BAD_VALUE) {
      "AudioRecord: unsupported configuration (sampleRate=$sampleRate)"
    }

    val bufSize = maxOf(minBufSize, frameSize * Float.SIZE_BYTES * 4)
    val record = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_FLOAT,
      bufSize
    )

    check(record.state == AudioRecord.STATE_INITIALIZED) {
      "AudioRecord failed to initialize"
    }

    audioRecord = record
    isRunning = true

    val thread = HandlerThread("VADCapture").also { it.start() }
    captureThread = thread
    captureHandler = Handler(thread.looper)

    record.startRecording()

    captureHandler?.post { readLoop(record, sampleRate) }
  }

  /** Stop capture and release AudioRecord resources. */
  fun stop() {
    if (!isRunning) return
    isRunning = false
    audioRecord?.apply {
      stop()
      release()
    }
    audioRecord = null
    captureThread?.quitSafely()
    captureThread = null
    captureHandler = null
    pcmFrameHandler = null
  }

  private fun readLoop(record: AudioRecord, @Suppress("UNUSED_PARAMETER") sampleRate: Int) {
    val floatBuffer = FloatArray(frameSize)
    while (isRunning) {
      val read = record.read(floatBuffer, 0, frameSize, AudioRecord.READ_BLOCKING)
      // ERROR_INVALID_OPERATION / ERROR_BAD_VALUE are negative; treat as hard stop.
      if (!isRunning || read <= 0) break

      val byteBuffer = ByteBuffer.allocate(read * Float.SIZE_BYTES)
        .order(ByteOrder.LITTLE_ENDIAN)
      repeat(read) { i -> byteBuffer.putFloat(floatBuffer[i]) }

      val base64 = Base64.encodeToString(byteBuffer.array(), Base64.NO_WRAP)
      pcmFrameHandler?.invoke(base64)
    }
  }
}
