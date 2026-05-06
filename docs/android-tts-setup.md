# Android TTS Setup

`SherpaOnnxTTSAdapter` runs Piper VITS synthesis natively via the sherpa-onnx layer bundled with this package. On Android the model files must be bundled as APK assets at build time and then copied to a writable path at runtime before the adapter can use them.

## Prerequisites

Install `react-native-fs` if you haven't already — it is an optional peer dependency and must be explicitly added:

```sh
yarn add react-native-fs
# or
npm install react-native-fs
```

## Step 1 — Bundle Model Assets

Download the `vits-piper-en_US-ryan-low` model package (~65 MB) and place the required files under your app's Android assets directory.

### Option A: Manual setup (recommended for consumer apps)

Run the following from your project root:

```sh
mkdir -p android/app/src/main/assets/sherpa-tts

curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-ryan-low.tar.bz2 \
  | tar -xj --strip-components=1 \
    -C android/app/src/main/assets/sherpa-tts \
    vits-piper-en_US-ryan-low/en_US-ryan-low.onnx \
    vits-piper-en_US-ryan-low/tokens.txt \
    vits-piper-en_US-ryan-low/espeak-ng-data
```

### Option B: Setup script (monorepo / example app only)

If you are working inside the `react-native-voice-activator` repository itself:

```sh
bash example/scripts/setup-sherpa-tts-android.sh
```

> **Warning:** This script resolves paths relative to itself and writes assets into `example/android/`. It is not suitable for consumer apps — use Option A instead.

### Verify asset layout

After setup, confirm these three items exist:

```
android/app/src/main/assets/
└── sherpa-tts/
    ├── en_US-ryan-low.onnx
    ├── tokens.txt
    └── espeak-ng-data/        ← directory tree, ~1 MB
```

Rebuild the Android app after adding assets:

```sh
# React Native CLI / Expo:
yarn android

# or directly via Gradle:
cd android && ./gradlew assembleDebug
```

## Step 2 — Copy Assets to a Writable Path at Runtime

Android assets are read-only and cannot be passed as file paths to native code. Copy them to `DocumentDirectory` on first launch before creating the adapter.

Add this utility to your app — it is Android-specific and must only be called on Android:

```typescript
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

// The destination directory name is arbitrary — choose any value consistent
// with the rest of your app.
const SHERPA_TTS_DIR = `${RNFS.DocumentDirectoryPath}/sherpa-tts`;

async function copyAndroidAssetDir(
  assetDir: string,
  destDir: string
): Promise<void> {
  if (!(await RNFS.exists(destDir))) {
    await RNFS.mkdir(destDir);
  }
  const entries = await (RNFS as any).readDirAssets(assetDir);
  for (const entry of entries) {
    const destPath = `${destDir}/${entry.name}`;
    if (entry.isDirectory()) {
      await copyAndroidAssetDir(`${assetDir}/${entry.name}`, destPath);
    } else if (!(await RNFS.exists(destPath))) {
      await (RNFS as any).copyFileAssets(`${assetDir}/${entry.name}`, destPath);
    }
  }
}

export async function ensureSherpaAssets(): Promise<{
  modelPath: string;
  tokensPath: string;
  dataDir: string;
}> {
  if (Platform.OS !== 'android') {
    throw new Error('ensureSherpaAssets() is Android-only. See the iOS TTS setup guide.');
  }

  if (!(await RNFS.exists(SHERPA_TTS_DIR))) {
    await RNFS.mkdir(SHERPA_TTS_DIR);
  }

  const modelPath = `${SHERPA_TTS_DIR}/en_US-ryan-low.onnx`;
  const tokensPath = `${SHERPA_TTS_DIR}/tokens.txt`;
  const dataDir = `${SHERPA_TTS_DIR}/espeak-ng-data`;

  if (!(await RNFS.exists(modelPath))) {
    await (RNFS as any).copyFileAssets('sherpa-tts/en_US-ryan-low.onnx', modelPath);
  }
  if (!(await RNFS.exists(tokensPath))) {
    await (RNFS as any).copyFileAssets('sherpa-tts/tokens.txt', tokensPath);
  }
  if (!(await RNFS.exists(dataDir))) {
    await copyAndroidAssetDir('sherpa-tts/espeak-ng-data', dataDir);
  }

  return { modelPath, tokensPath, dataDir };
}
```

Call `ensureSherpaAssets()` once on Android before the first TTS call:

```typescript
import { Platform } from 'react-native';

// In your app initialisation or before first TTS usage:
if (Platform.OS === 'android') {
  const assets = await ensureSherpaAssets();
  // use assets.modelPath, assets.tokensPath, assets.dataDir
}
```

## Step 3 — Wire Up the Adapter

```typescript
import { Platform } from 'react-native';
import { SherpaOnnxTTSAdapter } from 'react-native-voice-activator';
import { ensureSherpaAssets } from './sherpa-tts-utils'; // your utility from Step 2

let tts: SherpaOnnxTTSAdapter;

if (Platform.OS === 'android') {
  const { modelPath, tokensPath, dataDir } = await ensureSherpaAssets();
  tts = new SherpaOnnxTTSAdapter({ modelPath, tokensPath, dataDir });
}
// On iOS, provide modelPath/tokensPath/dataDir from the app bundle instead.

await tts.speak('Hello from Android TTS.');
```

Pass the adapter to `initialize()` for full wake-word + TTS sessions:

```typescript
import { initialize } from 'react-native-voice-activator';

await initialize({
  engineConfig: { assetKeys: { keywordAssetKey: 'keywords.txt' } },
  ttsProvider: tts,
  sttProvider: mySttProvider,
});
```

## Troubleshooting

**`copyFileAssets` throws — model asset not found**

The assets were not placed in `android/app/src/main/assets/sherpa-tts/` or the APK was not rebuilt after adding them. Re-run the setup from Step 1 (Option A) and do a clean Android build:

```sh
cd android && ./gradlew clean assembleDebug
```

**Silent audio / no output after `speak()`**

Confirm the three paths returned by `ensureSherpaAssets()` all exist on device before calling `speak()`. Log the paths and verify with `RNFS.exists()`.

**Native crash with no JS error on first synthesis**

You may be using a `rhasspy/piper-voices` HuggingFace model instead of the sherpa-onnx release model. Those models lack required ONNX metadata (`sample_rate`) and cause an immediate native exit. Always use the model downloaded from the sherpa-onnx releases tarball (Option A in Step 1 fetches the correct source automatically).

**`espeak-ng-data` copy takes a while on first launch**

The data directory contains ~400 small files. The copy runs once on first launch and subsequent calls are no-ops per-file. Consider showing a loading indicator while `ensureSherpaAssets()` resolves.
