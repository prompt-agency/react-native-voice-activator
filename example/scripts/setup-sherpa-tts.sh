#!/usr/bin/env bash
# setup-sherpa-tts.sh
#
# Downloads the vits-piper-en_US-ryan-low model package from sherpa-onnx
# releases and extracts espeak-ng-data + tokens.txt into the iOS Xcode project
# so they are bundled with the app at build time.
#
# Run once from the repo root:
#   bash example/scripts/setup-sherpa-tts.sh
#
# After running, rebuild the iOS app (pod install not needed — only a clean
# build is required so Xcode picks up the new bundle resources).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
XCODE_APP_DIR="$SCRIPT_DIR/../ios/VoiceActivatorExample"
DEST_DATA_DIR="$XCODE_APP_DIR/espeak-ng-data"
DEST_TOKENS="$XCODE_APP_DIR/piper-tokens.txt"
DEST_MODEL="$XCODE_APP_DIR/en_US-ryan-low.onnx"

URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-ryan-low.tar.bz2"
TMP_DIR="$(mktemp -d)"
TARBALL="$TMP_DIR/model.tar.bz2"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Sherpa-ONNX TTS asset setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Download ──────────────────────────────────────────
echo ""
echo "→ Downloading vits-piper-en_US-ryan-low (~65 MB)…"
curl -L --progress-bar "$URL" -o "$TARBALL"

# ── Extract ───────────────────────────────────────────
echo ""
echo "→ Extracting…"
tar -xjf "$TARBALL" -C "$TMP_DIR"
EXTRACTED="$TMP_DIR/vits-piper-en_US-ryan-low"

# ── Copy espeak-ng-data ───────────────────────────────
if [ -d "$DEST_DATA_DIR" ]; then
  echo "→ Removing existing espeak-ng-data…"
  rm -rf "$DEST_DATA_DIR"
fi
echo "→ Copying espeak-ng-data → $DEST_DATA_DIR"
cp -r "$EXTRACTED/espeak-ng-data" "$DEST_DATA_DIR"

# ── Copy tokens.txt ───────────────────────────────────
echo "→ Copying tokens.txt → $DEST_TOKENS"
cp "$EXTRACTED/tokens.txt" "$DEST_TOKENS"

# ── Copy ONNX model (sherpa-onnx build, has required metadata) ────────────────
echo "→ Copying en_US-ryan-low.onnx → $DEST_MODEL"
cp "$EXTRACTED/en_US-ryan-low.onnx" "$DEST_MODEL"

# ── Cleanup ───────────────────────────────────────────
rm -rf "$TMP_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Assets ready"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  $DEST_DATA_DIR"
echo "  $DEST_TOKENS"
echo "  $DEST_MODEL  (sherpa-onnx build — has required ONNX metadata)"
echo ""
echo "  NEXT STEP (one time, in Xcode):"
echo "  1. Open example/ios/VoiceActivatorExample.xcworkspace"
echo "  2. In the Project navigator, right-click VoiceActivatorExample group"
echo "  3. 'Add Files to VoiceActivatorExample…'"
echo "  4. Select espeak-ng-data/ — choose 'Create folder references' (blue icon)"
echo "  5. Select piper-tokens.txt"
echo "  6. Select en_US-ryan-low.onnx"
echo "  7. Ensure target 'VoiceActivatorExample' is checked → Add"
echo "  8. Product → Clean Build Folder (⇧⌘K) → Build (⌘B)"
echo ""
echo "  NOTE: The raw Piper model from HuggingFace lacks sherpa-onnx metadata"
echo "  and will crash at runtime. Always use the bundled model from this script."
echo ""
