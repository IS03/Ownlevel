/** Leaf module (no imports) so the permit check in the generator cannot create an import cycle. */
export const GENERATOR_VERSION = "preregistered-generator/2";
export const NULL_SCENARIOS = ["N1_iid", "N2_persist", "N3_strong_persist", "N4_trends", "N5_recorded_changes", "N6_unrecorded_changes", "N7_collider_missing", "N7b_missing_by_exposure", "N8_retro_selection", "N9_sparse"] as const;
export const POSITIVE_SCENARIOS = ["P10", "P15", "P20", "P25", "P15_sparse"] as const;
/** Out-of-domain stress scenarios; deliberately outside NULL_SCENARIOS so pilot phases 1 and 2 stay unchanged. */
export const STRESS_SCENARIOS = ["S1_short_trends", "S2_anticipatory_missing"] as const;
export const SCENARIOS = [...NULL_SCENARIOS, ...POSITIVE_SCENARIOS, ...STRESS_SCENARIOS] as const;
export type Scenario = (typeof SCENARIOS)[number];
