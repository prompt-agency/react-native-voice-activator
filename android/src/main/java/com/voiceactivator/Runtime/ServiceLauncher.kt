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

    if (stopSucceeded) {
      ownsForegroundRuntime = false
    }

    return stopSucceeded
  }

  fun hasRuntimeOwnership(): Boolean = ownsForegroundRuntime

  private fun foregroundServiceIntent(context: Context): Intent =
    Intent(context, WakeWordForegroundService::class.java)
}
