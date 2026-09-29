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

    # Android accepts -PVoiceActivator_sherpaAarPath to supply its binary from
    # somewhere other than the matching GitHub release. iOS had no equivalent,
    # so the only way to build against anything but a published v<version>
    # release was to pre-place the frameworks under ios/Vendor/SherpaOnnx --
    # impossible on a hosted builder with a fresh checkout, and the reason a CI
    # build could not be verified until after the release it depends on existed.
    #
    # VOICEACTIVATOR_SHERPA_BASE_URL closes that gap: point it at a prerelease
    # tag, an internal mirror, or a file:// directory. The checksum pin in
    # ios/vendor-checksums.json still governs, so an override can change where
    # the bytes come from but not which bytes are accepted.
    BASE_URL="${VOICEACTIVATOR_SHERPA_BASE_URL:-https://github.com/prompt-agency/react-native-voice-activator/releases/download/v#{s.version}}"

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
  # vendoring ours or sherpa's ORT symbols are undefined at link time
  # (sherpa-onnx.a leaves _OrtGetApiBase and
  # _OrtSessionOptionsAppendExecutionProvider_CoreML undefined).
  #
  # This used to be a manual opt-in, which meant every `pod install` (including
  # the one `expo prebuild` runs for you) silently reintroduced the crash. It is
  # now detected at `pod install` time; see docs/ios-onnx-conflict-resolution.md.
  #
  # Detection, strongest signal first:
  #
  #   1. The resolved Podfile. By the time CocoaPods evaluates a podspec the
  #      Podfile has already been evaluated, React Native / Expo autolinking
  #      (`use_native_modules!`) included, so `Pod::Config.instance.podfile`
  #      carries the real per-target dependency list. That answers the question
  #      that actually matters: is an ONNX Runtime pod LINKED INTO the target
  #      that links us? Verified against the CocoaPods in use here (1.16.2):
  #      Pod::Podfile#target_definitions, and per definition #dependencies,
  #      #abstract? and #name. Only the already-memoised Podfile is read, never
  #      one loaded on demand; see the comment at the read itself.
  #   2. Node resolution of onnxruntime-react-native. This only answers "is the
  #      package installed", which is a different question: the package can sit
  #      in node_modules with its pod excluded from the target (iOS autolinking
  #      disabled via react-native.config.js, an Android-only usage, a Podfile
  #      that excludes it, a hoisted transitive copy). So it is consulted only
  #      when the Podfile is unreachable, and a positive answer there counts as
  #      UNCERTAIN, never as a yes.
  #   3. A plain directory walk, used when Node itself cannot be run. Same
  #      status as (2).
  #
  # Uncertain resolves to vendoring ours plus a printed warning. A duplicate or
  # superfluous ORT shows up at build time and names itself; skipping ours when
  # nothing else provides one shows up at link time; but skipping ours when the
  # app's runtime never materialises is a runtime SIGSEGV, which is the worst of
  # the three to diagnose.
  ort_detection_anchors = []
  begin
    if defined?(Pod::Config) && Pod::Config.instance.installation_root
      # The directory holding the Podfile (usually <app>/ios), then the app root.
      installation_root = Pod::Config.instance.installation_root.to_s
      ort_detection_anchors << installation_root
      ort_detection_anchors << File.expand_path("..", installation_root)
    end
  rescue ::StandardError
    # Not running under `pod install` (lint, tooling); anchors below still apply.
  end
  # Where this package itself sits. In a normal install that is inside the app's
  # node_modules, so walking up from here reaches the app. With a `portal:` or
  # `link:` dependency it is the library checkout instead, which is exactly why
  # the installation root above is tried first.
  ort_detection_anchors << __dir__
  begin
    ort_detection_anchors << File.realpath(__dir__)
  rescue ::StandardError
    # realpath can fail on an unusual mount; the literal path is already queued.
  end
  ort_detection_anchors = ort_detection_anchors.compact.uniq

  # Pod names that mean "this target already links an ONNX Runtime". The React
  # Native wrapper is what autolinking puts in the Podfile; the others are the
  # upstream ORT pods, which an app may depend on directly.
  ort_pod_names = [
    "onnxruntime-react-native",
    "onnxruntime-c",
    "onnxruntime-objc",
    "onnxruntime-mobile-c",
    "onnxruntime-mobile-objc",
    "onnxruntime-training-c",
    "onnxruntime-training-objc"
  ]

  # NOTE on the `::` in every `rescue ::StandardError` below. A podspec is
  # eval'd inside Pod::Specification's lexical scope, and cocoapods-core defines
  # Pod::StandardError. A bare `rescue StandardError` in a podspec therefore
  # binds to Pod::StandardError and silently fails to catch ordinary Ruby
  # errors. Keep these fully qualified.

  # Signal 1: the resolved Podfile.
  podfile_verdict = nil   # :linked, :not_linked, :mixed, or nil when unreachable
  podfile_detail = nil
  # True when a Podfile exists but has not finished loading, i.e. this podspec is
  # being read from inside Podfile evaluation (React Native codegen does exactly
  # that). Such an evaluation is thrown away, so it must not print a decision.
  podfile_still_loading = false
  begin
    resolved_podfile = nil
    # Read the MEMOISED Podfile only. `Pod::Config#podfile` would otherwise
    # evaluate the Podfile itself, and a podspec is eval'd with the working
    # directory chdir'd to the podspec's own folder, so that evaluation runs
    # Expo/React Native autolinking from the wrong place: it either blows up or
    # does real work (codegen) in the wrong directory. Under `pod install` the
    # command has already loaded the Podfile before any podspec is touched, so
    # the memoised value is there. When it is not, this signal is simply absent
    # and we fall through to the weaker ones.
    config = defined?(Pod::Config) ? Pod::Config.instance : nil
    if config && config.instance_variable_defined?(:@podfile)
      candidate = config.instance_variable_get(:@podfile)
      resolved_podfile = candidate if candidate
    end
    if config && resolved_podfile.nil?
      # podfile_path only stats the filesystem; it does not evaluate anything.
      podfile_still_loading = !config.podfile_path.nil?
    end

    if resolved_podfile.respond_to?(:target_definitions)
      # Abstract definitions are not linked into anything themselves; their
      # dependencies are already inherited by the concrete children.
      concrete_targets = resolved_podfile.target_definitions.values.reject do |td|
        td.respond_to?(:abstract?) && td.abstract?
      end

      ort_pod_in = {}
      our_targets = []
      concrete_targets.each do |td|
        # Subspec dependencies arrive as "Pod/Subspec"; compare on the root pod.
        names = td.dependencies.map { |dep| dep.name.to_s.split("/").first }
        our_targets << td if names.include?(s.name)
        match = (names & ort_pod_names).first
        ort_pod_in[td.object_id] = match if match
      end

      target_list = lambda do |tds|
        tds.map { |td| td.name.to_s }.join(", ")
      end

      if our_targets.empty?
        if ort_pod_in.empty?
          podfile_verdict = :not_linked
          podfile_detail = "no target in the Podfile links an ONNX Runtime pod " \
                           "(#{concrete_targets.size} target(s) inspected)"
        else
          # We are not a direct Podfile dependency, so we cannot tell which
          # target pulls us in. Something links an ORT; assume it is the same
          # binary, which is the direction that cannot SIGSEGV.
          podfile_verdict = :linked
          podfile_detail = "the Podfile links #{ort_pod_in.values.uniq.join(', ')}, " \
                           "and no target names #{s.name} directly, so we are a " \
                           "transitive dependency of one of them"
        end
      else
        ours_with_ort = our_targets.select { |td| ort_pod_in.key?(td.object_id) }
        if ours_with_ort.size == our_targets.size
          podfile_verdict = :linked
          podfile_detail = "target(s) #{target_list.call(our_targets)} link " \
                           "#{s.name} together with " \
                           "#{our_targets.map { |td| ort_pod_in[td.object_id] }.uniq.join(', ')}"
        elsif ours_with_ort.empty?
          podfile_verdict = :not_linked
          podfile_detail = "target(s) #{target_list.call(our_targets)} link " \
                           "#{s.name} and no ONNX Runtime pod"
        else
          podfile_verdict = :mixed
          podfile_detail = "target(s) #{target_list.call(ours_with_ort)} link " \
                           "#{s.name} with an ONNX Runtime pod while " \
                           "#{target_list.call(our_targets - ours_with_ort)} link " \
                           "#{s.name} without one, and vendoring is a per-pod " \
                           "decision that cannot differ between them"
        end
      end
    end
  rescue ::StandardError, ::LoadError
    # Any surprise in the CocoaPods object graph degrades to the weaker signals
    # rather than breaking `pod install`.
    podfile_verdict = nil
    podfile_detail = nil
  end

  # Signals 2 and 3: is the package installed at all? Used when the Podfile is
  # unreachable, and as an annotation otherwise.
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
  rescue ::StandardError
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

  # Classify: confidently linked, confidently absent, or uncertain.
  detection_uncertain = false
  if podfile_verdict == :linked
    skip_bundled_ort = true
    detection_reason = "resolved Podfile dependencies: #{podfile_detail}"
  elsif podfile_verdict == :not_linked
    skip_bundled_ort = false
    detection_reason = "resolved Podfile dependencies: #{podfile_detail}"
  elsif podfile_verdict == :mixed
    skip_bundled_ort = false
    detection_uncertain = true
    detection_reason = "resolved Podfile dependencies are ambiguous: #{podfile_detail}"
  elsif external_ort_path
    skip_bundled_ort = false
    detection_uncertain = true
    detection_reason = "the resolved Podfile was not reachable, and " \
                       "onnxruntime-react-native is installed (#{external_ort_method} " \
                       "at #{external_ort_path}) but whether its pod is linked into " \
                       "this target could not be confirmed"
  else
    skip_bundled_ort = false
    detection_reason = "the resolved Podfile was not reachable and " \
                       "onnxruntime-react-native is not installed anywhere above " \
                       "#{ort_detection_anchors.first}, so no pod can link one"
  end

  compat_override = ENV['RUNANYWHERE_ONNX_COMPAT']
  if compat_override == '1' || compat_override == '0'
    skip_bundled_ort = compat_override == '1'
    detection_uncertain = false
    decision_reason = "RUNANYWHERE_ONNX_COMPAT=#{compat_override} forces it " \
                      "(detection said: #{detection_reason})"
  else
    decision_reason = detection_reason
  end

  # Always printed. A linking decision this consequential must not be something
  # you have to read the podspec to discover, and in the skip case the eventual
  # failure mode is a linker error that names neither this library nor the
  # override, so the explanation has to be in the log BEFORE the failure.
  # CocoaPods evaluates a podspec several times per install, so the message is
  # printed once per distinct decision rather than once per evaluation.
  decision_lines = []
  if skip_bundled_ort
    decision_lines << "[VoiceActivator] Skipping bundled sherpa-onnxruntime.xcframework " \
                      "(sherpa-onnx will link the app's ONNX Runtime): #{decision_reason}."
    decision_lines << "[VoiceActivator] If this build later fails with " \
                      "\"Undefined symbols: _OrtGetApiBase\", then " \
                      "onnxruntime-react-native is installed but its pod is not linked " \
                      "into this target. Set RUNANYWHERE_ONNX_COMPAT=0 to vendor our " \
                      "ONNX Runtime (1.17.1) instead."
    decision_lines << "[VoiceActivator] The same link also needs " \
                      "_OrtSessionOptionsAppendExecutionProvider_CoreML, so your ONNX " \
                      "Runtime must include the CoreML execution provider. The " \
                      "onnxruntime-c pod does; a custom or minimal ORT build may not."
  else
    decision_lines << "[VoiceActivator] Vendoring bundled sherpa-onnxruntime.xcframework " \
                      "(ORT 1.17.1): #{decision_reason}. " \
                      "Override with RUNANYWHERE_ONNX_COMPAT=1."
    if detection_uncertain
      decision_lines << "[VoiceActivator] WARNING: ONNX Runtime detection was " \
                        "inconclusive, so the bundled runtime was vendored. Skipping it " \
                        "breaks the link outright when nothing else provides one; " \
                        "vendoring it only misbehaves when something does."
      decision_lines << "[VoiceActivator] If your app already links its own ONNX " \
                        "Runtime, set RUNANYWHERE_ONNX_COMPAT=1: two runtimes in one " \
                        "binary can end in \"The requested API version is not " \
                        "available\" and a SIGSEGV. RUNANYWHERE_ONNX_COMPAT=0 pins the " \
                        "current behaviour explicitly."
    elsif external_ort_path && podfile_verdict == :not_linked
      decision_lines << "[VoiceActivator] Note: onnxruntime-react-native is installed at " \
                        "#{external_ort_path}, but its pod is not linked into this " \
                        "target, so it contributes no ONNX Runtime here. If you do end " \
                        "up with two runtimes, set RUNANYWHERE_ONNX_COMPAT=1."
    end
  end
  decision_message = decision_lines.join("\n")
  $voice_activator_ort_notices ||= {}
  if podfile_still_loading
    # A throwaway evaluation from inside Podfile loading. Its verdict is not the
    # one that ships, so printing it would only add a contradictory warning above
    # the real decision.
  elsif !$voice_activator_ort_notices[decision_message]
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
