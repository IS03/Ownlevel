const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { assertPublicEnv } = require('./src/config/public-env-policy');

// Every bundle (dev server, export, native embed) refuses unsafe public env values.
assertPublicEnv(process.env);

const config = getDefaultConfig(__dirname);
// The portable Nutrition wire contract is shared with the Next API. Expose
// this source directory, without adding the root dependency tree to Metro.
config.watchFolders = [
  ...config.watchFolders,
  path.resolve(__dirname, '../../src/lib/mobile-api'),
  // Pure date/range helpers used by the portable influence contract and client.
  path.resolve(__dirname, '../../src/lib/progress/analytics'),
  // Shared brand tokens: the runtime entry and the single file holding the values.
  path.resolve(__dirname, '../../packages/brand/src'),
  path.resolve(__dirname, '../../docs/brand/ownlevel-marca/tema'),
];
module.exports = config;
