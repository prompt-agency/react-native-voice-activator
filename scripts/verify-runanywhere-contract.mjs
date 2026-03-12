import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];

function read(relativePath) {
  const absolutePath = join(root, relativePath);

  if (!existsSync(absolutePath)) {
    errors.push(`Missing required file: ${relativePath}`);
    return '';
  }

  return readFileSync(absolutePath, 'utf8');
}

function expectMatch(source, pattern, message) {
  if (!pattern.test(source)) {
    errors.push(message);
  }
}

const packageJson = JSON.parse(read('package.json') || '{}');
const corePackageJson = JSON.parse(
  read('node_modules/@runanywhere/core/package.json') || '{}'
);
const onnxPackageJson = JSON.parse(
  read('node_modules/@runanywhere/onnx/package.json') || '{}'
);
const coreIndex = read('node_modules/@runanywhere/core/src/index.ts');
const coreRunAnywhere = read('node_modules/@runanywhere/core/src/Public/RunAnywhere.ts');
const sttExtension = read(
  'node_modules/@runanywhere/core/src/Public/Extensions/RunAnywhere+STT.ts'
);
const ttsExtension = read(
  'node_modules/@runanywhere/core/src/Public/Extensions/RunAnywhere+TTS.ts'
);
const onnxIndex = read('node_modules/@runanywhere/onnx/src/index.ts');
const onnxSource = read('node_modules/@runanywhere/onnx/src/ONNX.ts');

if ((packageJson.devDependencies ?? {})['@runanywhere/core'] == null) {
  errors.push('package.json must include @runanywhere/core in devDependencies for contract verification.');
}

if ((packageJson.devDependencies ?? {})['@runanywhere/onnx'] == null) {
  errors.push('package.json must include @runanywhere/onnx in devDependencies for contract verification.');
}

if (corePackageJson.version == null) {
  errors.push('Unable to determine installed @runanywhere/core version.');
}

if (onnxPackageJson.version == null) {
  errors.push('Unable to determine installed @runanywhere/onnx version.');
}

expectMatch(
  coreIndex,
  /export\s*\{\s*RunAnywhere\s*\}\s*from\s*['"]\.\/Public\/RunAnywhere['"]/,
  '@runanywhere/core no longer re-exports RunAnywhere from src/Public/RunAnywhere.ts.'
);

for (const methodName of [
  'loadSTTModel',
  'unloadSTTModel',
  'transcribeFile',
  'loadTTSModel',
  'unloadTTSModel',
  'speak',
  'stopSpeaking',
]) {
  expectMatch(
    coreRunAnywhere,
    new RegExp(`\\b${methodName}\\s*:\\s*[A-Z]+\\.${methodName}\\b`),
    `RunAnywhere contract drift: RunAnywhere no longer exposes ${methodName} via its extension binding in @runanywhere/core/src/Public/RunAnywhere.ts.`
  );
}

expectMatch(
  sttExtension,
  /export\s+async\s+function\s+loadSTTModel\s*\(\s*modelPath:\s*string,\s*modelType:\s*string\s*=\s*'whisper'/,
  'RunAnywhere STT contract drift: expected loadSTTModel(modelPath, modelType = "whisper", config?) signature.'
);

expectMatch(
  sttExtension,
  /export\s+async\s+function\s+unloadSTTModel\s*\(\s*\)\s*:\s*Promise<boolean>/,
  'RunAnywhere STT contract drift: expected unloadSTTModel(): Promise<boolean>.'
);

expectMatch(
  sttExtension,
  /export\s+async\s+function\s+transcribeFile\s*\(\s*filePath:\s*string,\s*options\?:\s*STTOptions\s*\)\s*:\s*Promise<STTResult>/,
  'RunAnywhere STT contract drift: expected transcribeFile(filePath, options?) to return Promise<STTResult>.'
);

expectMatch(
  ttsExtension,
  /export\s+async\s+function\s+loadTTSModel\s*\(\s*modelPath:\s*string,\s*modelType:\s*string\s*=\s*'piper'/,
  'RunAnywhere TTS contract drift: expected loadTTSModel(modelPath, modelType = "piper", config?) signature.'
);

expectMatch(
  ttsExtension,
  /export\s+async\s+function\s+unloadTTSModel\s*\(\s*\)\s*:\s*Promise<boolean>/,
  'RunAnywhere TTS contract drift: expected unloadTTSModel(): Promise<boolean>.'
);

expectMatch(
  ttsExtension,
  /export\s+async\s+function\s+speak\s*\(\s*text:\s*string,\s*options\?:\s*TTSOptions\s*\)\s*:\s*Promise<TTSSpeakResult>/,
  'RunAnywhere TTS contract drift: expected speak(text, options?) to return Promise<TTSSpeakResult>.'
);

expectMatch(
  ttsExtension,
  /export\s+async\s+function\s+stopSpeaking\s*\(\s*\)\s*:\s*Promise<void>/,
  'RunAnywhere TTS contract drift: expected stopSpeaking(): Promise<void>.'
);

expectMatch(
  onnxIndex,
  /export\s*\{\s*ONNX\b[^}]*\}\s*from\s*['"]\.\/ONNX['"]/,
  '@runanywhere/onnx no longer exports ONNX from src/ONNX.ts.'
);

expectMatch(
  onnxSource,
  /\bregister\(\)\s*:\s*void\s*\{/,
  'RunAnywhere ONNX contract drift: expected ONNX.register() to remain a synchronous void method.'
);

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `RunAnywhere contract verification passed for @runanywhere/core@${corePackageJson.version} and @runanywhere/onnx@${onnxPackageJson.version}.`
  );
}
