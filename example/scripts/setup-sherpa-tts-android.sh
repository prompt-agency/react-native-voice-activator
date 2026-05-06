#!/usr/bin/env bash
# setup-sherpa-tts-android.sh
#
# Downloads the vits-piper-en_US-ryan-low model package from sherpa-onnx
# releases and copies espeak-ng-data into the Android assets directory so
# it is bundled with the APK at build time.
#
# Run once from the repo root:
#   bash example/scripts/setup-sherpa-tts-android.sh
#
# After running, rebuild the Android app (gradle clean build).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_ASSETS_DIR="$SCRIPT_DIR/../android/app/src/main/assets/sherpa-tts"
DEST_DATA_DIR="$ANDROID_ASSETS_DIR/espeak-ng-data"

URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-ryan-low.tar.bz2"
TMP_DIR="$(mktemp -d)"
TARBALL="$TMP_DIR/model.tar.bz2"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Sherpa-ONNX TTS asset setup (Android)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p "$ANDROID_ASSETS_DIR"

echo ""
echo "→ Downloading vits-piper-en_US-ryan-low (~65 MB)…"
curl -L --progress-bar "$URL" -o "$TARBALL"

echo ""
echo "→ Extracting…"
tar -xjf "$TARBALL" -C "$TMP_DIR"
EXTRACTED="$TMP_DIR/vits-piper-en_US-ryan-low"

if [ -d "$DEST_DATA_DIR" ]; then
  echo "→ Removing existing espeak-ng-data…"
  rm -rf "$DEST_DATA_DIR"
fi
echo "→ Copying espeak-ng-data → $DEST_DATA_DIR"
cp -r "$EXTRACTED/espeak-ng-data" "$DEST_DATA_DIR"

DEST_MODEL="$ANDROID_ASSETS_DIR/en_US-ryan-low.onnx"
echo "→ Copying en_US-ryan-low.onnx → $DEST_MODEL"
cp "$EXTRACTED/en_US-ryan-low.onnx" "$DEST_MODEL"

DEST_TOKENS="$ANDROID_ASSETS_DIR/tokens.txt"
echo "→ Copying tokens.txt → $DEST_TOKENS"
cp "$EXTRACTED/tokens.txt" "$DEST_TOKENS"

rm -rf "$TMP_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Android assets ready"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  $DEST_MODEL  (sherpa-onnx build — has required ONNX metadata)"
echo "  $DEST_TOKENS"
echo "  $DEST_DATA_DIR"
echo ""
echo "  NEXT STEP: rebuild the Android app"
echo "  cd example && yarn android"
echo ""
