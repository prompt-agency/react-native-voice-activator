import { Platform } from 'react-native';

/**
 * Returns the platform-specific path for the bundled silero_vad.onnx model.
 *
 * iOS:     ORT resolves by filename from the main bundle.
 * Android: The asset resolver serves it via the `asset://` scheme.
 */
export function getSileroVADModelPath(): string {
  if (Platform.OS === 'android') {
    return 'asset://silero_vad.onnx';
  }
  // iOS: ORT InferenceSession.create() accepts a bare filename and resolves
  // it from NSBundle.mainBundle. The model must be bundled as a resource.
  return 'silero_vad.onnx';
}
