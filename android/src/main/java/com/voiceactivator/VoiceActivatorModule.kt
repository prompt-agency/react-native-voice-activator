package com.voiceactivator

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import java.time.Instant

@ReactModule(name = VoiceActivatorModule.NAME)
class VoiceActivatorModule(reactContext: ReactApplicationContext) :
  NativeVoiceActivatorSpec(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())
  private var detectionRunnable: Runnable? = null
  private var status: WritableMap = createStatus(
    state = "idle",
    isListening = false,
    canStart = false
  )
  private var detectedPhrase = DEFAULT_DETECTED_PHRASE

  override fun getName(): String = NAME

  override fun initialize(options: ReadableMap?, promise: Promise) {
    clearDetectionRunnable()
    detectedPhrase = DEFAULT_DETECTED_PHRASE

    status = createStatus(
      state = "ready",
      isListening = false,
      canStart = true
    )
    promise.resolve(null)
  }

  override fun startDetection(promise: Promise) {
    if (!status.getBoolean("canStart")) {
      promise.reject(
        "runtime_not_ready",
        "VoiceActivator.startDetection requires initialize() to complete before detection can begin."
      )
      return
    }

    status = createStatus(
      state = "running",
      isListening = true,
      canStart = false
    )

    clearDetectionRunnable()
    val nextDetection = Runnable {
      if (status.getString("state") != "running") {
        detectionRunnable = null
        return@Runnable
      }

      val payload = Arguments.createMap().apply {
        putString("detectedPhrase", detectedPhrase)
        putString("detectedAt", Instant.now().toString())
      }

      reactApplicationContext.emitDeviceEvent(NATIVE_WAKE_WORD_DETECTED_EVENT, payload)
      detectionRunnable = null
    }

    detectionRunnable = nextDetection
    mainHandler.post(nextDetection)
    promise.resolve(null)
  }

  override fun stopDetection(promise: Promise) {
    clearDetectionRunnable()

    val currentState = status.getString("state")
    val canStart =
      currentState == "running" ||
        currentState == "starting" ||
        currentState == "ready" ||
        currentState == "stopped"
    status = createStatus(
      state = if (canStart) "stopped" else "idle",
      isListening = false,
      canStart = canStart
    )

    promise.resolve(null)
  }

  override fun getStatus(): WritableMap = status.copy()

  override fun dispose(promise: Promise) {
    clearDetectionRunnable()
    status = createStatus(
      state = "idle",
      isListening = false,
      canStart = false
    )
    promise.resolve(null)
  }

  override fun addListener(eventName: String?) = Unit

  override fun removeListeners(count: Double) = Unit

  private fun createStatus(
    state: String,
    isListening: Boolean,
    canStart: Boolean
  ): WritableMap =
    Arguments.createMap().apply {
      putString("state", state)
      putBoolean("isAvailable", true)
      putBoolean("isListening", isListening)
      putBoolean("canStart", canStart)
      putNull("lastError")
    }

  private fun WritableMap.copy(): WritableMap =
    Arguments.createMap().apply {
      merge(this@copy)
    }

  private fun clearDetectionRunnable() {
    detectionRunnable?.let(mainHandler::removeCallbacks)
    detectionRunnable = null
  }

  companion object {
    const val NAME = "VoiceActivator"
    private const val NATIVE_WAKE_WORD_DETECTED_EVENT = "VoiceActivatorOnWakeWordDetected"
    private const val DEFAULT_DETECTED_PHRASE = "hey react native"
  }
}
