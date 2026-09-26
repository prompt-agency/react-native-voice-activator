package com.voiceactivator.Engines.SherpaOnnx

import android.content.Context
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineNeMoCtcModelConfig
import com.k2fsa.sherpa.onnx.OnlineParaformerModelConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineToneCtcModelConfig
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import com.k2fsa.sherpa.onnx.OnlineZipformer2CtcModelConfig

internal class SherpaOnnxDetector(
  private val context: Context,
  private val assetLoader: SherpaOnnxAssetLoader = SherpaOnnxAssetLoader(),
  private val onDetected: (String) -> Unit,
) {
  private var keywordSpotter: KeywordSpotter? = null
  private var stream: OnlineStream? = null
  private var configuration: SherpaOnnxAssetRequest? = null
  private var sensitivity: Double = 0.5

  fun initialize(
    sensitivity: Double,
    configuration: SherpaOnnxAssetRequest = SherpaOnnxAssetRequest(
      modelAssetKey = null,
      keywordAssetKey = null,
    ),
  ) {
    release()
    this.configuration = configuration
    this.sensitivity = sensitivity
    val assets = assetLoader.load(context, configuration)
    val config = KeywordSpotterConfig(
      featConfig = FeatureConfig(16000, 80, 0f),
      modelConfig = OnlineModelConfig(
        transducer = OnlineTransducerModelConfig(
          assets.encoder,
          assets.decoder,
          assets.joiner,
        ),
        paraformer = OnlineParaformerModelConfig(),
        zipformer2Ctc = OnlineZipformer2CtcModelConfig(),
        neMoCtc = OnlineNeMoCtcModelConfig(),
        toneCtc = OnlineToneCtcModelConfig(),
        tokens = assets.tokens,
        numThreads = 1,
        debug = false,
        provider = "cpu",
        modelType = "",
        // Setting these switches sherpa-onnx from expecting a pre-tokenized
        // keywords file to tokenizing plain text itself, via the
        // simple-sentencepiece implementation linked into the native library.
        // That is what makes an arbitrary wakePhrase work with no training.
        modelingUnit = if (assets.bpeVocab != null) "bpe" else "",
        bpeVocab = assets.bpeVocab ?: "",
      ),
      maxActivePaths = 4,
      keywordsFile = assets.keywords,
      keywordsScore = 1.0f,
      keywordsThreshold = thresholdFromSensitivity(sensitivity),
      numTrailingBlanks = 1,
    )

    // Sherpa-ONNX routes to a different native entry point depending on this
    // argument: newFromAsset when an AssetManager is supplied, newFromFile when
    // it is null. Models downloaded on demand live on the filesystem, so passing
    // the AssetManager for them would look for APK entries that do not exist.
    keywordSpotter =
      if (assets.fromFileSystem) {
        KeywordSpotter(null, config)
      } else {
        KeywordSpotter(context.assets, config)
      }
    stream = keywordSpotter?.createStream()
  }

  fun ensureInitialized() {
    if (keywordSpotter != null && stream != null) {
      return
    }

    initialize(
      sensitivity = sensitivity,
      configuration = configuration ?: SherpaOnnxAssetRequest(
        modelAssetKey = null,
        keywordAssetKey = null,
      ),
    )
  }

  fun processSamples(samples: FloatArray, sampleRate: Int) {
    val activeSpotter = keywordSpotter ?: return
    val activeStream = stream ?: return

    activeStream.acceptWaveform(samples, sampleRate)

    while (activeSpotter.isReady(activeStream)) {
      activeSpotter.decode(activeStream)
    }

    val result = activeSpotter.getResult(activeStream)
    if (result.keyword.isNullOrBlank()) {
      return
    }

    onDetected(result.keyword)
    activeSpotter.reset(activeStream)
  }

  fun release() {
    stream?.release()
    stream = null
    keywordSpotter?.release()
    keywordSpotter = null
  }

  private fun thresholdFromSensitivity(sensitivity: Double): Float {
    val normalized = sensitivity.coerceIn(0.0, 1.0)
    return (0.55 - (normalized * 0.3)).toFloat()
  }
}
