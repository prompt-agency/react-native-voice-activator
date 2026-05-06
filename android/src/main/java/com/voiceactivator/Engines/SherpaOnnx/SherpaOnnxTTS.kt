package com.voiceactivator.Engines.SherpaOnnx

import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.io.File

internal class SherpaOnnxTTS {

  private var tts: OfflineTts? = null
  private var loadedModelPath: String? = null

  /**
   * Synthesizes [text] to a temporary WAV file and returns its absolute path.
   * Reuses the loaded [OfflineTts] instance if [modelPath] hasn't changed.
   */
  fun synthesize(
    text: String,
    modelPath: String,
    tokensPath: String,
    dataDir: String,
    speakerId: Int = 0,
    speed: Float = 1.0f,
    noiseScale: Float = 0.667f,
    noiseScaleW: Float = 0.8f,
    lengthScale: Float = 1.0f,
  ): String {
    if (tts == null || loadedModelPath != modelPath) {
      tts?.release()
      tts = null

      val config = OfflineTtsConfig(
        model = OfflineTtsModelConfig(
          vits = OfflineTtsVitsModelConfig(
            model = modelPath,
            lexicon = "",
            tokens = tokensPath,
            dataDir = dataDir,
            dictDir = "",
            noiseScale = noiseScale,
            noiseScaleW = noiseScaleW,
            lengthScale = lengthScale,
          ),
          numThreads = 2,
          debug = false,
          provider = "cpu",
        ),
        maxNumSentences = 1,
      )
      tts = OfflineTts(null, config)
      loadedModelPath = modelPath
    }

    val audio = tts!!.generate(text = text, sid = speakerId, speed = speed)

    val outFile = File.createTempFile("sherpa-onnx-tts-", ".wav")
    audio.save(outFile.absolutePath)
    return outFile.absolutePath
  }

  fun release() {
    tts?.release()
    tts = null
    loadedModelPath = null
  }
}
