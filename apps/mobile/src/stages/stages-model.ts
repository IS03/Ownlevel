import {
  parseStageFields,
  type NutritionStage,
  type NutritionStages,
  type StageKind,
  type StageFields,
  type StageDuration,
} from "@/api/nutrition-stages";
import { isNutritionDate } from "../../../../src/lib/mobile-api/nutrition-day-contract";
export { isNutritionDate as validStageDate } from "../../../../src/lib/mobile-api/nutrition-day-contract";

export const dayNames = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
export const dayLetters = ["L", "M", "X", "J", "V", "S", "D"];
export const kindOptions: { value: StageKind; label: string }[] = [
  { value: "maintenance", label: "Mantenimiento" },
  { value: "deficit", label: "Déficit" },
  { value: "surplus", label: "Superávit" },
  { value: "recomposition", label: "Recomposición" },
  { value: "custom", label: "Propio" },
];
export const kindLabel = (kind: StageKind | null) =>
  kindOptions.find((k) => k.value === kind)?.label ?? "Plan";
export type DayDraft = { weekday: number; kcal: string; protein: string };
export type StageDraft = {
  key: string;
  name: string;
  kind: StageKind | null;
  weekdays: DayDraft[];
  /** Training extras. Only goals the plan has: calories always, protein when a day has a protein goal. */
  trainingCalorieDeltaKcal: string;
  trainingProteinDeltaG: string;
  suggested: boolean;
  preserveTargets: boolean;
  sourceWasUntyped: boolean;
};
export type TimedDraft = { stage: StageDraft; duration: StageDuration };
export type SequenceDraft = {
  name: string;
  startDate: string;
  afterEnd: "keep_last" | "maintenance";
  stages: TimedDraft[];
  maintenanceStage: StageDraft;
};
export type StagesDraft =
  | {
      mode: "replace";
      origin: "current" | "new";
      stage: StageDraft;
      future: "keep" | "cancel" | null;
    }
  | {
      mode: "update";
      stageId: string;
      stage: StageDraft;
      startsOn: string;
      duration: StageDuration | null;
      sequenceId: string | null;
    }
  | { mode: "sequence"; sequence: SequenceDraft };
const text = (v: unknown) =>
  v === null || v === undefined ? "" : String(v).replace(".", ",");
let key = 0;
export function stageDraft(
  list: NutritionStages,
  kind: StageKind | null = null,
  source?: NutritionStage,
  preserveTargets = !!source,
): StageDraft {
  const current = source ?? list.current;
  const suggestion =
    !preserveTargets && list.suggestions
      ? list.suggestions[
          kind === "surplus" || kind === "deficit" ? kind : "maintenance"
        ]
      : null;
  return {
    key: `stage-${Date.now()}-${++key}`,
    name: source?.name ?? (kind ? kindLabel(kind) : ""),
    kind: source ? source.kind : kind,
    weekdays: Array.from({ length: 7 }, (_, i) => {
      const d = current?.weekdays.find((w) => w.weekday === i + 1);
      return {
        weekday: i + 1,
        kcal: text(suggestion ?? d?.calorieTargetKcal),
        protein: text(d?.proteinTargetG),
      };
    }),
    trainingCalorieDeltaKcal: text(current?.trainingCalorieDeltaKcal),
    trainingProteinDeltaG: text(current?.trainingProteinDeltaG),
    suggested: suggestion !== null,
    preserveTargets,
    sourceWasUntyped: source?.kind === null,
  };
}
export function chooseKind(
  stage: StageDraft,
  kind: StageKind,
  list: NutritionStages,
): StageDraft {
  const suggestion =
    list.suggestions?.[
      kind === "deficit" || kind === "surplus" ? kind : "maintenance"
    ];
  const replaceSuggestion =
    !stage.preserveTargets &&
    (stage.suggested || stage.weekdays.every((d) => !d.kcal));
  return {
    ...stage,
    kind,
    name: stage.name || kindLabel(kind),
    ...(replaceSuggestion && suggestion !== undefined
      ? {
          weekdays: stage.weekdays.map((d) => ({
            ...d,
            kcal: text(suggestion),
          })),
          suggested: true,
        }
      : {}),
  };
}
export const draftNumber = (v: string): number | null =>
  v.trim() && /^\d+(?:[,.]\d{1,2})?$/.test(v.trim())
    ? Number(v.replace(",", "."))
    : null;
/** A protein goal exists when some day asks for protein; 0 g every day means the plan has none. */
export const hasProteinGoal = (stage: StageDraft) =>
  stage.weekdays.some((d) => (draftNumber(d.protein) ?? 0) > 0);
export function stageFields(stage: StageDraft): StageFields | undefined {
  return parseStageFields({
    name: stage.name,
    kind: stage.kind,
    // Water is the Agua metric's goal, not the plan's: a saved stage carries none of its own.
    baseWaterL: null,
    trainingCalorieDeltaKcal: draftNumber(stage.trainingCalorieDeltaKcal),
    trainingWaterDeltaL: 0,
    // Without a protein goal there is nothing to raise.
    trainingProteinDeltaG: hasProteinGoal(stage) ? draftNumber(stage.trainingProteinDeltaG) : 0,
    weekdays: stage.weekdays.map((d) => ({
      weekday: d.weekday,
      calorieTargetKcal: draftNumber(d.kcal),
      proteinTargetG: draftNumber(d.protein),
    })),
  });
}
export function suggestedKind(
  stage: StageDraft,
  list: NutritionStages,
): StageKind | null {
  if (
    !list.suggestions ||
    stage.weekdays.some((d) => draftNumber(d.kcal) === null)
  )
    return null;
  const mean =
    stage.weekdays.reduce((sum, d) => sum + draftNumber(d.kcal)!, 0) / 7;
  return mean >= list.suggestions.expenditureKcal * 0.95 &&
    mean <= list.suggestions.expenditureKcal * 1.05
    ? "maintenance"
    : mean < list.suggestions.expenditureKcal
      ? "deficit"
      : "surplus";
}
export function applyDays(
  stage: StageDraft,
  days: number[],
  kcal: string,
  protein: string,
): StageDraft {
  return {
    ...stage,
    suggested: false,
    weekdays: stage.weekdays.map((d) =>
      days.includes(d.weekday) ? { ...d, kcal, protein } : d,
    ),
  };
}
export function repeatedDay(stage: StageDraft): DayDraft {
  const count = (d: DayDraft) =>
    stage.weekdays.filter((w) => w.kcal === d.kcal && w.protein === d.protein)
      .length;
  return [...stage.weekdays].sort(
    (a, b) => count(b) - count(a) || a.weekday - b.weekday,
  )[0];
}
export const weekdayFor = (date: string) =>
  new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
export const dayDistance = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86400000,
  );
export function addDuration(date: string, duration: StageDuration): string {
  if (!isNutritionDate(date)) throw new Error("Revisá la fecha de inicio.");
  const [year, month, day] = date.split("-").map(Number);
  if (duration.unit === "weeks")
    return new Date(Date.UTC(year, month - 1, day + duration.value * 7, 12))
      .toISOString()
      .slice(0, 10);
  const last = new Date(Date.UTC(year, month + duration.value, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month - 1 + duration.value, Math.min(day, last), 12),
  )
    .toISOString()
    .slice(0, 10);
}
export function sequenceDates(sequence: SequenceDraft) {
  let startsOn = sequence.startDate;
  return sequence.stages.map((item) => {
    const end = addDuration(startsOn, item.duration);
    const range = { startsOn, endsOn: end };
    startsOn = end;
    return range;
  });
}
export function scheduledCollision(list: NutritionStages, startDate: string) {
  return (
    [...list.upcoming]
      .sort(
        (a, b) =>
          a.startsOn.localeCompare(b.startsOn) || a.id.localeCompare(b.id),
      )
      .find((s) => s.startsOn >= startDate) ?? null
  );
}
export const templates = [
  {
    name: "Volumen y definición",
    stages: [
      { kind: "surplus", value: 3 },
      { kind: "deficit", value: 2 },
      { kind: "maintenance", value: 1 },
    ],
  },
  { name: "Recomposición", stages: [{ kind: "recomposition", value: 6 }] },
  {
    name: "Definir para el verano",
    stages: [
      { kind: "deficit", value: 3 },
      { kind: "maintenance", value: 1 },
    ],
  },
] as const;
export function sequenceDraft(
  list: NutritionStages,
  template?: number,
  source?: NutritionStage,
): SequenceDraft {
  const preset = template === undefined ? undefined : templates[template];
  return {
    name: preset?.name ?? "",
    startDate: list.today,
    afterEnd: "keep_last",
    stages: preset
      ? preset.stages.map((s) => ({
          stage: stageDraft(list, s.kind),
          duration: { unit: "months", value: s.value },
        }))
      : source
        ? [
            {
              stage: stageDraft(list, source.kind, source),
              duration: source.duration ?? { unit: "months", value: 1 },
            },
          ]
        : [],
    maintenanceStage: stageDraft(list, "maintenance"),
  };
}
export function validSequence(
  sequence: SequenceDraft,
  list: NutritionStages,
): boolean {
  if (
    !isNutritionDate(sequence.startDate) ||
    sequence.startDate < list.today ||
    !sequence.name.trim() ||
    sequence.name.trim().length > 80 ||
    sequence.stages.length < 1 ||
    sequence.stages.length > 24 ||
    scheduledCollision(list, sequence.startDate)
  )
    return false;
  if (
    sequence.stages.some(
      (s) =>
        !stageFields(s.stage) ||
        !Number.isInteger(s.duration.value) ||
        s.duration.value < 1 ||
        s.duration.value > (s.duration.unit === "weeks" ? 104 : 24),
    )
  )
    return false;
  if (
    sequence.afterEnd === "maintenance" &&
    (!stageFields(sequence.maintenanceStage) ||
      sequence.maintenanceStage.kind !== "maintenance")
  )
    return false;
  const end = sequenceDates(sequence).at(-1)!.endsOn;
  return end <= addDuration(sequence.startDate, { unit: "months", value: 120 });
}
