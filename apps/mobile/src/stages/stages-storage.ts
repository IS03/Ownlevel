import {
  NutritionIntentRepository,
  type NutritionStoragePort,
} from "@/nutrition/intent-repository";
import {
  parseStagesIntent,
  parseStagesResult,
  type StagesIntent,
  type StagesResult,
} from "@/api/nutrition-stages";
import { stageFields, type StagesDraft } from "./stages-model";
export type StoredStagesIntent = {
  version: 1;
  intent: StagesIntent;
  draft: StagesDraft | null;
  receipt?: Extract<StagesResult, { status: "confirmed" }>;
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function validStage(v: unknown): boolean {
  if (
    !record(v) ||
    typeof v.key !== "string" ||
    typeof v.name !== "string" ||
    ![
      null,
      "maintenance",
      "deficit",
      "surplus",
      "recomposition",
      "custom",
    ].includes(v.kind as null) ||
    typeof v.suggested !== "boolean" ||
    typeof v.preserveTargets !== "boolean" ||
    typeof v.sourceWasUntyped !== "boolean"
  )
    return false;
  return (
    ["baseWaterL", "trainingCalorieDeltaKcal", "trainingWaterDeltaL"].every(
      (k) => typeof v[k] === "string",
    ) &&
    Array.isArray(v.weekdays) &&
    v.weekdays.length === 7 &&
    v.weekdays.every(
      (d, i) =>
        record(d) &&
        d.weekday === i + 1 &&
        typeof d.kcal === "string" &&
        typeof d.protein === "string",
    )
  );
}
function validDraft(v: unknown): v is StagesDraft | null {
  if (v === null) return true;
  if (!record(v)) return false;
  if (v.mode === "replace")
    return (
      validStage(v.stage) &&
      ["current", "new"].includes(String(v.origin)) &&
      [null, "keep", "cancel"].includes(v.future as null)
    );
  if (v.mode === "update")
    return (
      validStage(v.stage) &&
      typeof v.stageId === "string" &&
      typeof v.startsOn === "string" &&
      (v.sequenceId === null || typeof v.sequenceId === "string") &&
      (v.duration === null ||
        (record(v.duration) &&
          ["weeks", "months"].includes(String(v.duration.unit)) &&
          typeof v.duration.value === "number"))
    );
  if (v.mode === "sequence" && record(v.sequence)) {
    const s = v.sequence;
    return (
      typeof s.name === "string" &&
      typeof s.startDate === "string" &&
      ["keep_last", "maintenance"].includes(String(s.afterEnd)) &&
      validStage(s.maintenanceStage) &&
      Array.isArray(s.stages) &&
      s.stages.length <= 24 &&
      s.stages.every(
        (t) =>
          record(t) &&
          validStage(t.stage) &&
          record(t.duration) &&
          ["weeks", "months"].includes(String(t.duration.unit)) &&
          typeof t.duration.value === "number",
      )
    );
  }
  return false;
}
function parseStored(v: unknown): StoredStagesIntent {
  if (!record(v)) throw new Error("Invalid stage change");
  const intent = parseStagesIntent(v.intent),
    receipt = v.receipt ? parseStagesResult(v.receipt) : undefined;
  if (
    v.version !== 1 ||
    !intent ||
    !validDraft(v.draft) ||
    (v.receipt &&
      (receipt?.status !== "confirmed" ||
        receipt.operation !== intent.operation ||
        receipt.date !== intent.date))
  )
    throw new Error("Invalid stage change");
  const d = v.draft;
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  if (
    intent.operation === "replace_from_today" &&
    (!d ||
      d.mode !== "replace" ||
      !same(stageFields(d.stage), intent.stage) ||
      (d.future ?? "keep") !== intent.future_stages)
  )
    throw new Error("Stage draft does not match change");
  if (
    intent.operation === "update_future" &&
    (!d ||
      d.mode !== "update" ||
      d.stageId !== intent.stageId ||
      d.startsOn !== intent.startsOn ||
      !same(d.duration, intent.duration) ||
      !same(stageFields(d.stage), intent.stage))
  )
    throw new Error("Stage draft does not match change");
  if (
    intent.operation === "schedule_sequence" &&
    (!d ||
      d.mode !== "sequence" ||
      d.sequence.name.trim() !== intent.name ||
      d.sequence.startDate !== intent.start_date ||
      d.sequence.afterEnd !== intent.after_end ||
      !same(
        d.sequence.stages.map((s) => ({
          ...stageFields(s.stage),
          duration: s.duration,
        })),
        intent.stages,
      ) ||
      !same(
        d.sequence.afterEnd === "maintenance"
          ? stageFields(d.sequence.maintenanceStage)
          : null,
        intent.maintenanceStage,
      ))
  )
    throw new Error("Stage draft does not match change");
  return {
    version: 1,
    intent,
    draft: v.draft,
    ...(receipt?.status === "confirmed" ? { receipt } : {}),
  };
}
export class StagesIntentRepository extends NutritionIntentRepository<StoredStagesIntent> {
  constructor(port: NutritionStoragePort, userId: string) {
    super(
      port,
      `ownlevel.nutrition.stages.v1.${encodeURIComponent(userId)}`,
      parseStored,
    );
  }
}
