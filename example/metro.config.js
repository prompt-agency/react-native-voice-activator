const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withMetroConfig } = require('react-native-monorepo-config');

const root = path.resolve(__dirname, '..');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = withMetroConfig(getDefaultConfig(__dirname), {
  root,
  dirname: __dirname,
});

// whisper.rn exports only "./*", not "." — avoid Metro export warnings / bad resolution.
const whisperRnEntry = path.resolve(
  __dirname,
  'node_modules/whisper.rn/src/index.ts'
);
const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'whisper.rn') {
    return { type: 'sourceFile', filePath: whisperRnEntry };
  }
  return upstreamResolveRequest(context, moduleName, platform);
};

module.exports = config;
