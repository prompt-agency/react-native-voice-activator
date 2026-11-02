package com.voiceactivator

import android.Manifest
import android.content.pm.PackageManager
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.k2fsa.sherpa.onnx.WaveReader
import com.voiceactivator.Engines.SherpaOnnx.SherpaOnnxAssetRequest
import com.voiceactivator.Engines.SherpaOnnx.SherpaOnnxDetector
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.bridge.Arguments
import com.voiceactivator.Engines.SherpaOnnx.SherpaOnnxDenoiser
import com.voiceactivator.Engines.SherpaOnnx.SherpaOnnxSpeakerEmbedding
import com.voiceactivator.Engines.SherpaOnnx.SherpaOnnxTTS
import com.voiceactivator.Runtime.AudioPlayback
import com.voiceactivator.Runtime.AudioRouteMonitor
import com.voiceactivator.Runtime.ServiceLauncher
import com.voiceactivator.Runtime.VADCapture
import com.voiceactivator.Runtime.WakeWordRuntimeCoordinator
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@ReactModule(name = VoiceActivatorModule.NAME)
class VoiceActivatorModule(reactContext: ReactApplicationContext) :
  NativeVoiceActivatorSpec(reactContext) {
  private val audioPlayback = AudioPlayback(reactContext.applicationContext)
  private val vadCapture = VADCapture()
  private val speakerEmbedding = SherpaOnnxSpeakerEmbedding(reactContext.assets)
  private val denoiser = SherpaOnnxDenoiser(reactContext.assets)
  private val tts = SherpaOnnxTTS()
  private val externalDetectors = ConcurrentHashMap<String, SherpaOnnxDetector>()
  @Volatile private var isSynthesizing = false
  private var speakerModelPath: String? = null
  private var denoiserModelPath: String? = null
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
      speakerModelPath = options?.getString("speakerModelPath")
      denoiserModelPath = options?.getString("denoiserModelPath")
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
      val detectors = externalDetectors.values.toList()
      externalDetectors.clear()
      detectors.forEach { detector -> synchronized(detector) { detector.release() } }
      speakerEmbedding.release()
      denoiser.release()
      tts.release()
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
    // Unguarded, a throw from inside playWav (MediaPlayer.release() can throw)
    // propagated out of the bridge call and the promise never settled, so
    // `await playWav()` hung forever.
    try {
      audioPlayback.playWav(
        filePath,
        onComplete = { promise.resolve(null) },
        onError = { msg -> promise.reject("wav_playback_failed", msg) }
      )
    } catch (error: Throwable) {
      promise.reject("wav_playback_failed", error.message, error)
    }
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
    if (isSynthesizing) {
      promise.reject("tts_busy", "TTS synthesis already in progress")
      return
    }
    isSynthesizing = true

    Thread {
      try {
        val modelPath   = options?.getString("modelPath")   ?: throw IllegalArgumentException("modelPath is required")
        val tokensPath  = options?.getString("tokensPath")  ?: throw IllegalArgumentException("tokensPath is required")
        val dataDir     = options?.getString("dataDir")     ?: throw IllegalArgumentException("dataDir is required")
        val text        = options?.getString("text")        ?: throw IllegalArgumentException("text is required")
        val speakerId   = options?.getInt("speakerId")      ?: 0
        val speed       = options?.getDouble("speed")?.toFloat()       ?: 1.0f
        val noiseScale  = options?.getDouble("noiseScale")?.toFloat()  ?: 0.667f
        val noiseScaleW = options?.getDouble("noiseScaleW")?.toFloat() ?: 0.8f
        val lengthScale = options?.getDouble("lengthScale")?.toFloat() ?: 1.0f

        val wavPath = tts.synthesize(
          text        = text,
          modelPath   = modelPath,
          tokensPath  = tokensPath,
          dataDir     = dataDir,
          speakerId   = speakerId,
          speed       = speed,
          noiseScale  = noiseScale,
          noiseScaleW = noiseScaleW,
          lengthScale = lengthScale,
        )

        audioPlayback.playWav(
          filePath   = wavPath,
          onComplete = { java.io.File(wavPath).delete(); isSynthesizing = false; promise.resolve(null) },
          onError    = { msg -> java.io.File(wavPath).delete(); isSynthesizing = false; promise.reject("tts_playback_failed", msg) },
        )
      } catch (error: Throwable) {
        isSynthesizing = false
        promise.reject("tts_synthesis_failed", error.message, error)
      }
    }.start()
  }

  // ---------------------------------------------------------------------------
  // Speaker embedding + denoiser bridge methods (BRIDGE-01 through BRIDGE-06, SPOOF-01)
  // ---------------------------------------------------------------------------

  private fun ensureSpeakerEngine() {
    val path = speakerModelPath
      ?: throw IllegalStateException("speakerModelPath not set in initialize() options")
    speakerEmbedding.initialize(path)
  }

  private fun ensureDenoiser() {
    val path = denoiserModelPath
      ?: throw IllegalStateException("denoiserModelPath not set in initialize() options")
    denoiser.initialize(path)
  }

  // BRIDGE-01
  override fun extractSpeakerEmbedding(pcmBase64: String, sampleRate: Double, promise: Promise) {
    try {
      ensureSpeakerEngine()
      val result = speakerEmbedding.extractEmbedding(pcmBase64, sampleRate.toInt())
      promise.resolve(result)
    } catch (error: Throwable) {
      promise.reject("extract_embedding_failed", error.message, error)
    }
  }

  // BRIDGE-02
  override fun registerSpeaker(name: String, embeddingBase64: String, promise: Promise) {
    try {
      ensureSpeakerEngine()
      val success = speakerEmbedding.registerSpeaker(name, embeddingBase64)
      if (!success) {
        promise.reject("register_speaker_failed", "Failed to register speaker '$name'")
        return
      }
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("register_speaker_failed", error.message, error)
    }
  }

  // BRIDGE-03
  override fun verifySpeaker(name: String, embeddingBase64: String, threshold: Double, promise: Promise) {
    try {
      ensureSpeakerEngine()
      val result = speakerEmbedding.verifySpeaker(name, embeddingBase64, threshold.toFloat())
      val map = Arguments.createMap()
      map.putBoolean("matched", result["matched"] as Boolean)
      map.putDouble("score", result["score"] as Double)
      promise.resolve(map)
    } catch (error: Throwable) {
      promise.reject("verify_speaker_failed", error.message, error)
    }
  }

  // BRIDGE-04
  override fun identifySpeaker(embeddingBase64: String, threshold: Double, promise: Promise) {
    try {
      ensureSpeakerEngine()
      val result = speakerEmbedding.identifySpeaker(embeddingBase64, threshold.toFloat())
      val map = Arguments.createMap()
      val name = result["name"] as? String
      if (name != null) {
        map.putString("name", name)
      } else {
        map.putNull("name")
      }
      map.putDouble("score", result["score"] as Double)
      promise.resolve(map)
    } catch (error: Throwable) {
      promise.reject("identify_speaker_failed", error.message, error)
    }
  }

  // BRIDGE-05
  override fun clearSpeakers(promise: Promise) {
    try {
      speakerEmbedding.clearSpeakers()
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("clear_speakers_failed", error.message, error)
    }
  }

  // BRIDGE-06
  override fun denoiseAudio(pcmBase64: String, sampleRate: Double, promise: Promise) {
    try {
      ensureDenoiser()
      val result = denoiser.denoise(pcmBase64, sampleRate.toInt())
      promise.resolve(result)
    } catch (error: Throwable) {
      promise.reject("denoise_failed", error.message, error)
    }
  }


  // ─── Offline evaluation (WAKE-EVAL) ─────────────────────────────────────────

  /**
   * Run the detector over a WAV file and report every detection with its offset.
   *
   * Builds its own spotter rather than reusing the live one, so calling this
   * never disturbs a running detection session — and so a sensitivity sweep can
   * run many passes over the same corpus without restarting anything.
   */
  override fun evaluateWavFile(options: ReadableMap, promise: Promise) {
    try {
      val filePath = options.getString("filePath")
        ?: throw IllegalArgumentException("evaluateWavFile requires a filePath.")

      val wave = WaveReader.readWave(filePath)
        ?: throw IllegalArgumentException("Could not read a WAV file at $filePath.")

      val sensitivity =
        if (options.hasKey("sensitivity")) options.getDouble("sensitivity") else 0.5

      val detections = Arguments.createArray()
      var cursorSamples = 0L

      val detector = SherpaOnnxDetector(
        context = reactApplicationContext.applicationContext,
        onDetected = { keyword ->
          detections.pushMap(
            Arguments.createMap().apply {
              putString("keyword", keyword)
              // Offset of the END of the chunk that produced the detection: the
              // spotter does not report where inside a chunk it fired, so this is
              // an upper bound. CHUNK_SAMPLES keeps that bound tight.
              putDouble("atMs", cursorSamples * 1000.0 / wave.sampleRate)
            }
          )
        },
      )

      detector.initialize(
        sensitivity = sensitivity,
        configuration = SherpaOnnxAssetRequest(
          modelAssetKey = options.getString("modelPath"),
          keywordAssetKey = options.getString("keywordsPath"),
        ),
      )

      // Feed in chunks so offsets are meaningful; one big buffer would report
      // every detection at the end of the file.
      val chunk = CHUNK_SAMPLES
      var offset = 0
      while (offset < wave.samples.size) {
        val end = minOf(offset + chunk, wave.samples.size)
        cursorSamples = end.toLong()
        detector.processSamples(
          wave.samples.copyOfRange(offset, end),
          wave.sampleRate,
        )
        offset = end
      }

      detector.release()

      promise.resolve(
        Arguments.createMap().apply {
          putArray("detections", detections)
          putDouble("durationMs", wave.samples.size * 1000.0 / wave.sampleRate)
          putInt("sampleRate", wave.sampleRate)
        }
      )
    } catch (error: Throwable) {
      promise.reject("wav_evaluation_failed", error.message, error)
    }
  }

  override fun createExternalDetector(options: ReadableMap, promise: Promise) {
    try {
      val modelPath = options.getString("modelPath")
        ?: throw IllegalArgumentException("modelPath is required.")
      val keywordsPath = options.getString("keywordsPath")
        ?: throw IllegalArgumentException("keywordsPath is required.")
      val sensitivity = options.getDouble("sensitivity")
      require(sensitivity.isFinite() && sensitivity in 0.0..1.0) {
        "sensitivity must be between 0 and 1."
      }
      val detector = SherpaOnnxDetector(
        context = reactApplicationContext.applicationContext,
        onDetected = {},
      )
      try {
        detector.initialize(
          sensitivity,
          SherpaOnnxAssetRequest(modelPath, keywordsPath),
        )
      } catch (error: Throwable) {
        detector.release()
        throw error
      }
      val id = UUID.randomUUID().toString()
      externalDetectors[id] = detector
      promise.resolve(id)
    } catch (error: Throwable) {
      promise.reject("external_detector_create_failed", error.message, error)
    }
  }

  override fun processExternalDetectorFrame(
    detectorId: String,
    pcmBase64: String,
    sampleRate: Double,
    promise: Promise,
  ) {
    try {
      require(sampleRate == 16000.0) { "External audio must be 16 kHz." }
      val bytes = Base64.decode(pcmBase64, Base64.NO_WRAP)
      require(bytes.isNotEmpty() && bytes.size % 4 == 0 && bytes.size <= 64000) {
        "External audio must contain 1 to 16000 float32 samples."
      }
      val floats = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
      val samples = FloatArray(floats.remaining())
      floats.get(samples)
      require(samples.all { it.isFinite() && it in -1.0f..1.0f }) {
        "External audio samples must be finite and between -1 and 1."
      }
      val detector = externalDetectors[detectorId]
        ?: throw IllegalStateException("External detector is disposed or unknown.")
      val keyword = synchronized(detector) {
        require(externalDetectors[detectorId] === detector) {
          "External detector is disposed or unknown."
        }
        detector.processSamples(samples, 16000)
      }
      promise.resolve(Arguments.createMap().apply { putString("keyword", keyword) })
    } catch (error: Throwable) {
      promise.reject("external_detector_frame_failed", error.message, error)
    }
  }

  override fun resetExternalDetector(detectorId: String, promise: Promise) {
    try {
      val detector = externalDetectors[detectorId]
        ?: throw IllegalStateException("External detector is disposed or unknown.")
      synchronized(detector) {
        require(externalDetectors[detectorId] === detector) {
          "External detector is disposed or unknown."
        }
        detector.reset()
      }
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("external_detector_reset_failed", error.message, error)
    }
  }

  override fun disposeExternalDetector(detectorId: String, promise: Promise) {
    try {
      val detector = externalDetectors.remove(detectorId)
      if (detector != null) synchronized(detector) { detector.release() }
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("external_detector_dispose_failed", error.message, error)
    }
  }

  // SPOOF-01 (stub — no Sherpa-ONNX anti-spoofing API available in v1.12.29)
  override fun detectSpoofing(pcmBase64: String, sampleRate: Double, promise: Promise) {
    // Stub: returns 0.0 (not a spoof) until anti-spoofing model is available.
    promise.resolve(0.0)
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

    /** ~64 ms at 16 kHz: small enough for usable detection offsets. */
    private const val CHUNK_SAMPLES = 1024
  }
}
