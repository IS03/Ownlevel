const { assertPublicEnv } = require('./src/config/public-env-policy');
const { iosVariant } = require('./src/config/ios-variant');

// app.json stays the source of truth. Evaluated by `expo config`, `expo start`,
// `expo export`, `expo run:*` and EAS: an unsafe public env fails before any build.
module.exports = ({ config }) => {
  assertPublicEnv(process.env);
  const variant = iosVariant();
  const daily = process.env.EXPO_PUBLIC_IOS_VARIANT === 'daily';
  const bundleIdentifier = daily ? variant.bundleIdentifier : config.ios.bundleIdentifier;
  // The workout Live Activity (#634): its own extension and App Group per variant, no push.
  const widgets = ['expo-widgets', {
    bundleIdentifier: `${bundleIdentifier}.live`,
    groupIdentifier: `group.${bundleIdentifier}`,
    enablePushNotifications: false,
    widgets: [],
  }];
  const plugins = [...(config.plugins ?? []), widgets];
  if (!daily) return { ...config, plugins };
  return {
    ...config,
    name: variant.name,
    scheme: variant.scheme,
    ios: { ...config.ios, bundleIdentifier },
    plugins,
  };
};
