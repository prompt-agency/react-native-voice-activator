package com.voiceactivator.Runtime

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap

private const val PLATFORM = "android"

internal class WakeWordRuntimeCoordinator(
  private val runtimeStateStore: RuntimeStateStore = RuntimeStateStore(
    initialStatus = mapOf(
      "state" to "idle",
      "isAvailable" to true,
      "isListening" to false,
      "canStart" to false,
      "lastError" to null,
    )
  ),
  private val serviceLauncher: ServiceLauncher = ServiceLauncher(),
  private val audioCaptureThread: AudioCaptureThread = AudioCaptureThread(),
  private val audioRouteMonitor: AudioRouteMonitor = AudioRouteMonitor(),
) {
  var runtimeStatusHandler: ((WritableMap) -> Unit)? = null
  var runtimeErrorHandler: ((WritableMap) -> Unit)? = null
  var interruptionHandler: ((WritableMap) -> Unit)? = null

  fun currentStatus(): WritableMap = runtimeStateStore.currentStatus()

  fun initialize(@Suppress("UNUSED_PARAMETER") options: ReadableMap?) {
    if (audioCaptureThread.isCapturing() || serviceLauncher.hasRuntimeOwnership()) {
      if (!stopOwnedRuntime()) {
        throw platformFailure(
          code = "runtime_teardown_failed",
          message = "Android runtime ownership could not be reset during initialize().",
          canStart = false,
        )
      }
    }

    if (hasInconsistentRuntimeOwnership()) {
      surfaceUnsupportedState(
        "Android runtime ownership became inconsistent during initialize()."
      )
      throw IllegalStateException(
        "Android runtime ownership became inconsistent during initialize()."
      )
    }

    setStatus(
      mapOf(
        "state" to "ready",
        "isAvailable" to true,
        "isListening" to false,
        "canStart" to true,
        "lastError" to null,
      )
    )
  }

  fun startDetection() {
    val status = currentStatus()
    val canStart = status.getBoolean("canStart")

    if (hasInconsistentRuntimeOwnership()) {
      surfaceUnsupportedState(
        "Android runtime ownership is inconsistent and cannot start detection."
      )
      throw IllegalStateException(
        "Android runtime ownership is inconsistent and cannot start detection."
      )
    }

    if (!canStart) {
      throw lifecycleFailure(
        code = "runtime_not_ready",
        message = "VoiceActivator.startDetection requires initialize() to complete before detection can begin.",
        canStart = false,
      )
    }

    setStatus(
      mapOf(
        "state" to "starting",
        "isAvailable" to true,
        "isListening" to false,
        "canStart" to false,
        "lastError" to null,
      )
    )

    if (!serviceLauncher.startRuntimeOwnership()) {
      throw platformFailure(
        code = "runtime_ownership_unavailable",
        message = "Android foreground runtime ownership could not be established.",
        canStart = true,
      )
    }

    if (!audioCaptureThread.startCapture()) {
      serviceLauncher.stopRuntimeOwnership()
      throw platformFailure(
        code = "audio_capture_unavailable",
        message = "Android audio capture could not be started for the runtime skeleton.",
        canStart = true,
      )
    }

    audioRouteMonitor.startMonitoring()

    setStatus(
      mapOf(
        "state" to "running",
        "isAvailable" to true,
        "isListening" to true,
        "canStart" to false,
        "lastError" to null,
      )
    )
  }

  fun stopDetection() {
    val status = currentStatus()
    val currentState = status.getString("state")
    val shouldRemainStartable =
      currentState == "running" ||
        currentState == "starting" ||
        currentState == "ready" ||
        currentState == "stopped" ||
        currentState == "interrupted"
    val nextState = if (shouldRemainStartable) "stopped" else "idle"

    if (!stopOwnedRuntime()) {
      throw platformFailure(
        code = "runtime_teardown_failed",
        message = "Android runtime ownership could not be released during stopDetection().",
        canStart = shouldRemainStartable,
      )
    }

    setStatus(
      mapOf(
        "state" to nextState,
        "isAvailable" to true,
        "isListening" to false,
        "canStart" to shouldRemainStartable,
        "lastError" to null,
      )
    )
  }

  fun dispose() {
    if (!stopOwnedRuntime()) {
      throw platformFailure(
        code = "runtime_teardown_failed",
        message = "Android runtime ownership could not be released during dispose().",
        canStart = false,
      )
    }

    setStatus(
      mapOf(
        "state" to "idle",
        "isAvailable" to true,
        "isListening" to false,
        "canStart" to false,
        "lastError" to null,
      )
    )
  }

  fun surfaceUnsupportedState(reason: String) {
    stopOwnedRuntime()
    val payload = Arguments.createMap().apply {
      putString("reason", reason)
      putBoolean("recoverable", false)
    }
    interruptionHandler?.invoke(payload)

    setStatus(
      mapOf(
        "state" to "unsupported",
        "isAvailable" to false,
        "isListening" to false,
        "canStart" to false,
        "reason" to reason,
        "lastError" to createError(
          category = "platform",
          code = "runtime_unsupported",
          message = reason,
          recoverable = false,
        ),
      )
    )
  }

  private fun stopOwnedRuntime(): Boolean {
    val captureStopped = audioCaptureThread.stopCapture()
    val ownershipReleased = serviceLauncher.stopRuntimeOwnership()
    audioRouteMonitor.stopMonitoring()
    return captureStopped && ownershipReleased && !hasInconsistentRuntimeOwnership()
  }

  private fun hasInconsistentRuntimeOwnership(): Boolean =
    audioCaptureThread.isCapturing() != serviceLauncher.hasRuntimeOwnership()
  }

  private fun lifecycleFailure(
    code: String,
    message: String,
    canStart: Boolean,
  ): IllegalStateException {
    setErrorState(
      category = "lifecycle",
      code = code,
      message = message,
      canStart = canStart,
    )
    return IllegalStateException(message)
  }

  private fun platformFailure(
    code: String,
    message: String,
    canStart: Boolean,
  ): IllegalStateException {
    setErrorState(
      category = "platform",
      code = code,
      message = message,
      canStart = canStart,
    )
    return IllegalStateException(message)
  }

  private fun setErrorState(
    category: String,
    code: String,
    message: String,
    canStart: Boolean,
  ) {
    val error = createError(
      category = category,
      code = code,
      message = message,
      recoverable = canStart,
    )

    setStatus(
      mapOf(
        "state" to "error",
        "isAvailable" to true,
        "isListening" to false,
        "canStart" to canStart,
        "lastError" to error,
      )
    )

    runtimeErrorHandler?.invoke(error.toWritableMap())
  }

  private fun setStatus(nextStatus: Map<String, Any?>) {
    runtimeStateStore.updateStatus(nextStatus)
    runtimeStatusHandler?.invoke(runtimeStateStore.currentStatus())
  }

  private fun createError(
    category: String,
    code: String,
    message: String,
    recoverable: Boolean,
  ): Map<String, Any?> =
    mapOf(
      "category" to category,
      "code" to code,
      "message" to message,
      "recoverable" to recoverable,
      "platform" to PLATFORM,
    )

  private fun Map<String, Any?>.toWritableMap(): WritableMap =
    Arguments.createMap().apply {
      for ((key, value) in this@toWritableMap) {
        when (value) {
          null -> putNull(key)
          is String -> putString(key, value)
          is Boolean -> putBoolean(key, value)
          is Int -> putInt(key, value)
          is Double -> putDouble(key, value)
          is Float -> putDouble(key, value.toDouble())
          else -> putString(key, value.toString())
        }
      }
    }
}
