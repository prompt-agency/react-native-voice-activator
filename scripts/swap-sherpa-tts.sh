#!/usr/bin/env bash
# swap-sherpa-tts.sh
#
# Replaces the sherpa-onnx static libraries bundled in this repo with the
# official v1.12.29 TTS-enabled build from the sherpa-onnx GitHub releases.
#
# The existing xcframework was built WITHOUT -DSHERPA_ONNX_ENABLE_TTS=ON.
# This script swaps in the official release that HAS TTS enabled.
#
# Run from the repo root:
#   bash scripts/swap-sherpa-tts.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/ios/Vendor/SherpaOnnx"
TMP_DIR="$(mktemp -d)"

URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.29/sherpa-onnx-v1.12.29-ios.tar.bz2"
TARBALL="$TMP_DIR/sherpa-onnx-ios.tar.bz2"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Swap sherpa-onnx to TTS-enabled build (v1.12.29)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "→ Downloading sherpa-onnx v1.12.29 iOS release (~77 MB)…"
curl -L --progress-bar "$URL" -o "$TARBALL"

echo ""
echo "→ Extracting…"
tar -xjf "$TARBALL" -C "$TMP_DIR"
EXTRACTED="$TMP_DIR/build-ios"

echo ""
echo "→ Locating static libraries…"

# The official release layout:
#   build-ios/sherpa-onnx.xcframework/ios-arm64/libsherpa-onnx.a
#   build-ios/sherpa-onnx.xcframework/ios-arm64_x86_64-simulator/libsherpa-onnx.a
#   build-ios/ios-onnxruntime/1.17.1/onnxruntime.xcframework/ios-arm64/libonnxruntime.a
#   build-ios/ios-onnxruntime/1.17.1/onnxruntime.xcframework/ios-arm64_x86_64-simulator/libonnxruntime.a

DEVICE_LIB="$EXTRACTED/sherpa-onnx.xcframework/ios-arm64/libsherpa-onnx.a"
SIM_LIB="$EXTRACTED/sherpa-onnx.xcframework/ios-arm64_x86_64-simulator/libsherpa-onnx.a"

if [ ! -f "$DEVICE_LIB" ] || [ ! -f "$SIM_LIB" ]; then
  echo "ERROR: Expected files not found. Listing all .a files:"
  find "$TMP_DIR" -name "*.a" | sort
  rm -rf "$TMP_DIR"
  exit 1
fi

echo "  Device:    $DEVICE_LIB"
echo "  Simulator: $SIM_LIB"

# ── Back up existing libraries ────────────────────────────────────────────────
DEVICE_DEST="$VENDOR_DIR/sherpa-onnx.xcframework/ios-arm64"
SIM_DEST="$VENDOR_DIR/sherpa-onnx.xcframework/ios-arm64_x86_64-simulator"

echo ""
echo "→ Backing up existing libraries (*.bak-no-tts)…"
cp "$DEVICE_DEST/sherpa-onnx.a"    "$DEVICE_DEST/sherpa-onnx.a.bak-no-tts"
cp "$DEVICE_DEST/libsherpa-onnx.a" "$DEVICE_DEST/libsherpa-onnx.a.bak-no-tts"
cp "$SIM_DEST/sherpa-onnx.a"       "$SIM_DEST/sherpa-onnx.a.bak-no-tts"
cp "$SIM_DEST/libsherpa-onnx.a"    "$SIM_DEST/libsherpa-onnx.a.bak-no-tts"

# ── Install TTS-enabled libraries ─────────────────────────────────────────────
# The release only ships libsherpa-onnx.a; copy to both names used by this repo.
echo "→ Installing TTS-enabled sherpa-onnx libraries…"
cp "$DEVICE_LIB" "$DEVICE_DEST/sherpa-onnx.a"
cp "$DEVICE_LIB" "$DEVICE_DEST/libsherpa-onnx.a"
cp "$SIM_LIB"    "$SIM_DEST/sherpa-onnx.a"
cp "$SIM_LIB"    "$SIM_DEST/libsherpa-onnx.a"

# ── Also replace onnxruntime (same ORT 1.17.1; keeps symbol namespaces in sync)
ORT_BASE="$EXTRACTED/ios-onnxruntime/1.17.1/onnxruntime.xcframework"
ORT_DEVICE_LIB="$ORT_BASE/ios-arm64/libonnxruntime.a"
ORT_SIM_LIB="$ORT_BASE/ios-arm64_x86_64-simulator/libonnxruntime.a"

if [ -f "$ORT_DEVICE_LIB" ] && [ -f "$ORT_SIM_LIB" ]; then
  ORT_DEVICE_DEST="$VENDOR_DIR/sherpa-onnxruntime.xcframework/ios-arm64"
  ORT_SIM_DEST="$VENDOR_DIR/sherpa-onnxruntime.xcframework/ios-arm64_x86_64-simulator"
  echo "→ Replacing onnxruntime libraries (ORT 1.17.1)…"
  cp "$ORT_DEVICE_LIB" "$ORT_DEVICE_DEST/onnxruntime.a"
  cp "$ORT_DEVICE_LIB" "$ORT_DEVICE_DEST/libonnxruntime.a"
  cp "$ORT_SIM_LIB"    "$ORT_SIM_DEST/onnxruntime.a"
  cp "$ORT_SIM_LIB"    "$ORT_SIM_DEST/libonnxruntime.a"
else
  echo "  (onnxruntime not found in expected path; keeping existing)"
fi

# ── Cleanup ───────────────────────────────────────────────────────────────────
rm -rf "$TMP_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done! TTS-enabled sherpa-onnx installed."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  NEXT STEPS:"
echo "  1. In Xcode: Product → Clean Build Folder (⇧⌘K)"
echo "  2. Build & Run (⌘R)"
echo "  3. Tap 'Speak (Ryan · Sherpa-ONNX)' — audio should play"
echo ""
echo "  To revert: copy *.bak-no-tts files back and clean build"
echo ""
