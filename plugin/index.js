const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

const candidates = [
  './build/src/expo/config-plugin.js',
  '../lib/module/expo/config-plugin.js',
];

let resolvedPlugin = null;

for (const candidate of candidates) {
  if (existsSync(resolve(__dirname, candidate))) {
    resolvedPlugin = require(candidate);
    break;
  }
}

if (!resolvedPlugin) {
  throw new Error(
    'Unable to resolve the Expo config plugin entrypoint. Expected one of: ' +
      candidates.join(', ')
  );
}

module.exports = resolvedPlugin;
