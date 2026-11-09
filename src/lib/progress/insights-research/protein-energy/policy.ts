/** Research only. Frozen before the development run; not a public association method or a calibrated test. */
export const POLICY = Object.freeze({
  version: "protein-energy-predictive/dev-1",
  postGraceHours: 2,
  months: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36] as readonly number[],
  minTrain: 96,
  minEvaluation: 24,
  minCoverage: 0.6,
  minOutcomeCategories: 3,
  maxRoutines: 4,
  minContextRows: 8,
  minDistinctProtein: 4,
  minProteinLogSd: 0.15,
  ridge: 0.03,
  iterations: 256,
  proteinClip: 3,
  diagnosticGain: 0.02,
  development: { seeds: [17011, 17029], scenarios: ["null", "effect", "confounded"], maxSeconds: 120, maxRssMiB: 512 },
});
