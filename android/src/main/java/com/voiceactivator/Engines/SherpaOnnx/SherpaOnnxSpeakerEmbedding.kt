package com.voiceactivator.Engines.SherpaOnnx

import android.content.res.AssetManager
import android.util.Base64
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractor
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractorConfig
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingManager
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Kotlin wrapper for Sherpa-ONNX speaker embedding extraction and manager operations.
 *
 * Caches the [SpeakerEmbeddingExtractor] and [SpeakerEmbeddingManager] instances across calls.
 * Both are only created when [initialize] is called, and reused until [release] is called or
 * a different model path is requested.
 *
 * Base64 encoding/decoding uses LITTLE_ENDIAN byte order to match the iOS convention
 * (iOS NSData raw bytes are little-endian on ARM).
 *
 * Score limitation: The Sherpa-ONNX AAR [SpeakerEmbeddingManager.search] returns only a name
 * string, not a continuous similarity score. Score values are best-effort approximations:
 * 1.0 if matched/found, 0.0 otherwise.
 */
internal class SherpaOnnxSpeakerEmbedding(private val assetManager: AssetManager) {

  private var extractor: SpeakerEmbeddingExtractor? = null
  private var manager: SpeakerEmbeddingManager? = null
  private var loadedModelPath: String? = null

  /**
   * Initializes the extractor and manager with the given model path.
   * No-ops if already initialized with the same model path.
   *
   * An absolute [modelPath] is treated as an on-disk model (e.g. downloaded at
   * runtime rather than bundled): the sherpa AAR constructor dispatches to
   * newFromFile() when assetManager is null, and to newFromAsset() otherwise.
   *
   * The existence check matters because sherpa aborts the entire process with
   * a fatal "Read binary file: Load '<path>' failed" when a model is missing,
   * which no JS caller can catch. Failing here turns that into a normal
   * exception that surfaces as a configuration error.
   */
  fun initialize(modelPath: String) {
    if (loadedModelPath == modelPath && extractor != null) {
      return
    }
    release()
    val fromDisk = modelPath.startsWith("/")
    if (fromDisk && !java.io.File(modelPath).isFile()) {
      throw IllegalArgumentException(
        "Speaker model not found at '$modelPath'. Download or bundle the model before enrolling."
      )
    }
    if (!fromDisk && !assetExists(modelPath)) {
      throw IllegalArgumentException(
        "Speaker model asset '$modelPath' is not bundled in the app. " +
          "Bundle it, or pass an absolute path to a downloaded model."
      )
    }
    val config = SpeakerEmbeddingExtractorConfig(
      model = modelPath,
      numThreads = 1,
      debug = false,
      provider = "cpu",
    )
    val newExtractor =
      SpeakerEmbeddingExtractor(if (fromDisk) null else assetManager, config)
    extractor = newExtractor
    manager = SpeakerEmbeddingManager(dim = newExtractor.dim())
    loadedModelPath = modelPath
  }

  /** True if [path] resolves to a readable entry in the APK assets. */
  private fun assetExists(path: String): Boolean =
    try {
      assetManager.open(path).close()
      true
    } catch (e: java.io.IOException) {
      false
    }

  /**
   * Extracts a speaker embedding from PCM audio data encoded as base64.
   *
   * @param pcmBase64 Base64-encoded LITTLE_ENDIAN FLOAT32 mono PCM. Not 16-bit
   *   integer PCM: this is decoded as `bytes.size / 4` floats below, so int16
   *   input is reinterpreted as floats and yields garbage embeddings rather
   *   than an error.
   * @param sampleRate Audio sample rate in Hz
   * @return Base64-encoded FloatArray embedding (LITTLE_ENDIAN)
   */
  fun extractEmbedding(pcmBase64: String, sampleRate: Int): String {
    val activeExtractor = extractor
      ?: throw IllegalStateException("SherpaOnnxSpeakerEmbedding not initialized")

    val bytes = Base64.decode(pcmBase64, Base64.NO_WRAP)
    val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    val samples = FloatArray(bytes.size / 4) { buf.getFloat() }

    val stream = activeExtractor.createStream()
    try {
      stream.acceptWaveform(samples, sampleRate)
      stream.inputFinished()
      val embedding = activeExtractor.compute(stream)
      val outBytes = ByteBuffer.allocate(embedding.size * 4)
        .order(ByteOrder.LITTLE_ENDIAN)
        .apply { embedding.forEach { putFloat(it) } }
        .array()
      return Base64.encodeToString(outBytes, Base64.NO_WRAP)
    } finally {
      stream.release()
    }
  }

  /**
   * Registers a speaker with the given name and embedding.
   *
   * @param name Speaker name identifier
   * @param embeddingBase64 Base64-encoded FloatArray embedding (LITTLE_ENDIAN)
   * @return true if registration succeeded, false otherwise
   */
  fun registerSpeaker(name: String, embeddingBase64: String): Boolean {
    val activeManager = manager
      ?: throw IllegalStateException("SherpaOnnxSpeakerEmbedding not initialized")

    val floats = decodeEmbedding(embeddingBase64)
    // SpeakerEmbeddingManager.add() returns false if the speaker already exists.
    // Remove first so re-enrollment can overwrite the stored embedding.
    if (activeManager.contains(name)) {
      activeManager.remove(name)
    }
    return activeManager.add(name, floats)
  }

  /**
   * Verifies whether the given embedding matches the registered speaker with [name].
   *
   * Score is a best-effort approximation (1.0 if matched, 0.0 otherwise) because
   * the Sherpa-ONNX AAR [SpeakerEmbeddingManager.search] returns only a name string.
   *
   * @param name Speaker name to verify against
   * @param embeddingBase64 Base64-encoded FloatArray embedding (LITTLE_ENDIAN)
   * @param threshold Similarity threshold (0.0–1.0)
   * @return Map with "matched" (Boolean) and "score" (Double)
   */
  fun verifySpeaker(name: String, embeddingBase64: String, threshold: Float): Map<String, Any?> {
    val activeManager = manager
      ?: throw IllegalStateException("SherpaOnnxSpeakerEmbedding not initialized")

    val floats = decodeEmbedding(embeddingBase64)
    val matched = activeManager.verify(name, floats, threshold)
    val bestMatch = activeManager.search(floats, threshold)

    // Score approximation: 1.0 if the search result confirms the expected speaker
    val score: Double = when {
      bestMatch == name -> 1.0
      else -> 0.0
    }

    return mapOf("matched" to matched, "score" to score)
  }

  /**
   * Identifies the best-matching registered speaker for the given embedding.
   *
   * Score is a best-effort approximation (1.0 if a match found, 0.0 otherwise).
   *
   * @param embeddingBase64 Base64-encoded FloatArray embedding (LITTLE_ENDIAN)
   * @param threshold Similarity threshold (0.0–1.0)
   * @return Map with "name" (String?) and "score" (Double)
   */
  fun identifySpeaker(embeddingBase64: String, threshold: Float): Map<String, Any?> {
    val activeManager = manager
      ?: throw IllegalStateException("SherpaOnnxSpeakerEmbedding not initialized")

    val floats = decodeEmbedding(embeddingBase64)
    val name = activeManager.search(floats, threshold)
    return mapOf("name" to name, "score" to if (name != null) 1.0 else 0.0)
  }

  /**
   * Clears all registered speakers by releasing and re-creating the manager.
   */
  fun clearSpeakers() {
    val dim = extractor?.dim() ?: return
    manager?.release()
    manager = SpeakerEmbeddingManager(dim)
  }

  /**
   * Releases all native resources. After calling this, [initialize] must be called again
   * before any other methods.
   */
  fun release() {
    manager?.release()
    manager = null
    extractor?.release()
    extractor = null
    loadedModelPath = null
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private fun decodeEmbedding(embeddingBase64: String): FloatArray {
    val bytes = Base64.decode(embeddingBase64, Base64.NO_WRAP)
    val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    return FloatArray(bytes.size / 4) { buf.getFloat() }
  }
}
