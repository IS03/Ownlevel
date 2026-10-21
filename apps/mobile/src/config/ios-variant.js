// Default remains the existing Development Build, including its persisted session.
function iosVariant(value = process.env.EXPO_PUBLIC_IOS_VARIANT) {
  if (value && value !== 'development' && value !== 'daily') {
    throw new Error('EXPO_PUBLIC_IOS_VARIANT must be development or daily.');
  }
  const daily = value === 'daily';
  return {
    name: daily ? 'OWNLEVEL Diario' : 'OWNLEVEL Dev',
    bundleIdentifier: daily ? 'fit.ownlevel.app.daily' : 'fit.ownlevel.app.dev',
    scheme: daily ? 'ownlevel-daily' : 'ownlevel-dev',
    keychainService: daily ? 'fit.ownlevel.app.daily.auth' : 'fit.ownlevel.app.dev.auth',
  };
}

module.exports = { iosVariant };
