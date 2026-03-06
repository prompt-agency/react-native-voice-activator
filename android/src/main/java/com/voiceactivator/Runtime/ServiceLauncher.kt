package com.voiceactivator.Runtime

internal class ServiceLauncher {
  private var ownsForegroundRuntime = false

  fun startRuntimeOwnership(): Boolean {
    if (ownsForegroundRuntime) {
      return false
    }
    ownsForegroundRuntime = true
    return true
  }

  fun stopRuntimeOwnership(): Boolean {
    if (!ownsForegroundRuntime) {
      return true
    }
    ownsForegroundRuntime = false
    return true
  }

  fun hasRuntimeOwnership(): Boolean = ownsForegroundRuntime
}
