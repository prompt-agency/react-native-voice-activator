/**
 * Local Expo config plugin: adopt the UIScene life cycle in the generated AppDelegate.
 *
 * Xcode 26 / iOS SDK 26 and newer refuse to launch an app that has not adopted the
 * scene-based life cycle, with:
 *
 *   Application failed to launch: UIScene life cycle is required for apps built with this SDK.
 *
 * Expo SDK 57 ships `ExpoAppSceneDelegate` (ObjC name `EXExpoAppSceneDelegate`) for exactly
 * this, but `expo prebuild` still generates the pre-scene `AppDelegate.swift`. Registering the
 * scene delegate in `Info.plist` is done from `app.json`
 * (`expo.ios.infoPlist.UIApplicationSceneManifest`); this plugin makes the generated
 * `AppDelegate.swift` compatible with it.
 *
 * `ExpoAppSceneDelegate.scene(_:willConnectTo:options:)` does:
 *
 *   guard let appDelegate = UIApplication.shared.delegate as? ExpoAppDelegate,
 *     let provider = appDelegate as? ExpoReactNativeFactoryProvider,
 *     let factory = provider.reactNativeFactory else { fatalError(...) }
 *
 * and then creates the `UIWindow` from the connecting `UIWindowScene` and calls
 * `factory.startReactNative(...)` itself. So the AppDelegate must:
 *
 *   1. declare conformance to `ExpoReactNativeFactoryProvider`, otherwise the cast fails and
 *      the scene delegate traps at launch, and
 *   2. stop creating its own window and starting React Native, otherwise React Native is
 *      mounted twice, into two different windows.
 *
 * It must still create and assign the factory, because the scene delegate reads
 * `provider.reactNativeFactory`.
 *
 * This plugin throws if the generated Swift does not look the way it expects. A config plugin
 * that silently no-ops here is worse than one that errors: the app would then fail at launch
 * with the original opaque UIScene message.
 */
const { withAppDelegate } = require('@expo/config-plugins');

const BASE_CLASS_DECLARATION = 'class AppDelegate: ExpoAppDelegate {';
const CONFORMING_CLASS_DECLARATION =
  'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';

const PLATFORM_BLOCK_START = '#if os(iOS) || os(tvOS)';
const PLATFORM_BLOCK_END = '#endif';
const WINDOW_CREATION = 'window = UIWindow(frame: UIScreen.main.bounds)';
const START_REACT_NATIVE = 'factory.startReactNative(';

function fail(reason) {
  throw new Error(
    `with-ui-scene-lifecycle: ${reason}\n` +
      'The generated ios/<app>/AppDelegate.swift does not match what this plugin expects, so ' +
      'UIScene life cycle adoption was NOT applied. This usually means the Expo SDK changed its ' +
      'AppDelegate template. Re-check example/plugins/with-ui-scene-lifecycle.js against the ' +
      'freshly generated AppDelegate.swift before building.'
  );
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

/**
 * Adds `ExpoReactNativeFactoryProvider` to the AppDelegate's conformance list.
 */
function addFactoryProviderConformance(contents) {
  if (contents.includes(CONFORMING_CLASS_DECLARATION)) {
    return contents;
  }

  const occurrences = countOccurrences(contents, BASE_CLASS_DECLARATION);
  if (occurrences !== 1) {
    fail(
      `expected exactly one occurrence of "${BASE_CLASS_DECLARATION}" but found ${occurrences}.`
    );
  }

  return contents.replace(BASE_CLASS_DECLARATION, CONFORMING_CLASS_DECLARATION);
}

/**
 * Removes the `#if os(iOS) || os(tvOS)` block that creates the window and starts React Native.
 */
function removeWindowAndStartReactNative(contents) {
  const startIndex = contents.indexOf(PLATFORM_BLOCK_START);
  if (startIndex === -1) {
    if (
      !contents.includes(WINDOW_CREATION) &&
      !contents.includes(START_REACT_NATIVE)
    ) {
      // Already applied to this file on an earlier run.
      return contents;
    }
    fail(
      `could not find the "${PLATFORM_BLOCK_START}" block that creates the window and starts React Native.`
    );
  }

  const endIndex = contents.indexOf(PLATFORM_BLOCK_END, startIndex);
  if (endIndex === -1) {
    fail(
      `found "${PLATFORM_BLOCK_START}" but no matching "${PLATFORM_BLOCK_END}".`
    );
  }

  const block = contents.slice(
    startIndex,
    endIndex + PLATFORM_BLOCK_END.length
  );

  if (!block.includes(WINDOW_CREATION)) {
    fail(
      `the "${PLATFORM_BLOCK_START}" block does not contain "${WINDOW_CREATION}".`
    );
  }
  if (!block.includes(START_REACT_NATIVE)) {
    fail(
      `the "${PLATFORM_BLOCK_START}" block does not contain "${START_REACT_NATIVE}".`
    );
  }

  let cutEnd = endIndex + PLATFORM_BLOCK_END.length;
  // Swallow the newline that terminated the `#endif` line and the blank line after it, so the
  // rest of the method body keeps its original spacing.
  while (contents[cutEnd] === '\n') {
    cutEnd += 1;
  }

  let cutStart = startIndex;
  // Swallow the blank line that preceded the block.
  while (
    cutStart >= 2 &&
    contents[cutStart - 1] === '\n' &&
    contents[cutStart - 2] === '\n'
  ) {
    cutStart -= 1;
  }

  const result = contents.slice(0, cutStart) + contents.slice(cutEnd);

  if (result.includes(WINDOW_CREATION) || result.includes(START_REACT_NATIVE)) {
    fail(
      'the window creation or startReactNative call is still present after the edit.'
    );
  }

  return result;
}

const withUISceneLifecycle = (config) => {
  return withAppDelegate(config, (appDelegateConfig) => {
    if (appDelegateConfig.modResults.language !== 'swift') {
      fail(
        `expected a Swift AppDelegate but got "${appDelegateConfig.modResults.language}".`
      );
    }

    let contents = appDelegateConfig.modResults.contents;
    contents = addFactoryProviderConformance(contents);
    contents = removeWindowAndStartReactNative(contents);

    if (!contents.includes(CONFORMING_CLASS_DECLARATION)) {
      fail(
        'the ExpoReactNativeFactoryProvider conformance is missing after the edit.'
      );
    }
    if (!contents.includes('reactNativeFactory = factory')) {
      fail(
        'the AppDelegate no longer assigns `reactNativeFactory`, which the scene delegate reads.'
      );
    }

    appDelegateConfig.modResults.contents = contents;
    return appDelegateConfig;
  });
};

module.exports = withUISceneLifecycle;
