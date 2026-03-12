package com.voiceactivator.Engines.SherpaOnnx

import android.content.Context

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
    val encoder = resolveModelAsset(context, root, "encoder")
    val decoder = resolveModelAsset(context, root, "decoder")
    val joiner = resolveModelAsset(context, root, "joiner")
    val tokens = resolveRequiredAsset(context, "$root/tokens.txt")
    val keywords = resolveKeywordAsset(context, root, request.keywordAssetKey)

    return SherpaOnnxAssetPaths(
      encoder = encoder,
      decoder = decoder,
      joiner = joiner,
      tokens = tokens,
      keywords = keywords,
    )
  }

  private fun normalizeAssetRoot(modelAssetKey: String?): String {
    val normalized = modelAssetKey?.trim()?.removeSuffix("/")?.removePrefix("/")
    if (normalized.isNullOrEmpty()) {
      return DEFAULT_MODEL_ROOT
    }

    require(!normalized.startsWith("file://")) {
      "Android Sherpa-ONNX custom models currently require asset-relative modelAssetKey values."
    }
    require(!normalized.startsWith("/")) {
      "Android Sherpa-ONNX custom models currently require asset-relative modelAssetKey values."
    }

    return normalized
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

    require(!normalized.startsWith("file://")) {
      "Android Sherpa-ONNX custom keywords currently require asset-relative keywordAssetKey values."
    }
    require(!normalized.startsWith("/")) {
      "Android Sherpa-ONNX custom keywords currently require asset-relative keywordAssetKey values."
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
