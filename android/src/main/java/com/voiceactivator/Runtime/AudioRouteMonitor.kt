package com.voiceactivator.Runtime

internal class AudioRouteMonitor {
  private var monitoring = false

  fun startMonitoring() {
    monitoring = true
  }

  fun stopMonitoring() {
    monitoring = false
  }

  fun isMonitoring(): Boolean = monitoring
}
