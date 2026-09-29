#pragma once

/**
 * Maps the public `sensitivity` option (0-1) to Sherpa-ONNX's
 * `keywords_threshold`.
 *
 * Header-only and `inline` on purpose. It previously lived in an anonymous
 * namespace inside SherpaOnnxDetector.mm, which gives internal linkage, so the
 * offline evaluator's `extern` declaration could never resolve and the app failed
 * to link. Sharing it here rather than duplicating the arithmetic matters: live
 * detection and offline evaluation must agree on what a given sensitivity means,
 * or a measured detection rate describes a threshold the runtime does not use.
 *
 * Note the inverse relationship — a HIGHER sensitivity produces a LOWER
 * threshold, so more is detected and more false accepts occur.
 */
static inline float SherpaThresholdFromSensitivity(double sensitivity)
{
  double normalized = sensitivity;
  if (normalized < 0) {
    normalized = 0;
  } else if (normalized > 1) {
    normalized = 1;
  }

  return (float)(0.55 - (normalized * 0.3));
}
