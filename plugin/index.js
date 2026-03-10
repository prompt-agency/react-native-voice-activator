const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

const candidates = [
  './build/src/expo/config-plugin.js',
  '../lib/module/expo/config-plugin.js',
];

for (const candidate of candidates) {
  if (existsSync(resolve(__dirname, candidate))) {
    module.exports = require(candidate);
    return;
  }
}

throw new Error(
  'Unable to resolve the Expo config plugin entrypoint. Expected one of: '
    + candidates.join(', ')
);
