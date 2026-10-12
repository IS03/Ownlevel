import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const iosRoot = join(mobileRoot, 'ios');
const snapshot = join(mobileRoot, 'native-lock', 'Podfile.lock');
const expected = JSON.parse(readFileSync(join(mobileRoot, 'native-lock', 'toolchain.json'), 'utf8'));

function version(command, args = ['--version']) {
  return execFileSync(command, args, { cwd: mobileRoot, encoding: 'utf8' }).trim().split('\n')[0];
}

function run(command, args, cwd = mobileRoot) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

function verifyToolchain() {
  const installed = {
    node: process.version,
    npm: version('npm'),
    xcode: version('xcodebuild', ['-version']),
    cocoapods: version('pod'),
  };
  for (const [tool, wanted] of Object.entries(expected)) {
    if (installed[tool] !== wanted) {
      throw new Error(`${tool}: expected ${wanted}, found ${installed[tool]}. Use the documented baseline or update the lock in a separate reviewed change.`);
    }
  }
}

function verifyPatch(packageName, packageVersion) {
  const installed = JSON.parse(readFileSync(join(mobileRoot, 'node_modules', packageName, 'package.json'), 'utf8'));
  if (installed.version !== packageVersion) {
    throw new Error(`${packageName}: expected ${packageVersion}, found ${installed.version}`);
  }
  const patchFile = join(mobileRoot, 'patches', `${packageName}+${packageVersion}.patch`);
  const result = spawnSync('patch', ['--dry-run', '--reverse', '-p1', '-d', mobileRoot], {
    input: readFileSync(patchFile), encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`${packageName} patch is not applied: ${result.stderr || result.stdout}`);
}

try {
  if (existsSync(iosRoot)) {
    throw new Error('apps/mobile/ios already exists. Run this only in a clean checkout; this command never removes a native project.');
  }
  if (!existsSync(join(mobileRoot, 'node_modules'))) throw new Error('Run npm ci inside apps/mobile first.');
  verifyToolchain();
  verifyPatch('expo-router', '57.0.22');
  verifyPatch('react-native-screens', '4.26.2');
  run(join(mobileRoot, 'node_modules', '.bin', 'expo'), ['prebuild', '--platform', 'ios', '--no-install']);
  if (!existsSync(join(iosRoot, 'Podfile'))) throw new Error('Expo did not generate an iOS Podfile.');
  copyFileSync(snapshot, join(iosRoot, 'Podfile.lock'));
  run('pod', ['install', '--deployment'], iosRoot);
  if (!readFileSync(snapshot).equals(readFileSync(join(iosRoot, 'Podfile.lock')))) {
    throw new Error('CocoaPods changed the locked Podfile.lock.');
  }
  console.log('iOS project generated with the reviewed CocoaPods lock.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
