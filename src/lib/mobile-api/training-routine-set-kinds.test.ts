import { describe, expect, it, vi } from "vitest";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";
import { parseMobileTrainingRoutineDetailResponse, parseMobileTrainingRoutineTemplate } from "./training";

vi.mock("server-only", () => ({}));
import { readMobileTrainingRoutineDetail, replaceMobileTrainingRoutineTemplate, withRoutineSetKinds } from "./training-server";

/** #537 · Synthetic routine only. */
const routineId = "53700000-0000-4000-8000-000000000001";
const relationId = "53700000-0000-4000-8000-000000000002";
const exerciseId = "53700000-0000-4000-8000-000000000003";
const timestamp = "2026-11-24T12:00:00.000Z";
const setRow = (setNumber: number) => ({ setNumber, targetReps: 10, targetWeightKg: 60, targetRir: null, notes: null });
const targets = { nextAdjustment: "maintain", nextAdjustmentNote: null, restMinSeconds: null, restMaxSeconds: null, notes: null, sets: [setRow(1), setRow(2)] };
const rpcDetail = {
  routine: { id: routineId, name: "PUSH", color: null, isActive: true, updatedAt: timestamp, templateVersion: 4 },
  items: [{ routineExerciseId: relationId, exerciseOrder: 1, updatedAt: timestamp, targets,
    exercise: { id: exerciseId, name: "PRESS", muscleGroup: null, muscleGroupLabel: null, implement: null, weightMode: null, isActive: true } }],
};
function context(kinds: { version: number; sets: { set_number: number; set_kind: string }[] } | null, rpcData: unknown = rpcDetail) {
  const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue({ data: kinds && { template_version: kinds.version, routine_exercises: [{ id: relationId, routine_exercise_sets: kinds.sets }] }, error: null });
  const from = vi.fn().mockReturnValue(builder);
  const rpc = vi.fn().mockResolvedValue({ data: rpcData, error: null });
  return { builder, from, rpc, ctx: { userId: "owner", supabase: { rpc, from } } as unknown as MobileSupabaseAuthenticatedContext };
}

describe("#537 · tipo de serie en la rutina", () => {
  it("the template accepts an optional kind and rejects an unknown one; absent stays absent", () => {
    const parse = (sets: unknown[]) => parseMobileTrainingRoutineTemplate({ expectedTemplateVersion: 4, items: [{ routineExerciseId: relationId, exerciseId, targets: { ...targets, sets } }] });
    expect(parse([{ ...setRow(1), setKind: "warmup" }, setRow(2)]).items[0]!.targets.sets).toEqual([{ ...setRow(1), setKind: "warmup" }, setRow(2)]);
    expect(() => parse([{ ...setRow(1), setKind: "cooldown" }])).toThrow();
    expect(() => parse([{ ...setRow(1), setKind: null }])).toThrow();
  });
  it("the detail keeps its output without the opt-in and adds the kinds with it, from the same template version", async () => {
    const plain = context(null);
    expect(await readMobileTrainingRoutineDetail(routineId, plain.ctx)).toEqual(parseMobileTrainingRoutineDetailResponse(rpcDetail));
    expect(plain.from).not.toHaveBeenCalled();
    const adopted = context({ version: 4, sets: [{ set_number: 1, set_kind: "warmup" }, { set_number: 2, set_kind: "work" }] });
    const detail = await readMobileTrainingRoutineDetail(routineId, adopted.ctx, true);
    expect(detail.items[0]!.targets.sets.map(set => set.setKind)).toEqual(["warmup", "work"]);
    expect(adopted.builder.eq).toHaveBeenCalledWith("user_id", "owner");
  });
  it("a kind of another version or a missing one is never returned (it would be saved back over the right one)", async () => {
    await expect(readMobileTrainingRoutineDetail(routineId, context({ version: 5, sets: [{ set_number: 1, set_kind: "warmup" }, { set_number: 2, set_kind: "work" }] }).ctx, true)).rejects.toThrow();
    await expect(readMobileTrainingRoutineDetail(routineId, context({ version: 4, sets: [{ set_number: 1, set_kind: "warmup" }] }).ctx, true)).rejects.toThrow();
    await expect(readMobileTrainingRoutineDetail(routineId, context(null).ctx, true)).rejects.toThrow();
  });
  it("replacing with every kind sent answers with them and reads nothing more; the writer receives them", async () => {
    const write = context(null);
    const body = { expectedTemplateVersion: 3, items: [{ routineExerciseId: relationId, exerciseId,
      targets: { ...targets, sets: [{ ...setRow(1), setKind: "warmup" }, { ...setRow(2), setKind: "work" }] } }] };
    const result = await replaceMobileTrainingRoutineTemplate(routineId, body, write.ctx, true);
    expect(result.items[0]!.targets.sets.map(set => set.setKind)).toEqual(["warmup", "work"]);
    expect(write.from).not.toHaveBeenCalled();
    expect(write.rpc.mock.calls[0][1].p_items[0].targets.sets[0]).toMatchObject({ setKind: "warmup" });
    const old = context(null);
    expect(JSON.stringify(await replaceMobileTrainingRoutineTemplate(routineId, body, old.ctx))).not.toContain("setKind");
  });
  it("known kinds win and only the missing ones are read", async () => {
    const partial = context({ version: 4, sets: [{ set_number: 1, set_kind: "work" }, { set_number: 2, set_kind: "warmup" }] });
    const detail = parseMobileTrainingRoutineDetailResponse(rpcDetail);
    const result = await withRoutineSetKinds(detail, partial.ctx, new Map([[`${relationId}:1`, "warmup" as const]]));
    expect(result.items[0]!.targets.sets.map(set => set.setKind)).toEqual(["warmup", "warmup"]);
  });
});
