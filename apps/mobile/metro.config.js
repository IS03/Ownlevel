const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { assertPublicEnv } = require('./src/config/public-env-policy');
const { SHARED_SOURCE_FOLDERS } = require('./src/config/shared-source-folders');

// Every bundle (dev server, export, native embed) refuses unsafe public env values.
assertPublicEnv(process.env);

const config = getDefaultConfig(__dirname);
// Pure code shared with Web lives above apps/mobile. Expose only the folders the app
// imports (listed, with reasons, in shared-source-folders.js and guarded by its test),
// without adding the root dependency tree to Metro.
config.watchFolders = [
  ...config.watchFolders,
  ...SHARED_SOURCE_FOLDERS.map((folder) => path.resolve(__dirname, '../..', folder)),
];
module.exports = config;
