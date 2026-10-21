import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const plist = require('@expo/plist').default;
const xcode = require('xcode');
const { iosVariant } = require('../src/config/ios-variant');
const { assertPublicEnv } = require('../src/config/public-env-policy');
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ios = join(root, 'ios');
const originalProject = join(ios, 'OWNLEVELDev.xcodeproj');
// Keep every generated project outside ios/: Expo auto-selects the first workspace there.
const generated = join(root, '.expo', 'ios-daily', 'native');
const dailyProject = join(generated, 'OWNLEVELDaily.xcodeproj');
const dailyWorkspace = join(generated, 'OWNLEVELDaily.xcworkspace');
const marker = join(generated, 'generated.json');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { device: { type: 'string' }, team: { type: 'string' }, unsigned: { type: 'boolean' }, simulator: { type: 'boolean' } },
});
const action = positionals[0] ?? 'help';
const variant = iosVariant('daily');
const derivedData = join(root, '.expo', 'ios-daily', values.simulator ? 'simulator' : 'device');
const app = join(derivedData, 'Build', 'Products', values.simulator ? 'Release-iphonesimulator' : 'Release-iphoneos', 'OWNLEVELDaily.app');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  assert(result.status === 0, `${command} failed (${result.status}).`);
}
function output(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
}
function fingerprint() {
  return Object.fromEntries([
    'OWNLEVELDev.xcodeproj/project.pbxproj',
    'OWNLEVELDev.xcodeproj/xcshareddata/xcschemes/OWNLEVELDev.xcscheme',
    'OWNLEVELDev/Info.plist', 'OWNLEVELDev/OWNLEVELDev.entitlements', 'Podfile.lock',
  ].map(path => [path, createHash('sha256').update(readFileSync(join(ios, path))).digest('hex')]));
}
function publicConfiguration() {
  process.env.NODE_ENV = 'production';
  require('@expo/env').load(root);
  // Scope overrides to this process and its build children; never edit .env.local.
  process.env.EXPO_PUBLIC_IOS_VARIANT = 'daily';
  process.env.EXPO_PUBLIC_APP_ENV = 'production';
  assertPublicEnv(process.env);
  for (const name of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_OWNLEVEL_API_URL']) {
    const url = new URL(process.env[name] ?? '');
    assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', `${name} must be an HTTPS origin.`);
    assert(!/^(localhost|127\.|\[::1\])/.test(url.hostname), `${name} must be remotely accessible.`);
  }
  assert(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'), 'A real Supabase publishable key is required.');
  assert(!process.env.SKIP_BUNDLING, 'Unset SKIP_BUNDLING before building Daily.');
  const config = require('@expo/config').getConfig(root).exp;
  assert(config.ios.bundleIdentifier === variant.bundleIdentifier && config.scheme === variant.scheme, 'Expo Daily identity does not match.');
}
function prepare() {
  assert(existsSync(join(ios, 'Pods', 'Manifest.lock')), 'Existing Expo iOS project and installed Pods are required. See docs/mobile/ios-daily-release.md.');
  assert(readFileSync(join(ios, 'Podfile.lock')).equals(readFileSync(join(ios, 'Pods', 'Manifest.lock'))), 'Pods and Podfile.lock differ; do not regenerate implicitly.');
  if (existsSync(dailyProject) || existsSync(dailyWorkspace) || existsSync(generated)) {
    assert(existsSync(marker) && JSON.parse(readFileSync(marker, 'utf8')).generator === 'ios-daily-v1', 'Daily paths exist without our marker; refusing to overwrite.');
  }
  const project = xcode.project(join(originalProject, 'project.pbxproj'));
  project.parseSync();
  project.getFirstProject().firstProject.projectDirPath = JSON.stringify(ios);
  const bundlePhases = Object.values(project.hash.project.objects.PBXShellScriptBuildPhase).filter(phase =>
    typeof phase === 'object' && phase.name?.replaceAll('"', '') === 'Bundle React Native code and images');
  assert(bundlePhases.length === 1, 'Expected one Expo JavaScript bundle phase.');
  const bundlePhase = bundlePhases[0];
  bundlePhase.shellScript = JSON.stringify(
    'if [ "${EXPO_PUBLIC_IOS_VARIANT:-}" != "daily" ] || [ "$CONFIGURATION" != "Release" ]; then\n' +
    '  echo "error: Build Daily with npm run ios:daily -- build (Daily environment and Release required)."\n' +
    '  exit 1\nfi\n' + JSON.parse(bundlePhase.shellScript));
  const target = project.getFirstTarget().firstTarget;
  assert(target.name === 'OWNLEVELDev', 'Unexpected Expo native target.');
  const configurationList = project.pbxXCConfigurationList()[target.buildConfigurationList];
  const configurations = project.pbxXCBuildConfigurationSection();
  const targetConfigurations = configurationList.buildConfigurations.map(ref => configurations[ref.value]);
  const release = targetConfigurations.find(config => config.name === 'Release');
  assert(release, 'Release configuration is missing.');
  const team = values.team ?? release.buildSettings.DEVELOPMENT_TEAM?.replaceAll('"', '');
  assert(team && /^[A-Z0-9]{10}$/.test(team), 'Pass --team with your Xcode Personal Team ID.');
  const devId = targetConfigurations.find(config => config.name === 'Debug')?.buildSettings.PRODUCT_BUNDLE_IDENTIFIER?.replaceAll('"', '');
  assert(devId === 'fit.ownlevel.app.dev', 'Development identity differs from the audited baseline.');
  // Only this generated sibling project changes. Target name stays unchanged for Pods.
  for (const config of targetConfigurations) {
    Object.assign(config.buildSettings, {
      PRODUCT_BUNDLE_IDENTIFIER: variant.bundleIdentifier,
      PRODUCT_NAME: 'OWNLEVELDaily',
      INFOPLIST_FILE: JSON.stringify(join(generated, 'Info.plist')),
      DEVELOPMENT_TEAM: team,
      CODE_SIGN_STYLE: 'Automatic',
      CODE_SIGN_IDENTITY: '"Apple Development"',
    });
    delete config.buildSettings.PROVISIONING_PROFILE;
    delete config.buildSettings.PROVISIONING_PROFILE_SPECIFIER;
  }
  const info = plist.parse(readFileSync(join(ios, 'OWNLEVELDev', 'Info.plist'), 'utf8'));
  info.CFBundleDisplayName = variant.name;
  info.CFBundleURLTypes = [{ CFBundleURLSchemes: [variant.scheme, variant.bundleIdentifier] }];
  delete info.NSBonjourServices;
  delete info.NSLocalNetworkUsageDescription;
  delete info.RCTMetroPort;
  delete info.NSAppTransportSecurity?.NSAllowsLocalNetworking;
  mkdirSync(join(dailyProject, 'xcshareddata', 'xcschemes'), { recursive: true });
  mkdirSync(dailyWorkspace, { recursive: true });
  mkdirSync(generated, { recursive: true });
  writeFileSync(join(dailyProject, 'project.pbxproj'), project.writeSync());
  writeFileSync(join(generated, 'Info.plist'), plist.build(info));
  let scheme = readFileSync(join(originalProject, 'xcshareddata', 'xcschemes', 'OWNLEVELDev.xcscheme'), 'utf8');
  scheme = scheme.replace(/<TestAction[\s\S]*?<\/TestAction>/, '')
    .replaceAll('container:OWNLEVELDev.xcodeproj', `container:${dailyProject.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')}`)
    .replaceAll('OWNLEVELDev.app', 'OWNLEVELDaily.app')
    .replaceAll('buildConfiguration = "Debug"', 'buildConfiguration = "Release"')
    .replaceAll('selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"', 'selectedDebuggerIdentifier = ""')
    .replaceAll('selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"', 'selectedLauncherIdentifier = "Xcode.IDEFoundation.Launcher.PosixSpawn"');
  writeFileSync(join(dailyProject, 'xcshareddata', 'xcschemes', 'OWNLEVELDaily.xcscheme'), scheme);
  const podsProject = join(ios, 'Pods', 'Pods.xcodeproj').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  writeFileSync(join(dailyWorkspace, 'contents.xcworkspacedata'), `<?xml version="1.0" encoding="UTF-8"?><Workspace version="1.0"><FileRef location="group:OWNLEVELDaily.xcodeproj"/><FileRef location="absolute:${podsProject}"/></Workspace>\n`);
  writeFileSync(marker, JSON.stringify({ generator: 'ios-daily-v1', team }, null, 2) + '\n');
  console.log(`Daily workspace: ${dailyWorkspace}\nPersonal Team candidate: ${team} (confirm in Xcode)`);
}
function verify() {
  const info = plist.parse(output('plutil', ['-convert', 'xml1', '-o', '-', join(app, 'Info.plist')]));
  assert(info.CFBundleIdentifier === variant.bundleIdentifier, 'Refusing app with a non-Daily bundle ID.');
  assert(info.CFBundleDisplayName === variant.name, 'Unexpected Daily display name.');
  assert(JSON.stringify(info.CFBundleURLTypes) === JSON.stringify([{ CFBundleURLSchemes: [variant.scheme, variant.bundleIdentifier] }]), 'Daily URL schemes are incorrect.');
  assert(!info.NSBonjourServices && !info.NSLocalNetworkUsageDescription && !info.RCTMetroPort, 'Development discovery settings leaked into Daily.');
  const bundle = readFileSync(join(app, 'main.jsbundle'));
  assert(bundle.length > 100_000, 'Embedded JavaScript bundle is missing or too small.');
  for (const value of [variant.scheme, variant.keychainService, process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, process.env.EXPO_PUBLIC_OWNLEVEL_API_URL]) {
    assert(bundle.includes(Buffer.from(value)), 'Embedded public configuration does not match this build environment.');
  }
  // The SDK contains the bare prefix in its key-type classifier. Reject key payloads.
  // Decode Hermes strings first: its binary string table can concatenate unrelated strings.
  const decoded = output(join(root, 'node_modules', 'hermes-compiler', 'hermesc', 'osx-bin', 'hermesc'), ['-b', '-dump-bytecode', join(app, 'main.jsbundle')]);
  const secretPattern = new RegExp(['sb', 'secret', ''].join('_') + '[A-Za-z0-9_-]{16,}');
  assert(!secretPattern.test(decoded), 'A secret key payload was found in the bundle.');
  let expiration = null;
  if (!values.unsigned && !values.simulator) {
    run('codesign', ['--verify', '--deep', '--strict', app]);
    const profile = plist.parse(output('security', ['cms', '-D', '-i', join(app, 'embedded.mobileprovision')]));
    const team = JSON.parse(readFileSync(marker, 'utf8')).team;
    assert(profile.TeamIdentifier?.includes(team), 'Provisioning team differs from the generated project.');
    const applicationId = profile.Entitlements?.['application-identifier'];
    assert(applicationId === `${team}.${variant.bundleIdentifier}` || applicationId === `${team}.*`, 'Profile does not cover Daily.');
    assert(profile.ProvisionedDevices?.length > 0 && !profile.ProvisionsAllDevices, 'Expected on-device development provisioning.');
    assert(profile.LocalProvision === true, 'Expected free Personal Team provisioning; select your Personal Team in Xcode.');
    const signedEntitlements = plist.parse(output('codesign', ['-d', '--entitlements', ':-', app]));
    assert(signedEntitlements['application-identifier'] === `${team}.${variant.bundleIdentifier}`, 'Signed application identity differs from Daily.');
    if (values.device) assert(profile.ProvisionedDevices.includes(values.device), 'Profile does not include this device UDID.');
    expiration = new Date(profile.ExpirationDate).toISOString();
    assert(new Date(expiration).getTime() > Date.now(), 'Provisioning profile has expired; rebuild with Xcode.');
    console.log(`Profile expires: ${expiration}`);
  }
  console.log(`Verified ${values.unsigned ? 'UNSIGNED ' : ''}Release bundle: ${app}`);
  return { bundleIdentifier: variant.bundleIdentifier, expiration };
}

try {
  if (action === 'help') {
    console.log('npm run ios:daily -- prepare|build|verify|install [--device UDID] [--team TEAMID] [--unsigned] [--simulator]\nBuild embeds JS without changing the running development server. Install only accepts a signed device build.');
  } else {
    assert(['prepare', 'build', 'verify', 'install'].includes(action) && positionals.length === 1, 'Unknown command. Run npm run ios:daily for help.');
    assert(!(values.unsigned && action === 'install') && !(values.simulator && action === 'install'), 'Only signed physical-device builds can be installed.');
    const before = fingerprint();
    publicConfiguration();
    if (action === 'prepare' || action === 'build') prepare();
    if (action === 'build') {
      const args = ['-workspace', dailyWorkspace, '-scheme', 'OWNLEVELDaily', '-configuration', 'Release', '-derivedDataPath', derivedData, '-destination', values.simulator ? 'generic/platform=iOS Simulator' : values.device ? `id=${values.device}` : 'generic/platform=iOS', '-quiet'];
      if (values.unsigned || values.simulator) args.push('CODE_SIGNING_ALLOWED=NO');
      else args.push('-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration');
      run('xcodebuild', [...args, 'build']);
    }
    if (['build', 'verify', 'install'].includes(action)) verify();
    assert(JSON.stringify(before) === JSON.stringify(fingerprint()), 'Original Development project changed during this operation; inspect before proceeding.');
    if (action === 'install') {
      assert(values.device, 'Pass --device with the physical device UDID.');
      run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', values.device, app]);
      run('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', values.device, variant.bundleIdentifier]);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
