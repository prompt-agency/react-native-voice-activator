/**
 * with-onnxruntime-registration.test.ts
 *
 * Unit tests for the withOnnxruntimeRegistration Expo config plugin.
 *
 * onnxruntime-react-native ships a legacy `unimodule.json` and no
 * `expo-module.config.json`, so Expo autolinking claims it (with zero modules
 * to register) while also excluding it from the generated PackageList. Its
 * native libraries land in the APK but OnnxruntimePackage is never
 * instantiated, so NativeModules.Onnxruntime is null and every ONNX call fails
 * with "Cannot read property 'install' of null". This plugin registers it so
 * consuming apps never have to hand-edit MainApplication.
 *
 * Requirements: PLUGIN-02
 */

// ---------------------------------------------------------------------------
// Mock @expo/config-plugins — withMainApplication just invokes the callback
// with a caller-supplied modResults so we can assert on the transform.
// ---------------------------------------------------------------------------
jest.mock('@expo/config-plugins', () => ({
  withMainApplication: (
    config: { modResults: { contents: string; language: string } },
    cb: (c: { modResults: { contents: string; language: string } }) => {
      modResults: { contents: string; language: string };
    }
  ) => cb(config),
}));

import { withOnnxruntimeRegistration } from '../expo/withOnnxruntimeRegistration';

/** The MainApplication.kt shape produced by current Expo templates. */
const KOTLIN_TEMPLATE = `package com.example.app

import android.app.Application

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )
  }
}
`;

const JAVA_TEMPLATE = `package com.example.app;

import android.app.Application;
import com.facebook.react.PackageList;
import java.util.List;

public class MainApplication extends Application {
  protected List<ReactPackage> getPackages() {
    List<ReactPackage> packages = new PackageList(this).getPackages();
    return packages;
  }
}
`;

function run(contents: string, language: 'kt' | 'java'): string {
  const config = { modResults: { contents, language } };
  // The plugin's ConfigPlugin signature is wider than this stub needs.
  const result = (
    withOnnxruntimeRegistration as unknown as (
      c: typeof config
    ) => typeof config
  )(config);
  return result.modResults.contents;
}

describe('withOnnxruntimeRegistration', () => {
  describe('Kotlin', () => {
    it('adds the import and registers the package inside the apply block', () => {
      const out = run(KOTLIN_TEMPLATE, 'kt');

      expect(out).toContain(
        'import ai.onnxruntime.reactnative.OnnxruntimePackage'
      );
      expect(out).toContain('add(OnnxruntimePackage())');

      // Must land inside the packages.apply { ... } block, not after it.
      const applyIndex = out.indexOf('PackageList(this).packages.apply {');
      const addIndex = out.indexOf('add(OnnxruntimePackage())');
      const closeIndex = out.indexOf('}', addIndex);
      expect(applyIndex).toBeGreaterThan(-1);
      expect(addIndex).toBeGreaterThan(applyIndex);
      expect(closeIndex).toBeGreaterThan(addIndex);
    });

    it('explains why the manual registration is necessary', () => {
      const out = run(KOTLIN_TEMPLATE, 'kt');
      expect(out).toContain('react-native-voice-activator');
      expect(out).toContain('Cannot read property');
    });

    it('is idempotent across repeated prebuilds', () => {
      const once = run(KOTLIN_TEMPLATE, 'kt');
      const twice = run(once, 'kt');
      expect(twice).toBe(once);

      const occurrences = twice.split('add(OnnxruntimePackage())').length - 1;
      expect(occurrences).toBe(1);
    });

    it('leaves an app that already registers the package untouched', () => {
      const manual = KOTLIN_TEMPLATE.replace(
        '// add(MyReactNativePackage())',
        'add(OnnxruntimePackage())'
      );
      expect(run(manual, 'kt')).toBe(manual);
    });

    it('handles a bare packages list with no apply block', () => {
      const bare = `package com.example.app

import com.facebook.react.PackageList

class MainApplication {
  val packageList = PackageList(this).packages
}
`;
      const out = run(bare, 'kt');
      expect(out).toContain(
        'import ai.onnxruntime.reactnative.OnnxruntimePackage'
      );
      expect(out).toContain(
        'PackageList(this).packages.apply { add(OnnxruntimePackage()) }'
      );
    });
  });

  describe('Java', () => {
    it('adds the import and registers before the return', () => {
      const out = run(JAVA_TEMPLATE, 'java');

      expect(out).toContain(
        'import ai.onnxruntime.reactnative.OnnxruntimePackage;'
      );
      expect(out).toContain('packages.add(new OnnxruntimePackage());');

      const addIndex = out.indexOf('packages.add(new OnnxruntimePackage());');
      const returnIndex = out.indexOf('return packages;');
      expect(addIndex).toBeGreaterThan(-1);
      expect(returnIndex).toBeGreaterThan(addIndex);
    });

    it('is idempotent across repeated prebuilds', () => {
      const once = run(JAVA_TEMPLATE, 'java');
      expect(run(once, 'java')).toBe(once);
    });
  });
});
