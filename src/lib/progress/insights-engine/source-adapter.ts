import { normalizeWeightMode, weightModeStrategy } from "../../mobile-api/weight-modes";
import type { PerformanceSession, PerformanceUnit } from "../performance-insights/types";
import type { FeelingKey, InsightsSource, MealTimeEvidence, SessionFeeling } from "./types";

const UNIT_BY_STRATEGY = { load_reps: "kg", unit_reps: "lingotes", bodyweight_reps: "reps", time: "seconds" } as const;

/** The mode is the historical snapshot and defines what the recorded field holds. The current catalog is never read. */
export function unitOfHistoricalMode(mode: string | null): PerformanceUnit | null {
  const strategy = weightModeStrategy(normalizeWeightMode(mode));
  return strategy === "unsupported" ? null : UNIT_BY_STRATEGY[strategy];
}

export const instantMs = (value: string | null | undefined): number | null => {
  if (!value || !/(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

export function toPerformanceSessions(source: InsightsSource): { sessions: PerformanceSession[]; orphanRows: number } {
  const setsByExercise = new Map<string, InsightsSource["sets"][number][]>();
  for (const set of source.sets) {
    const rows = setsByExercise.get(set.sessionExerciseId);
    if (rows) rows.push(set); else setsByExercise.set(set.sessionExerciseId, [set]);
  }
  const blocksBySession = new Map<string, PerformanceSession["exercises"][number][]>();
  let attachedSets = 0;
  for (const row of source.exercises) {
    const sets = setsByExercise.get(row.id) ?? [];
    attachedSets += sets.length;
    const block = { id: row.id, exerciseId: row.exerciseId, completed: row.isCompleted,
      context: { weightMode: row.weightMode, unit: unitOfHistoricalMode(row.weightMode), implement: row.implement, configuration: row.configuration },
      sets: sets.map(set => ({ id: set.id, completed: set.isCompleted, amount: set.actualReps, load: set.actualLoad })) };
    const blocks = blocksBySession.get(row.sessionId);
    if (blocks) blocks.push(block); else blocksBySession.set(row.sessionId, [block]);
  }
  const known = new Set(source.sessions.map(session => session.id));
  const orphanBlocks = [...blocksBySession.keys()].filter(id => !known.has(id)).length;
  const sessions = source.sessions.map((session): PerformanceSession => ({
    id: session.id, date: session.date, routineId: session.routineId,
    status: session.status === "in_progress" ? "active" : session.status,
    startedAt: session.startedAt, endedAt: session.endedAt,
    chronology: session.startedAt && session.endedAt ? "verified" : "uncertain",
    exercises: blocksBySession.get(session.id) ?? [],
  }));
  return { sessions, orphanRows: orphanBlocks + source.sets.length - attachedSets };
}

/**
 * Strict provenance for a meal's time, separate from the legacy helper, which reads a missing marker as known. Web, Mobile
 * and ChatGPT leave raw_input null both when a time was declared and when the clock filled it in, and timestamps cannot
 * tell them apart: Web stamps its own clock. Only a positive marker proves a time: the recorded source, or the sheet import's flag
 * on a row an import run wrote, older than that column. A token can write raw_input on its own rows, so anywhere else the flag is
 * just text. Nothing is backfilled or inferred, so a time sent without a statement stays unverified.
 */
export function mealTimeEvidence(meal: Pick<InsightsSource["meals"][number], "consumedAt" | "consumedAtSource" | "rawInput" | "entryKind" | "sourceType" | "importRunId">): MealTimeEvidence {
  if (meal.entryKind !== "meal" || instantMs(meal.consumedAt) === null) return "unknown";
  if (meal.consumedAtSource === "user_declared" || meal.consumedAtSource === "imported") return "explicit";
  if (meal.consumedAtSource === "registration_now") return "registration";
  if (meal.consumedAtSource === "default_clock") return "unknown";
  if (typeof meal.rawInput !== "string") return "unverified";
  let facts: unknown;
  try { facts = JSON.parse(meal.rawInput); } catch { return "unverified"; }
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return "unverified";
  const { originalTimeKnown, timeSource } = facts as { originalTimeKnown?: unknown; timeSource?: unknown };
  if (originalTimeKnown === false) return timeSource === "registration" ? "registration" : "unknown";
  return originalTimeKnown === true && timeSource === undefined && meal.sourceType === "sheet_import" && !!meal.importRunId ? "explicit" : "unverified";
}

const FEELING_KEYS: readonly FeelingKey[] = ["energyPre", "fatiguePre", "energyPost", "fatiguePost"];

/** Validates again what the database guarantees. A malformed fact is excluded and counted, never read as absent. */
export function parseSessionFeelings(facts: unknown, session: { startedAt: string | null; endedAt: string | null }, firstSetAt: number | null) {
  const values: Partial<Record<FeelingKey, SessionFeeling>> = {};
  // Which answers exist but cannot be read: shown as unreadable, never as "not recorded". The count of exclusions is unchanged.
  const unreadable: FeelingKey[] = [];
  let invalid = 0;
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return { values, invalid: 1, unreadable: [...FEELING_KEYS] };
  for (const key of FEELING_KEYS) {
    const raw = (facts as Record<string, unknown>)[key];
    if (raw === undefined) continue;
    const fact = raw as { value?: unknown; capturedAt?: unknown; declaredMoment?: unknown };
    const pre = key.endsWith("Pre");
    if (!raw || typeof raw !== "object" || typeof fact.value !== "number" || !Number.isInteger(fact.value) || fact.value < 1 || fact.value > 5
      || fact.declaredMoment !== (pre ? "pre" : "post") || (fact.capturedAt !== null && typeof fact.capturedAt !== "string")) { invalid++; unreadable.push(key); continue; }
    const captured = typeof fact.capturedAt === "string" ? instantMs(fact.capturedAt) : null;
    const start = instantMs(session.startedAt), end = instantMs(session.endedAt);
    const timing: SessionFeeling["timing"] = !pre ? "post_declared" : captured === null ? "unknown"
      : end !== null && captured > end ? "after_end" : start !== null && captured <= start ? "before_start"
      : firstSetAt !== null && captured <= firstSetAt ? "before_first_set" : firstSetAt !== null ? "after_first_set" : "unknown";
    values[key] = { value: fact.value, timing, temporalQuality: captured === null ? "unknown" : "unverified_client_clock" };
  }
  return { values, invalid, unreadable };
}
