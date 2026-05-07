#!/usr/bin/env bash
# setup-sherpa-speaker.sh
#
# Downloads the Sherpa-ONNX campplus speaker embedding model and places it
# in the Android assets folder so it can be loaded at runtime.
#
# Run once from the repo root:
#   bash example/scripts/setup-sherpa-speaker.sh
#
# After running, rebuild and run the Android app. No clean build required.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_ASSETS="$SCRIPT_DIR/../android/app/src/main/assets/SherpaOnnxSpeaker"
DEST="$ANDROID_ASSETS/model.onnx"

MODEL_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Sherpa-ONNX Speaker Embedding asset setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p "$ANDROID_ASSETS"

echo ""
echo "→ Downloading campplus speaker embedding model (~17 MB)…"
curl -L --progress-bar "$MODEL_URL" -o "$DEST"

echo ""
echo "✓ Done. Model saved to: $DEST"
echo ""
echo "  Rebuild and run the Android app:"
echo "    yarn example android"
echo ""
echo "  initialize() is already configured with:"
echo "    speakerModelPath: 'SherpaOnnxSpeaker/model.onnx'"
