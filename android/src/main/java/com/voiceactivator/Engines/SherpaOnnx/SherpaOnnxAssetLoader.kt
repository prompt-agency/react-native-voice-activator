package com.voiceactivator.Engines.SherpaOnnx

import android.content.Context
import java.io.File

internal data class SherpaOnnxAssetRequest(
  val modelAssetKey: String?,
  val keywordAssetKey: String?,
)

internal data class SherpaOnnxAssetPaths(
  val encoder: String,
  val decoder: String,
  val joiner: String,
  val tokens: String,
  val keywords: String,
  /**
   * True when the paths above are absolute filesystem paths rather than keys
   * into the APK's AssetManager.
   *
   * Models are downloaded on demand into the app's files directory, so the
   * common case is now filesystem paths. Sherpa-ONNX has a separate native
   * entry point for each: KeywordSpotter(assetManager, config) calls
   * newFromAsset, and KeywordSpotter(null, config) calls newFromFile.
   */
  val fromFileSystem: Boolean,
)

internal class SherpaOnnxAssetLoader {
  fun load(
    context: Context,
    request: SherpaOnnxAssetRequest = SherpaOnnxAssetRequest(
      modelAssetKey = null,
      keywordAssetKey = null,
    ),
  ): SherpaOnnxAssetPaths {
    val root = normalizeAssetRoot(request.modelAssetKey)
    val fromFileSystem = isFileSystemRoot(root)

    if (fromFileSystem) {
      val dir = File(stripFileScheme(root))
      require(dir.isDirectory) {
        "Sherpa-ONNX model directory does not exist: ${dir.absolutePath}"
      }

      return SherpaOnnxAssetPaths(
        encoder = resolveModelFile(dir, "encoder"),
        decoder = resolveModelFile(dir, "decoder"),
        joiner = resolveModelFile(dir, "joiner"),
        tokens = resolveRequiredFile(dir, "tokens.txt"),
        keywords = resolveKeywordFile(dir, request.keywordAssetKey),
        fromFileSystem = true,
      )
    }

    return SherpaOnnxAssetPaths(
      encoder = resolveModelAsset(context, root, "encoder"),
      decoder = resolveModelAsset(context, root, "decoder"),
      joiner = resolveModelAsset(context, root, "joiner"),
      tokens = resolveRequiredAsset(context, "$root/tokens.txt"),
      keywords = resolveKeywordAsset(context, root, request.keywordAssetKey),
      fromFileSystem = false,
    )
  }

  private fun isFileSystemRoot(root: String): Boolean =
    root.startsWith("/") || root.startsWith("file://")

  private fun stripFileScheme(value: String): String =
    if (value.startsWith("file://")) value.removePrefix("file://") else value

  private fun resolveModelFile(dir: File, prefix: String): String {
    val candidates = listOf(
      "$prefix.onnx",
      "$prefix-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
      "$prefix-epoch-12-avg-2-chunk-16-left-64.onnx",
    )

    return candidates.firstNotNullOfOrNull { name ->
      val candidate = File(dir, name)
      if (candidate.isFile) candidate.absolutePath else null
    } ?: throw IllegalArgumentException(
      "Missing Sherpa-ONNX model file for $prefix in ${dir.absolutePath}"
    )
  }

  private fun resolveRequiredFile(dir: File, name: String): String {
    val candidate = File(dir, name)
    require(candidate.isFile) {
      "Missing Sherpa-ONNX file: ${candidate.absolutePath}"
    }
    return candidate.absolutePath
  }

  private fun resolveKeywordFile(dir: File, keywordAssetKey: String?): String {
    val normalized = keywordAssetKey?.trim()
    if (normalized.isNullOrEmpty()) {
      return resolveRequiredFile(dir, "keywords.txt")
    }

    // An absolute keyword path may point outside the model directory, which is
    // legitimate: an app can generate its own keywords file at runtime.
    if (isFileSystemRoot(normalized)) {
      val absolute = File(stripFileScheme(normalized))
      require(absolute.isFile) {
        "Missing Sherpa-ONNX keywords file: ${absolute.absolutePath}"
      }
      return absolute.absolutePath
    }

    return resolveRequiredFile(dir, normalized)
  }

  private fun normalizeAssetRoot(modelAssetKey: String?): String {
    val trimmed = modelAssetKey?.trim()?.removeSuffix("/")
    if (trimmed.isNullOrEmpty()) {
      return DEFAULT_MODEL_ROOT
    }

    // Absolute and file:// roots are filesystem paths — the on-demand model
    // directory, or an app-supplied bundle. Anything else is an AssetManager
    // key, which must not carry a leading slash.
    if (trimmed.startsWith("/") || trimmed.startsWith("file://")) {
      return trimmed
    }

    return trimmed.removePrefix("/")
  }

  private fun resolveKeywordAsset(
    context: Context,
    root: String,
    keywordAssetKey: String?,
  ): String {
    val normalized = keywordAssetKey?.trim()
    if (normalized.isNullOrEmpty()) {
      return resolveRequiredAsset(context, "$root/keywords.txt")
    }

    require(!normalized.startsWith("file://") && !normalized.startsWith("/")) {
      "An absolute keywordAssetKey requires an absolute modelAssetKey: a bundled " +
        "model root can only resolve keyword files packaged alongside it."
    }

    val candidate =
      if (normalized.contains("/")) normalized.removePrefix("/") else "$root/$normalized"
    return resolveRequiredAsset(context, candidate)
  }

  private fun resolveModelAsset(
    context: Context,
    root: String,
    prefix: String,
  ): String {
    val candidates = listOf(
      "$root/$prefix.onnx",
      "$root/$prefix-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
      "$root/$prefix-epoch-12-avg-2-chunk-16-left-64.onnx",
    )

    return candidates.firstNotNullOfOrNull { candidate ->
      runCatching {
        context.assets.open(candidate).close()
        candidate
      }.getOrNull()
    } ?: throw IllegalArgumentException(
      "Missing bundled Sherpa-ONNX asset for $prefix in model root: $root"
    )
  }

  private fun resolveRequiredAsset(context: Context, assetPath: String): String {
    context.assets.open(assetPath).close()
    return assetPath
  }

  private companion object {
    const val DEFAULT_MODEL_ROOT =
      "voice-activator-sherpa-onnx/" +
        "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"
  }
}
