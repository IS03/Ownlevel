import type { NutritionStages } from "@/api/nutrition-stages";
export const stageId = (n: number) =>
  `41600000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function stagesFixture({
  future = false,
  untyped = false,
  suggestions = true,
}: {
  future?: boolean;
  untyped?: boolean;
  suggestions?: boolean;
} = {}): NutritionStages {
  const weekdays = Array.from({ length: 7 }, (_, i) => ({
    weekday: i + 1,
    calorieTargetKcal: 1900,
    proteinTargetG: 130,
  }));
  return {
    today: "2026-10-16",
    listVersion: 7,
    current: {
      id: stageId(1),
      name: "Déficit de primavera",
      kind: untyped ? null : "deficit",
      startsOn: "2026-09-29",
      endsOn: future ? "2026-12-22" : null,
      sequenceId: null,
      position: null,
      duration: null,
      status: "current",
      weekdays,
      baseWaterL: 2.5,
      trainingCalorieDeltaKcal: 300,
      trainingWaterDeltaL: 0.5,
      trainingProteinDeltaG: 20,
    },
    upcoming: future
      ? [
          {
            id: stageId(2),
            name: "Volumen de verano",
            kind: "surplus",
            startsOn: "2026-12-22",
            endsOn: null,
            sequenceId: stageId(9),
            position: 1,
            duration: { unit: "months", value: 3 },
            status: "upcoming",
            weekdays: weekdays.map((d) => ({ ...d, calorieTargetKcal: 2600 })),
            baseWaterL: 2.5,
            trainingCalorieDeltaKcal: 300,
            trainingWaterDeltaL: 0.5,
      trainingProteinDeltaG: 20,
          },
        ]
      : [],
    past: [],
    sequences: future
      ? [
          {
            id: stageId(9),
            name: "Verano",
            afterEnd: "keep_last",
            createdAt: "2026-10-16T12:00:00Z",
          },
        ]
      : [],
    suggestions: suggestions
      ? {
          expenditureKcal: 2500,
          maintenance: 2500,
          deficit: 2250,
          surplus: 2625,
          recomposition: null,
          custom: null,
        }
      : null,
  };
}
