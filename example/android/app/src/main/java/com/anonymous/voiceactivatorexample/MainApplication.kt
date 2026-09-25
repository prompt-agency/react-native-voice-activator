package com.anonymous.voiceactivatorexample

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory
import ai.onnxruntime.reactnative.OnnxruntimePackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Added by react-native-voice-activator.
          // onnxruntime-react-native still ships a legacy `unimodule.json` and no
          // `expo-module.config.json`, so Expo autolinking claims it (resolving it
          // with zero modules to register) while also excluding it from the
          // generated PackageList. Its .so files and classes are packaged but
          // OnnxruntimePackage is never instantiated, leaving
          // NativeModules.Onnxruntime null and every ONNX call failing with
          // "Cannot read property 'install' of null". Silero VAD and any
          // ONNX-backed provider depend on this registration.
          add(OnnxruntimePackage())
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
