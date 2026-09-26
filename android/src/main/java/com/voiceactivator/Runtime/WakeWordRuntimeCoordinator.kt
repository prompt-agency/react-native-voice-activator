package com.voiceactivator.Runtime

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.voiceactivator.Engines.SherpaOnnx.SherpaOnnxAssetRequest
import com.voiceactivator.Engines.SherpaOnnx.SherpaOnnxDetector
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val PLATFORM = "android"
private const val ANDROID_FOREGROUND_SERVICE_REASON =
  "Wake word detection is continuing in a supported Android foreground-service runtime."
private const val ANDROID_VISIBLE_CONTEXT_REQUIRED_REASON =
  "Android wake word detection must be started from a visible activity context so the foreground-service runtime can be established."
private const val ANDROID_AUDIO_PERMISSION_REQUIRED_REASON =
  "Android wake word detection requires RECORD_AUDIO permission before the foreground-service runtime can start."

internal class WakeWordRuntimeCoordinator(
  private val applicationContext: Context,
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
  private val hasVisibleActivityContext: () -> Boolean = { true },
  private val hasRecordAudioPermission: () -> Boolean = { true },
) {
  var wakeWordDetectedHandler: ((WritableMap) -> Unit)? = null
  var runtimeStatusHandler: ((WritableMap) -> Unit)? = null
  var runtimeErrorHandler: ((WritableMap) -> Unit)? = null
  var interruptionHandler: ((WritableMap) -> Unit)? = null
  var audioRouteChangedHandler: ((WritableMap) -> Unit)? = null
  private var detector: SherpaOnnxDetector? = null
  private var detectorAssetRequest = SherpaOnnxAssetRequest(
    modelAssetKey = null,
    keywordAssetKey = null,
  )
  private var detectorSensitivity = 0.5
  private var audioSuspendedForSecondaryCapture = false

  fun currentStatus(): WritableMap = runtimeStateStore.currentStatus()

  fun initialize(options: ReadableMap?) {
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
        reason = "Android runtime ownership became inconsistent during initialize().",
        code = "runtime_ownership_inconsistent",
      )
      throw IllegalStateException(
        "Android runtime ownership became inconsistent during initialize()."
      )
    }

    val engineConfig = options?.getMap("engineConfig")
    val sensitivity =
      engineConfig
        ?.takeIf { it.hasKey("sensitivity") }
        ?.getDouble("sensitivity")
        ?: 0.5
    detectorSensitivity = sensitivity
    detectorAssetRequest = SherpaOnnxAssetRequest(
      modelAssetKey = engineConfig.readOptionalString("assetKeys", "modelAssetKey"),
      keywordAssetKey = engineConfig.readOptionalString("assetKeys", "keywordAssetKey"),
      rawTextKeywords =
        engineConfig
          ?.takeIf { it.hasKey("keywordsAreRawText") }
          ?.getBoolean("keywordsAreRawText")
          ?: false,
    )

    // A second initialize() while detection is running would otherwise free the
    // native spotter while the capture worker is still inside read() and about
    // to call processSamples() on it — a use-after-free in the ONNX runtime.
    // Stop capture first, and refuse rather than free it underneath the reader.
    if (audioCaptureThread.isCapturing() && !audioCaptureThread.stopCapture()) {
      throw platformFailure(
        code = "capture_stop_failed",
        message =
          "Android wake word audio capture did not stop in time, so the engine " +
            "cannot be safely reconfigured. Call stopDetection() and retry.",
        canStart = false,
      )
    }

    releaseDetector()
    detector = SherpaOnnxDetector(
      context = applicationContext,
      onDetected = { detectedPhrase ->
        wakeWordDetectedHandler?.invoke(
          Arguments.createMap().apply {
            putString("detectedPhrase", detectedPhrase)
            putString(
              "detectedAt",
              SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
                .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                .format(Date())
            )
          }
        )
      },
    ).also {
      try {
        it.initialize(sensitivity, detectorAssetRequest)
      } catch (error: Throwable) {
        throw platformFailure(
          code = "sherpa_initialize_failed",
          message = error.message ?: "Sherpa-ONNX detector initialization failed.",
          canStart = false,
        )
      }
    }

    setStatus(
      mapOf(
        "state" to "ready",
        "isAvailable" to true,
        "isListening" to false,
        "canStart" to true,
        "reason" to null,
        "lastError" to null,
      )
    )
  }

  fun startDetection() {
    val status = currentStatus()
    val canStart = status.getBoolean("canStart")

    if (hasInconsistentRuntimeOwnership()) {
      surfaceUnsupportedState(
        reason = "Android runtime ownership is inconsistent and cannot start detection.",
        code = "runtime_ownership_inconsistent",
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

    if (!hasVisibleActivityContext()) {
      surfaceUnsupportedState(
        reason = ANDROID_VISIBLE_CONTEXT_REQUIRED_REASON,
        code = "foreground_service_visible_context_required",
      )
      throw IllegalStateException(ANDROID_VISIBLE_CONTEXT_REQUIRED_REASON)
    }

    if (!hasRecordAudioPermission()) {
      throw permissionFailure(
        code = "record_audio_permission_required",
        message = ANDROID_AUDIO_PERMISSION_REQUIRED_REASON,
        canStart = true,
      )
    }

    setStatus(
      mapOf(
        "state" to "starting",
        "isAvailable" to true,
        "isListening" to false,
        "canStart" to false,
        "reason" to null,
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

    try {
      detector?.ensureInitialized()
    } catch (error: Throwable) {
      throw platformFailure(
        code = "sherpa_initialize_failed",
        message = error.message ?: "Sherpa-ONNX detector initialization failed.",
        canStart = true,
      )
    }

    if (!audioCaptureThread.startCapture { samples, sampleRate ->
        try {
          detector?.processSamples(samples, sampleRate)
        } catch (error: Throwable) {
          setErrorState(
            category = "engine",
            code = "sherpa_decode_failed",
            message = error.message ?: "Sherpa-ONNX keyword detection failed.",
            canStart = true,
          )
        }
      }) {
      serviceLauncher.stopRuntimeOwnership()
      throw platformFailure(
        code = "audio_capture_unavailable",
        message = "Android audio capture could not be started for the runtime skeleton.",
        canStart = true,
      )
    }

    audioRouteMonitor.startMonitoring { route, previousRoute ->
      handleAudioRouteChanged(route, previousRoute)
    }

    setStatus(
      mapOf(
        "state" to "running",
        "isAvailable" to true,
        "isListening" to true,
        "canStart" to false,
        "reason" to ANDROID_FOREGROUND_SERVICE_REASON,
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
        "reason" to null,
        "lastError" to null,
      )
    )
    audioSuspendedForSecondaryCapture = false
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
        "reason" to null,
        "lastError" to null,
      )
    )
    audioSuspendedForSecondaryCapture = false
    releaseDetector()
  }

  fun pauseDetectionForSecondaryCapture() {
    val status = currentStatus()
    if (
      audioSuspendedForSecondaryCapture ||
      status.getString("state") != "running" ||
      !status.getBoolean("isListening")
    ) {
      return
    }

    if (!audioCaptureThread.stopCapture()) {
      throw platformFailure(
        code = "secondary_capture_pause_failed",
        message = "Android wake word audio capture could not be paused for VAD.",
        canStart = false,
      )
    }

    audioSuspendedForSecondaryCapture = true
    setStatus(
      mapOf(
        "state" to "running",
        "isAvailable" to true,
        "isListening" to false,
        "canStart" to false,
        "reason" to "Wake word capture is paused while VAD owns the microphone.",
        "lastError" to null,
      )
    )
  }

  fun resumeDetectionAfterSecondaryCapture() {
    if (!audioSuspendedForSecondaryCapture) {
      return
    }

    if (!audioCaptureThread.startCapture { samples, sampleRate ->
        try {
          detector?.processSamples(samples, sampleRate)
        } catch (error: Throwable) {
          setErrorState(
            category = "engine",
            code = "sherpa_decode_failed",
            message = error.message ?: "Sherpa-ONNX keyword detection failed.",
            canStart = true,
          )
        }
      }) {
      throw platformFailure(
        code = "secondary_capture_resume_failed",
        message = "Android wake word audio capture could not be resumed after VAD.",
        canStart = true,
      )
    }

    audioSuspendedForSecondaryCapture = false
    setStatus(
      mapOf(
        "state" to "running",
        "isAvailable" to true,
        "isListening" to true,
        "canStart" to false,
        "reason" to ANDROID_FOREGROUND_SERVICE_REASON,
        "lastError" to null,
      )
    )
  }

  fun surfaceUnsupportedState(
    reason: String,
    code: String = "runtime_unsupported",
  ) {
    val ownershipReleased = stopOwnedRuntime()
    // stopOwnedRuntime() returns false when the capture worker did not exit, in
    // which case the detector must stay alive — the worker still holds a
    // reference to it.
    if (ownershipReleased) {
      releaseDetector()
    }
    val payload = Arguments.createMap().apply {
      putString("reason", reason)
      putBoolean("recoverable", false)
    }
    interruptionHandler?.invoke(payload)

    if (!ownershipReleased) {
      setErrorState(
        category = "platform",
        code = "runtime_teardown_failed",
        message = "Android runtime ownership could not be released while surfacing an unsupported state.",
        canStart = false,
      )
      return
    }

    setStatus(
      mapOf(
        "state" to "unsupported",
        "isAvailable" to false,
        "isListening" to false,
        "canStart" to false,
        "reason" to reason,
        "lastError" to createError(
          category = "platform",
          code = code,
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

  private fun releaseDetector() {
    detector?.release()
    detector = null
  }

  private fun ReadableMap?.readOptionalString(parentKey: String, childKey: String): String? {
    val parent =
      this?.takeIf { it.hasKey(parentKey) }?.getMap(parentKey)
        ?: return null
    if (!parent.hasKey(childKey)) {
      return null
    }

    return parent.getString(childKey)?.takeIf { it.isNotBlank() }
  }

  private fun hasInconsistentRuntimeOwnership(): Boolean =
    audioCaptureThread.isCapturing() != serviceLauncher.hasRuntimeOwnership()

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

  private fun permissionFailure(
    code: String,
    message: String,
    canStart: Boolean,
  ): IllegalStateException {
    setErrorState(
      category = "permission",
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

  private fun handleAudioRouteChanged(route: String, previousRoute: String?) {
    val payload = Arguments.createMap().apply {
      putString("route", route)
      if (previousRoute != null) {
        putString("previousRoute", previousRoute)
      }
    }
    audioRouteChangedHandler?.invoke(payload)
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
