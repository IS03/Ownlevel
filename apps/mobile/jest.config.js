module.exports = {
  preset: 'jest-expo',
  clearMocks: true,
  setupFiles: ['react-native-gesture-handler/jestSetup'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Shared contracts live above apps/mobile; resolve their Babel helpers from this app's install.
  modulePaths: ['<rootDir>/node_modules'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
  // lucide-react-native resolves to an ESM .mjs build that Jest does not transform; use its CJS build in tests.
  moduleNameMapper: { '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js' },
};
