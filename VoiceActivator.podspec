require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "VoiceActivator"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/prompt-agency/react-native-voice-activator.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,cpp}"
  s.private_header_files = "ios/**/*.h"
  s.resources = "ios/Assets/**/*"

  s.prepare_command = <<-CMD
    set -e
    VENDOR_DIR="ios/Vendor/SherpaOnnx"
    BASE_URL="https://github.com/prompt-agency/react-native-voice-activator/releases/download/v#{s.version}"

    mkdir -p "$VENDOR_DIR"

    if [ ! -d "$VENDOR_DIR/sherpa-onnx.xcframework" ]; then
      echo "[VoiceActivator] Downloading sherpa-onnx.xcframework..."
      curl -L "$BASE_URL/sherpa-onnx.xcframework.zip" -o /tmp/va-sherpa-onnx.zip
      unzip -o /tmp/va-sherpa-onnx.zip -d "$VENDOR_DIR"
      rm /tmp/va-sherpa-onnx.zip
    fi

    if [ ! -d "$VENDOR_DIR/sherpa-onnxruntime.xcframework" ]; then
      echo "[VoiceActivator] Downloading sherpa-onnxruntime.xcframework..."
      curl -L "$BASE_URL/sherpa-onnxruntime.xcframework.zip" -o /tmp/va-sherpa-onnxruntime.zip
      unzip -o /tmp/va-sherpa-onnxruntime.zip -d "$VENDOR_DIR"
      rm /tmp/va-sherpa-onnxruntime.zip
    fi
  CMD

  sherpa_header_root = "\"${PODS_TARGET_SRCROOT}/ios/Vendor/SherpaOnnx/sherpa-onnx.xcframework/Headers\""
  onnxruntime_header_root = "\"${PODS_TARGET_SRCROOT}/ios/Vendor/SherpaOnnx/sherpa-onnxruntime.xcframework/Headers\""

  # When RUNANYWHERE_ONNX_COMPAT=1 is set at `pod install` time, the bundled
  # sherpa-onnxruntime.xcframework is excluded so sherpa-onnx can link against
  # another ONNX Runtime xcframework already in the app (same ORT 1.17.1 /
  # API v17). Use only when you intentionally link a second ORT and need a
  # single symbol namespace; see docs/ios-onnx-conflict-resolution.md.
  if ENV['RUNANYWHERE_ONNX_COMPAT'] == '1'
    s.vendored_frameworks = "ios/Vendor/SherpaOnnx/sherpa-onnx.xcframework"
    ort_header_paths = "\"$(PODS_ROOT)/Headers/Private/Yoga\" $(inherited) #{sherpa_header_root}"
  else
    s.vendored_frameworks = "ios/Vendor/SherpaOnnx/*.xcframework"
    ort_header_paths = "\"$(PODS_ROOT)/Headers/Private/Yoga\" $(inherited) #{sherpa_header_root} #{onnxruntime_header_root}"
  end

  install_modules_dependencies(s)

  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => ort_header_paths,
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "OTHER_CPLUSPLUSFLAGS" => "$(inherited) -DRCT_NEW_ARCH_ENABLED=1 ",
    "OTHER_SWIFT_FLAGS" => "$(inherited) -DRCT_NEW_ARCH_ENABLED"
  }
end
