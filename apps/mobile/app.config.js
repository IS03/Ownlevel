const { assertPublicEnv } = require('./src/config/public-env-policy');
const { iosVariant } = require('./src/config/ios-variant');

// app.json stays the source of truth. Evaluated by `expo config`, `expo start`,
// `expo export`, `expo run:*` and EAS: an unsafe public env fails before any build.
module.exports = ({ config }) => {
  assertPublicEnv(process.env);
  const variant = iosVariant();
  if (process.env.EXPO_PUBLIC_IOS_VARIANT !== 'daily') return config;
  return {
    ...config,
    name: variant.name,
    scheme: variant.scheme,
    ios: { ...config.ios, bundleIdentifier: variant.bundleIdentifier },
  };
};
