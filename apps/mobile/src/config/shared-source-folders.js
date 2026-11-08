// Source folders outside apps/mobile that the Mobile bundle imports at runtime
// (directly or through another shared file), relative to the repo root. Metro only
// sees folders listed in watchFolders, so metro.config.js exposes exactly these,
// without adding src/lib whole or the root dependency tree. CommonJS so
// metro.config.js and the guard test (shared-source-folders.test.ts) share the list.
const SHARED_SOURCE_FOLDERS = [
  // Portable wire contracts shared with the Next API.
  'src/lib/mobile-api',
  // Pure date/range helpers used by the portable influence contract and client.
  'src/lib/progress/analytics',
  // Weekly weight averages shared with Web (Progreso weekly weights, insights exploration).
  'src/lib/progress/body-evolution',
  // Insights period ranges, session timing and exploration used by the insights contract.
  'src/lib/progress/insights-engine',
  // Partial performance reading constants and kernel used by the insights contract.
  'src/lib/progress/performance-insights',
  // Sleep night helpers shared by the metric entry and day write editors.
  'src/lib/daily-metrics',
  // Pure Nutrition engine factors (plan-v2-core) for the local Energía preview.
  'src/lib/nutrition',
  // Shared brand tokens: the runtime entry and the single file holding the values.
  'packages/brand/src',
  'docs/brand/ownlevel-marca/tema',
];

module.exports = { SHARED_SOURCE_FOLDERS };
