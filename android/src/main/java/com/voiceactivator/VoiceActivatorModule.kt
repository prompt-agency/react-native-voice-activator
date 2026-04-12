package com.voiceactivator

import android.Manifest
import android.content.pm.PackageManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.bridge.Arguments
import com.voiceactivator.Runtime.AudioPlayback
import com.voiceactivator.Runtime.AudioRouteMonitor
import com.voiceactivator.Runtime.ServiceLauncher
import com.voiceactivator.Runtime.VADCapture
import com.voiceactivator.Runtime.WakeWordRuntimeCoordinator

@ReactModule(name = VoiceActivatorModule.NAME)
class VoiceActivatorModule(reactContext: ReactApplicationContext) :
  NativeVoiceActivatorSpec(reactContext) {
  private val audioPlayback = AudioPlayback(reactContext.applicationContext)
  private val vadCapture = VADCapture()
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

  override fun playPCMChunk(pcmBase64: String, sampleRate: Double, promise: Promise) {
    try {
      audioPlayback.startStreaming(sampleRate.toInt())
      audioPlayback.writeChunk(pcmBase64)
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("playback_chunk_failed", error.message, error)
    }
  }

  override fun playWav(filePath: String, promise: Promise) {
    audioPlayback.playWav(
      filePath,
      onComplete = { promise.resolve(null) },
      onError = { msg -> promise.reject("wav_playback_failed", msg) }
    )
  }

  override fun stopPlayback(promise: Promise) {
    try {
      audioPlayback.stopStreaming()
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("stop_playback_failed", error.message, error)
    }
  }

  override fun setVolumeDucking(active: Boolean, promise: Promise) {
    // Ducking is managed automatically in AudioPlayback.startStreaming/stopStreaming
    // via requestAudioFocus(AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).
    // This method is exposed for API parity with iOS.
    promise.resolve(null)
  }

  override fun setAudioRoute(route: String, promise: Promise) {
    // Audio route selection via AVAudioSession is iOS-only.
    // This no-op stub satisfies the TurboModule codegen contract on Android.
    promise.resolve(null)
  }

  override fun startVADCapture(sampleRate: Double, promise: Promise) {
    try {
      // Pause Sherpa's AudioRecord so VAD owns the mic explicitly instead of
      // relying on undefined multi-recorder behavior across devices/API levels.
      runtimeCoordinator.pauseDetectionForSecondaryCapture()
      vadCapture.pcmFrameHandler = { base64PCM ->
        val params = Arguments.createMap()
        params.putString("pcm", base64PCM)
        emitEvent(NATIVE_VAD_PCM_FRAME_EVENT, params)
      }
      vadCapture.start(sampleRate.toInt())
      promise.resolve(null)
    } catch (error: Throwable) {
      runCatching { runtimeCoordinator.resumeDetectionAfterSecondaryCapture() }
      promise.reject("vad_capture_start_failed", error.message, error)
    }
  }

  override fun stopVADCapture(promise: Promise) {
    try {
      vadCapture.stop()
      runtimeCoordinator.resumeDetectionAfterSecondaryCapture()
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("vad_capture_stop_failed", error.message, error)
    }
  }

  override fun synthesizeTTS(options: ReadableMap?, promise: Promise) {
    // sherpa-onnx TTS is iOS-only in this release.
    promise.reject(
      "tts_platform_unsupported",
      "SherpaOnnxTTSAdapter: native TTS synthesis is iOS-only. " +
        "Use CustomTTSAdapter with onnxruntime-react-native on Android."
    )
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
    private const val NATIVE_VAD_PCM_FRAME_EVENT = "VoiceActivatorOnVADPCMFrame"
  }
}
