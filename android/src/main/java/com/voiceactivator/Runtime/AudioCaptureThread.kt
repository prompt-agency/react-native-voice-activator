package com.voiceactivator.Runtime

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder

internal class AudioCaptureThread {
  // Written from the caller's thread, read by the worker's loop condition.
  // Without @Volatile the worker may never observe the stop and keeps reading.
  @Volatile
  private var capturing = false
  private var audioRecord: AudioRecord? = null
  private var workerThread: Thread? = null

  /**
   * Start capturing and deliver frames to [onSamples].
   *
   * [onSamples] is required. It used to be nullable with a default of null, and
   * that path set capturing = true and returned true without creating an
   * AudioRecord or starting a thread — so isCapturing() reported true with no
   * capture running underneath and stopCapture() had nothing to stop. No call
   * site used it, so making it required removes the trap rather than documenting
   * it.
   */
  fun startCapture(onSamples: (FloatArray, Int) -> Unit): Boolean {
    if (capturing) {
      return false
    }

    val sampleRate = 16000
    val minBufferSize = AudioRecord.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    if (minBufferSize <= 0) {
      return false
    }

    val record = AudioRecord(
      MediaRecorder.AudioSource.VOICE_RECOGNITION,
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      minBufferSize * 2
    )
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      return false
    }

    capturing = true
    audioRecord = record
    workerThread = Thread {
      val shortBuffer = ShortArray(minBufferSize / 2)
      record.startRecording()
      while (capturing) {
        val read = record.read(shortBuffer, 0, shortBuffer.size)
        if (read <= 0) {
          continue
        }

        val floatBuffer = FloatArray(read)
        for (index in 0 until read) {
          floatBuffer[index] = shortBuffer[index] / 32768.0f
        }

        onSamples(floatBuffer, sampleRate)
      }
    }.apply {
      name = "VoiceActivatorAudioCapture"
      isDaemon = true
      start()
    }

    return true
  }

  /**
   * Stop capture and release the AudioRecord.
   *
   * Returns false when the worker thread did not exit in time. That matters
   * because the caller frees the native detector as soon as this returns true:
   * releasing the AudioRecord, or freeing the detector, while the worker is
   * still inside record.read() and about to call processSamples() is a
   * use-after-free in the ONNX runtime. Reporting the failure lets the caller
   * keep the detector alive rather than destroy it underneath a live reader.
   */
  fun stopCapture(): Boolean {
    if (!capturing) {
      return true
    }
    capturing = false

    // stop() unblocks a pending read(), so the worker can observe `capturing`.
    runCatching {
      audioRecord?.stop()
    }

    val worker = workerThread
    val stopped = if (worker == null || worker === Thread.currentThread()) {
      true
    } else {
      runCatching { worker.join(JOIN_TIMEOUT_MS) }.isSuccess && !worker.isAlive
    }

    if (!stopped) {
      // Deliberately leak the AudioRecord rather than release it under a live
      // reader. The worker exits on its own once read() returns, and a leaked
      // recorder is recoverable; a native use-after-free is not.
      return false
    }

    audioRecord?.release()
    audioRecord = null
    workerThread = null
    return true
  }

  private companion object {
    const val JOIN_TIMEOUT_MS = 1_500L
  }

  fun isCapturing(): Boolean = capturing
}
