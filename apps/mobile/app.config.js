const { assertPublicEnv } = require('./src/config/public-env-policy');
const { iosVariant } = require('./src/config/ios-variant');
const { withEntitlementsPlist } = require('expo/config-plugins');

// expo-widgets 57 writes `aps-environment` even with enablePushNotifications: false. The Live Activity is updated by the
// app, never by push (#639 decides push apart), and a personal signing team cannot sign that entitlement: remove it.
// Listed before expo-widgets on purpose: mods of plugins listed earlier run later, so this runs after its write.
const withoutWidgetPush = config => withEntitlementsPlist(config, mod => {
  delete mod.modResults['aps-environment'];
  return mod;
});

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
  const plugins = [...(config.plugins ?? []), withoutWidgetPush, widgets];
  if (!daily) return { ...config, plugins };
  return {
    ...config,
    name: variant.name,
    scheme: variant.scheme,
    ios: { ...config.ios, bundleIdentifier },
    plugins,
  };
};
