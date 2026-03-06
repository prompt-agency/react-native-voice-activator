package com.voiceactivator.Runtime

internal class AudioCaptureThread {
  private var capturing = false

  fun startCapture(): Boolean {
    if (capturing) {
      return false
    }
    capturing = true
    return true
  }

  fun stopCapture(): Boolean {
    if (!capturing) {
      return true
    }
    capturing = false
    return true
  }

  fun isCapturing(): Boolean = capturing
}
