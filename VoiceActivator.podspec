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

  # Two ONNX Runtimes in one binary share a single symbol namespace, and only
  # one of them wins at link time. ORT is backward compatible in one direction
  # only: a NEWER runtime happily serves the older API version sherpa-onnx was
  # built against (ORT 1.17.1 / ORT_API_VERSION 17), while our bundled 1.17.1
  # cannot serve the API version a newer onnxruntime-react-native asks for. If
  # sherpa's copy wins, the newer caller gets
  #   "The requested API version [30] is not available, only API versions
  #    [1, 17] are supported in this build"
  # and then SIGSEGVs. So whenever the app already links an ONNX Runtime via
  # onnxruntime-react-native, we drop our sherpa-onnxruntime.xcframework and
  # let sherpa bind to theirs. When nothing else provides one, we must keep
  # vendoring ours or sherpa's ORT symbols are undefined at link time.
  #
  # This used to be a manual opt-in, which meant every `pod install` (including
  # the one `expo prebuild` runs for you) silently reintroduced the crash. It is
  # now detected at `pod install` time; see docs/ios-onnx-conflict-resolution.md.
  #
  # Detection: ask Node to resolve onnxruntime-react-native the way Metro and
  # the autolinker do, anchored at the app project. Node's resolver is the only
  # thing that gets npm/yarn hoisting, Yarn workspaces and pnpm's symlinked
  # store all correct. If Node is missing or resolution fails we fall back to a
  # plain directory walk, and if that finds nothing either we default to
  # vendoring our own runtime (the historical behaviour, and the one that
  # cannot produce an unlinkable build).
  ort_detection_anchors = []
  begin
    if defined?(Pod::Config) && Pod::Config.instance.installation_root
      # The directory holding the Podfile (usually <app>/ios), then the app root.
      installation_root = Pod::Config.instance.installation_root.to_s
      ort_detection_anchors << installation_root
      ort_detection_anchors << File.expand_path("..", installation_root)
    end
  rescue StandardError
    # Not running under `pod install` (lint, tooling); anchors below still apply.
  end
  # Where this package itself sits. In a normal install that is inside the app's
  # node_modules, so walking up from here reaches the app. With a `portal:` or
  # `link:` dependency it is the library checkout instead, which is exactly why
  # the installation root above is tried first.
  ort_detection_anchors << __dir__
  begin
    ort_detection_anchors << File.realpath(__dir__)
  rescue StandardError
    # realpath can fail on an unusual mount; the literal path is already queued.
  end
  ort_detection_anchors = ort_detection_anchors.compact.uniq

  external_ort_path = nil
  external_ort_method = nil

  begin
    require "shellwords"
    node_script = "try { process.stdout.write(require.resolve(" \
                  "'onnxruntime-react-native/package.json', " \
                  "{ paths: process.argv.slice(1) })) } catch (e) { process.exit(3) }"
    command = "node -e #{Shellwords.escape(node_script)} " \
              "#{ort_detection_anchors.map { |p| Shellwords.escape(p) }.join(' ')} 2>/dev/null"
    output = `#{command}`
    if $?.respond_to?(:success?) && $?.success? && !output.to_s.strip.empty?
      external_ort_path = File.dirname(output.strip)
      external_ort_method = "node resolution"
    end
  rescue StandardError
    # Node unavailable or unusable; fall through to the directory walk.
  end

  if external_ort_path.nil?
    walked = nil
    ort_detection_anchors.each do |anchor|
      dir = File.expand_path(anchor)
      loop do
        candidate = File.join(dir, "node_modules", "onnxruntime-react-native")
        if File.directory?(candidate)
          walked = candidate
          break
        end
        parent = File.dirname(dir)
        break if parent == dir
        dir = parent
      end
      break if walked
    end
    if walked
      external_ort_path = walked
      external_ort_method = "directory walk (node resolution unavailable)"
    end
  end

  compat_override = ENV['RUNANYWHERE_ONNX_COMPAT']
  if compat_override == '1'
    skip_bundled_ort = true
    decision_reason = "RUNANYWHERE_ONNX_COMPAT=1 forces it (detection said " \
                      "#{external_ort_path ? 'another ONNX Runtime is present' : 'no other ONNX Runtime'})"
  elsif compat_override == '0'
    skip_bundled_ort = false
    decision_reason = "RUNANYWHERE_ONNX_COMPAT=0 forces it (detection said " \
                      "#{external_ort_path ? 'another ONNX Runtime is present' : 'no other ONNX Runtime'})"
  elsif external_ort_path
    skip_bundled_ort = true
    decision_reason = "detected onnxruntime-react-native via #{external_ort_method} at #{external_ort_path}"
  else
    skip_bundled_ort = false
    decision_reason = "no onnxruntime-react-native found from #{ort_detection_anchors.first}"
  end

  # One line, always printed. A linking decision this consequential must not be
  # something you have to read the podspec to discover. CocoaPods evaluates a
  # podspec several times per install, so the message is printed once per
  # distinct decision rather than once per evaluation.
  decision_message =
    if skip_bundled_ort
      "[VoiceActivator] Skipping bundled sherpa-onnxruntime.xcframework " \
      "(sherpa-onnx will link the app's ONNX Runtime): #{decision_reason}. " \
      "Override with RUNANYWHERE_ONNX_COMPAT=0."
    else
      "[VoiceActivator] Vendoring bundled sherpa-onnxruntime.xcframework " \
      "(ORT 1.17.1): #{decision_reason}. " \
      "Override with RUNANYWHERE_ONNX_COMPAT=1."
    end
  $voice_activator_ort_notices ||= {}
  unless $voice_activator_ort_notices[decision_message]
    $voice_activator_ort_notices[decision_message] = true
    Kernel.puts decision_message
  end

  if skip_bundled_ort
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
