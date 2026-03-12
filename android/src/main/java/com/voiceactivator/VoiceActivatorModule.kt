package com.voiceactivator

import android.Manifest
import android.content.pm.PackageManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.module.annotations.ReactModule
import com.voiceactivator.Runtime.AudioRouteMonitor
import com.voiceactivator.Runtime.ServiceLauncher
import com.voiceactivator.Runtime.WakeWordRuntimeCoordinator

@ReactModule(name = VoiceActivatorModule.NAME)
class VoiceActivatorModule(reactContext: ReactApplicationContext) :
  NativeVoiceActivatorSpec(reactContext) {
  private val runtimeCoordinator = WakeWordRuntimeCoordinator(
    applicationContext = reactContext.applicationContext,
    serviceLauncher = ServiceLauncher(reactContext.applicationContext),
    audioRouteMonitor = AudioRouteMonitor(reactContext.applicationContext),
    hasVisibleActivityContext = {
      reactApplicationContext.currentActivity != null
    },
    hasRecordAudioPermission = {
      reactApplicationContext.checkSelfPermission(
        Manifest.permission.RECORD_AUDIO
      ) == PackageManager.PERMISSION_GRANTED
    },
  ).apply {
    wakeWordDetectedHandler = { payload ->
      emitEvent(NATIVE_WAKE_WORD_DETECTED_EVENT, payload)
    }
    runtimeStatusHandler = { payload ->
      emitEvent(NATIVE_RUNTIME_STATE_CHANGED_EVENT, payload)
    }
    runtimeErrorHandler = { payload ->
      emitEvent(NATIVE_RUNTIME_ERROR_EVENT, payload)
    }
    interruptionHandler = { payload ->
      emitEvent(NATIVE_RUNTIME_INTERRUPTION_EVENT, payload)
    }
    audioRouteChangedHandler = { payload ->
      emitEvent(NATIVE_RUNTIME_AUDIO_ROUTE_CHANGED_EVENT, payload)
    }
  }

  override fun getName(): String = NAME

  override fun initialize(options: ReadableMap?, promise: Promise) {
    try {
      runtimeCoordinator.initialize(options)
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("runtime_initialize_failed", error.message, error)
    }
  }

  override fun startDetection(promise: Promise) {
    try {
      runtimeCoordinator.startDetection()
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("runtime_start_failed", error.message, error)
    }
  }

  override fun stopDetection(promise: Promise) {
    try {
      runtimeCoordinator.stopDetection()
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("runtime_stop_failed", error.message, error)
    }
  }

  override fun getStatus(): WritableMap = runtimeCoordinator.currentStatus()

  override fun dispose(promise: Promise) {
    try {
      runtimeCoordinator.dispose()
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("runtime_dispose_failed", error.message, error)
    }
  }

  override fun addListener(eventName: String?) = Unit

  override fun removeListeners(count: Double) = Unit

  private fun emitEvent(eventName: String, payload: WritableMap) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, payload)
  }

  companion object {
    const val NAME = "VoiceActivator"
    private const val NATIVE_WAKE_WORD_DETECTED_EVENT =
      "VoiceActivatorOnWakeWordDetected"
    private const val NATIVE_RUNTIME_STATE_CHANGED_EVENT =
      "VoiceActivatorOnRuntimeStateChanged"
    private const val NATIVE_RUNTIME_ERROR_EVENT = "VoiceActivatorOnRuntimeError"
    private const val NATIVE_RUNTIME_INTERRUPTION_EVENT =
      "VoiceActivatorOnRuntimeInterruption"
    private const val NATIVE_RUNTIME_AUDIO_ROUTE_CHANGED_EVENT =
      "VoiceActivatorOnAudioRouteChanged"
  }
}
