const supportMatrix = {
  reactNative: '0.86+',
  expo: 'SDK 57+',
  platforms: ['iOS', 'Android'],
  bareReactNative: {
    validationSurface:
      'example runtime path plus package validation and native compile/build evidence',
    requiresManualSteps: ['microphone permission', 'iOS pod install'],
  },
  expoIntegration: {
    validationSurface:
      'config plugin, expo config resolution, and expo prebuild generation',
    unsupported: ['Expo Go', 'full Expo runtime CI session'],
  },
};

console.log(JSON.stringify(supportMatrix, null, 2));

export {};
