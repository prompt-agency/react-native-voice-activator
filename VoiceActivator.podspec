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

  # Enumerate our own source dirs rather than globbing ios/**. The vendored
  # xcframeworks under ios/Vendor ship their own ORT headers; an ios/**/*.h
  # glob sweeps those in as our private headers, and CocoaPods then copies
  # ORT 1.17 headers into Pods/Headers/Private/VoiceActivator where they
  # shadow the real onnxruntime-c (1.30) pod headers for every other target.
  # Do not "fix" this with s.exclude_files = "ios/Vendor/**/*": that also
  # un-links the xcframeworks and breaks with undefined SherpaOnnx* symbols.
  s.source_files = "ios/*.{h,m,mm,cpp}",
                   "ios/Runtime/**/*.{h,m,mm,cpp}",
                   "ios/Engines/**/*.{h,m,mm,cpp}"
  s.private_header_files = "ios/*.h",
                           "ios/Runtime/**/*.h",
                           "ios/Engines/**/*.h"
  # s.resources normally matches nothing: the ONNX models are NOT shipped in the
  # npm tarball (see the "!ios/Assets" entry in package.json's files array);
  # prepareModels() downloads them at runtime into the app's own storage. The
  # glob is kept so an app that vendors its own model bundle into the package
  # directory still gets it copied into the app bundle. CocoaPods does not fail
  # on an empty glob.
  s.resources = "ios/Assets/**/*"

  # The xcframeworks are far too large for the npm tarball, so they are fetched
  # from the matching GitHub release. Every download is checked against the
  # digests in ios/vendor-checksums.json, which DOES ship in the tarball and is
  # therefore covered by npm's own integrity check. Without that pin, a mutable
  # release asset would be linked straight into the consumer's app binary.
  vendor_checksums = JSON.parse(File.read(File.join(__dir__, "ios", "vendor-checksums.json")))
  sherpa_onnx_sha = vendor_checksums.fetch("assets").fetch("sherpa-onnx.xcframework.zip")
  sherpa_ort_sha = vendor_checksums.fetch("assets").fetch("sherpa-onnxruntime.xcframework.zip")

  s.prepare_command = <<-CMD
    set -eu
    VENDOR_DIR="ios/Vendor/SherpaOnnx"
    BASE_URL="https://github.com/prompt-agency/react-native-voice-activator/releases/download/v#{s.version}"

    mkdir -p "$VENDOR_DIR"

    # Private scratch dir: a fixed /tmp path collides between concurrent builds
    # on shared machines and is pre-creatable by another user.
    WORK_DIR="$(mktemp -d)"
    trap 'rm -rf "$WORK_DIR"' EXIT

    fetch_framework() {
      name="$1"
      expected="$2"
      # A cache hit used to return early on directory existence alone, so a
      # framework left by an earlier build was reused forever with no integrity
      # check. The digest of the zip it came from is now recorded beside it, which
      # catches the cases that actually bite: a truncated or corrupt download, and
      # a framework left over from a different package version.
      #
      # It is not a defence against a local attacker — anyone who can write to
      # node_modules can write the stamp too. Android's fetchSherpaOnnxAar can
      # re-hash its single .aar directly; a directory tree has no comparable
      # digest, hence the stamp.
      stamp="$VENDOR_DIR/$name.sha256"
      if [ -d "$VENDOR_DIR/$name" ]; then
        if [ ! -f "$stamp" ]; then
          # Predates the stamp. Adopt it rather than deleting: it was almost
          # certainly verified when it was downloaded, and deleting it strands any
          # checkout whose matching release is not published yet.
          echo "[VoiceActivator] $name has no recorded digest; adopting the existing framework."
          printf '%s' "$expected" > "$stamp"
          return 0
        fi
        if [ "$(cat "$stamp")" = "$expected" ]; then
          return 0
        fi
        echo "[VoiceActivator] $name was built from a different version; re-downloading."
        rm -rf "$VENDOR_DIR/$name" "$stamp"
      fi

      echo "[VoiceActivator] Downloading $name..."
      curl -fL --retry 3 --retry-delay 2 "$BASE_URL/$name.zip" -o "$WORK_DIR/$name.zip"

      actual="$(shasum -a 256 "$WORK_DIR/$name.zip" | awk '{print $1}')"
      if [ "$actual" != "$expected" ]; then
        echo "[VoiceActivator] Checksum mismatch for $name.zip." >&2
        echo "[VoiceActivator]   expected $expected" >&2
        echo "[VoiceActivator]   actual   $actual" >&2
        echo "[VoiceActivator] Refusing to link an unverified binary." >&2
        exit 1
      fi

      # Unpack to the side, then move into place, so an interrupted install can
      # never leave a half-extracted framework that looks complete next run.
      rm -rf "$WORK_DIR/extract"
      mkdir -p "$WORK_DIR/extract"
      unzip -q "$WORK_DIR/$name.zip" -d "$WORK_DIR/extract"
      rm -rf "$VENDOR_DIR/$name"
      mv "$WORK_DIR/extract/$name" "$VENDOR_DIR/$name"
      printf '%s' "$expected" > "$stamp"
    }

    fetch_framework "sherpa-onnx.xcframework" "#{sherpa_onnx_sha}"
    fetch_framework "sherpa-onnxruntime.xcframework" "#{sherpa_ort_sha}"
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
