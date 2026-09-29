package com.voiceactivator.Runtime

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build

internal class ServiceLauncher(
  private val applicationContext: Context? = null,
) {
  private var ownsForegroundRuntime = false

  fun startRuntimeOwnership(): Boolean {
    if (ownsForegroundRuntime) {
      return false
    }

    val context = applicationContext
    if (context == null) {
      ownsForegroundRuntime = true
      return true
    }

    val startResult = runCatching {
      val serviceIntent = foregroundServiceIntent(context)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(serviceIntent)
      } else {
        context.startService(serviceIntent)
      }
    }.getOrNull()

    if (startResult == null) {
      return false
    }

    ownsForegroundRuntime = true
    return true
  }

  fun stopRuntimeOwnership(): Boolean {
    if (!ownsForegroundRuntime) {
      return true
    }

    val context = applicationContext
    if (context == null) {
      ownsForegroundRuntime = false
      return true
    }

    val stopSucceeded = runCatching {
      context.stopService(foregroundServiceIntent(context))
    }.getOrElse { false }

    // stopService() returns false when the service was not running, which is
    // indistinguishable from "already stopped" — and keeping ownership latched in
    // that case left the flag stuck true with no path back down short of a full
    // dispose(), while the persistent notification may have been gone already.
    // Ownership is released either way; the return value still reports the
    // outcome so the caller can surface it.
    ownsForegroundRuntime = false

    return stopSucceeded
  }

  fun hasRuntimeOwnership(): Boolean = ownsForegroundRuntime

  private fun foregroundServiceIntent(context: Context): Intent =
    Intent(context, WakeWordForegroundService::class.java)
}
