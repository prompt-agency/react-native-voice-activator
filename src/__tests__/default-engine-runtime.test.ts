import { createNativeManagedEngineRuntime } from '../engines';
import { createRuntimeConfiguration } from '../domain/detection-config';

describe('default engine runtime', () => {
  it('keeps the built-in default engine credential-free', async () => {
    const runtime = createNativeManagedEngineRuntime();
    const configuration = createRuntimeConfiguration({
      engineConfig: {
        sensitivity: 0.42,
        assetKeys: {
          modelAssetKey: 'voice-activator-sherpa-onnx/custom-model',
          keywordAssetKey: 'keywords/custom.txt',
        },
      },
    });

    await expect(
      runtime.initialize(configuration, {
        onDetected: jest.fn(),
        onError: jest.fn(),
      })
    ).resolves.toBeUndefined();
    await expect(runtime.start()).resolves.toBeUndefined();
    await expect(runtime.stop()).resolves.toBeUndefined();
    await expect(runtime.dispose()).resolves.toBeUndefined();
  });
});
