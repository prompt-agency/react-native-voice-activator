#!/usr/bin/env bash
# setup-sherpa-tts.sh
#
# Downloads the vits-piper-en_US-ryan-low model package from sherpa-onnx
# releases and extracts espeak-ng-data, tokens and the ONNX model into
# example/assets/sherpa-tts/.
#
# That directory is deliberately OUTSIDE example/ios and example/android:
# both of those are gitignored, generated output that `expo prebuild --clean`
# deletes and recreates. The local Expo config plugin
# example/plugins/with-sherpa-tts-assets.js picks the assets up from here on
# every prebuild and wires them into the generated iOS and Android projects.
#
# Run once from the repo root:
#   bash example/scripts/setup-sherpa-tts.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSET_DIR="$EXAMPLE_DIR/assets/sherpa-tts"
DEST_DATA_DIR="$ASSET_DIR/espeak-ng-data"
DEST_TOKENS="$ASSET_DIR/piper-tokens.txt"
DEST_MODEL="$ASSET_DIR/en_US-ryan-low.onnx"

URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-ryan-low.tar.bz2"
TMP_DIR="$(mktemp -d)"
TARBALL="$TMP_DIR/model.tar.bz2"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Sherpa-ONNX TTS asset setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p "$ASSET_DIR"

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
echo "  $DEST_MODEL  (sherpa-onnx build, has required ONNX metadata)"
echo ""
echo "  NEXT STEP: no Xcode work is needed. The local config plugin"
echo "  example/plugins/with-sherpa-tts-assets.js copies these into the"
echo "  generated iOS and Android projects and registers them with the app"
echo "  target on the next prebuild:"
echo ""
echo "    cd example && npx expo prebuild --clean"
echo ""
echo "  or just run the app, which prebuilds for you:"
echo ""
echo "    yarn example ios"
echo ""
echo "  NOTE: The raw Piper model from HuggingFace lacks sherpa-onnx metadata"
echo "  and will crash at runtime. Always use the bundled model from this script."
echo ""
