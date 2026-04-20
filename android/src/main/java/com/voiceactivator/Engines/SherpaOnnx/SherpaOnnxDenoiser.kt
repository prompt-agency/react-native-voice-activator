package com.voiceactivator.Engines.SherpaOnnx

import android.content.res.AssetManager
import android.util.Base64
import com.k2fsa.sherpa.onnx.OfflineSpeechDenoiser
import com.k2fsa.sherpa.onnx.OfflineSpeechDenoiserConfig
import com.k2fsa.sherpa.onnx.OfflineSpeechDenoiserModelConfig
import com.k2fsa.sherpa.onnx.OfflineSpeechDenoiserGtcrnModelConfig
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Kotlin wrapper for Sherpa-ONNX speech denoising (noise suppression).
 *
 * Caches the [OfflineSpeechDenoiser] instance across calls. The denoiser is only created
 * when [initialize] is called, and reused until [release] is called or a different model
 * path is requested.
 *
 * Base64 encoding/decoding uses LITTLE_ENDIAN byte order to match the iOS convention
 * (iOS NSData raw bytes are little-endian on ARM).
 */
internal class SherpaOnnxDenoiser(private val assetManager: AssetManager) {

  private var denoiser: OfflineSpeechDenoiser? = null
  private var loadedModelPath: String? = null

  /**
   * Initializes the denoiser with the given model path.
   * No-ops if already initialized with the same model path.
   */
  fun initialize(modelPath: String) {
    if (loadedModelPath == modelPath && denoiser != null) {
      return
    }
    release()
    val config = OfflineSpeechDenoiserConfig(
      model = OfflineSpeechDenoiserModelConfig(
        gtcrn = OfflineSpeechDenoiserGtcrnModelConfig(model = modelPath),
        numThreads = 1,
        debug = false,
        provider = "cpu",
      ),
    )
    denoiser = OfflineSpeechDenoiser(assetManager, config)
    loadedModelPath = modelPath
  }

  /**
   * Denoises PCM audio data and returns the enhanced audio as base64.
   *
   * @param pcmBase64 Base64-encoded 32-bit float PCM audio (LITTLE_ENDIAN)
   * @param sampleRate Audio sample rate in Hz
   * @return Base64-encoded denoised FloatArray (LITTLE_ENDIAN)
   */
  fun denoise(pcmBase64: String, sampleRate: Int): String {
    val activeDenoiser = denoiser
      ?: throw IllegalStateException("SherpaOnnxDenoiser not initialized")

    val bytes = Base64.decode(pcmBase64, Base64.NO_WRAP)
    val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    val samples = FloatArray(bytes.size / 4) { buf.getFloat() }

    val result = activeDenoiser.run(samples, sampleRate)

    val outBytes = ByteBuffer.allocate(result.samples.size * 4)
      .order(ByteOrder.LITTLE_ENDIAN)
      .apply { result.samples.forEach { putFloat(it) } }
      .array()
    return Base64.encodeToString(outBytes, Base64.NO_WRAP)
  }

  /**
   * Releases all native resources. After calling this, [initialize] must be called again
   * before [denoise] can be used.
   */
  fun release() {
    denoiser?.release()
    denoiser = null
    loadedModelPath = null
  }
}
