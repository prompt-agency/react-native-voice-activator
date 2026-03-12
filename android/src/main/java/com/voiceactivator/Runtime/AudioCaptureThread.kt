package com.voiceactivator.Runtime

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder

internal class AudioCaptureThread {
  private var capturing = false
  private var audioRecord: AudioRecord? = null
  private var workerThread: Thread? = null

  fun startCapture(onSamples: ((FloatArray, Int) -> Unit)? = null): Boolean {
    if (capturing) {
      return false
    }

    if (onSamples == null) {
      capturing = true
      return true
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

  fun stopCapture(): Boolean {
    if (!capturing) {
      return true
    }
    capturing = false
    runCatching {
      audioRecord?.stop()
    }
    runCatching {
      workerThread?.join(500)
    }
    audioRecord?.release()
    audioRecord = null
    workerThread = null
    return true
  }

  fun isCapturing(): Boolean = capturing
}
