// docs/bare-react-native-setup.md and docs/expo-setup.md both cite this file as
// where the support boundary is tracked, so every documented floor belongs here.
const supportMatrix = {
  reactNative: '0.86+',
  reactNativePeerRange: '>=0.86.0',
  reactPeerRange: '>=19.0.0',
  expo: 'SDK 57+',
  platforms: ['iOS', 'Android'],
  // Android: matches VoiceActivator_minSdkVersion in android/gradle.properties.
  // 26 is the real floor, not a conservative claim: the foreground-service
  // runtime needs startForegroundService and notification channels, both API 26.
  androidMinSdk: 26,
  // iOS: the podspec takes RN's own min_ios_version_supported rather than
  // hardcoding a floor, so this tracks the documented claim, not an assertion.
  iosDeploymentTarget: '13.0',
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
