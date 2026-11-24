
/**
 * #537 · Portable wire contract (shared with Expo): a load pattern the active session can show next to an exercise.
 * It describes recorded sets only; it never says the sets were working sets, that the user is stuck, or how much to add.
 *
 * - `repeated`: the last executions of the exercise in this routine repeated the same scheme (`count` of them, ≥ 4).
 * - `surplus`: in the last two executions the last set went 2 or more reps over its target at the same load.
 *
 * `key` identifies the pattern (signal, exercise, routine and scheme) so the user can silence that one and not another.
 */
export type LoadPatternSignal = "repeated" | "surplus";
/** Same shape as the session set DTO; declared here so the contract stays free of server modules (Expo imports it). */
export type SessionSetDto = {
  setNumber: number; targetReps: number | null; targetWeightKg: number | null; targetRir: number | null;
  actualReps: number | null; actualWeightKg: number | null; isCompleted: boolean; notes: string | null;
};
export type LoadPatternSchemeSet = { reps: number; weightKg: number };
export type LoadPatternSession = { sessionId: string; logDate: string; routineName: string; sets: SessionSetDto[] };
export type LoadPattern = {
  key: string;
  signal: LoadPatternSignal;
  scheme: LoadPatternSchemeSet[];
  count: number;
  sessions: LoadPatternSession[];
};
/** Per session exercise id. `unavailable` is a failed read, never «no pattern». */
export type SessionLoadPatterns = { status: "ok"; data: Record<string, LoadPattern | null> } | { status: "unavailable" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRecord = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => key in (value as object));
const finite = (value: unknown, min = 0, max = 100_000): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const nullableFinite = (value: unknown, max: number) => value === null || finite(value, 0, max);
const nullableText = (value: unknown) => value === null || typeof value === "string";

function parseSet(value: unknown): SessionSetDto | undefined {
  if (!isRecord(value, ["setNumber", "targetReps", "targetWeightKg", "targetRir", "actualReps", "actualWeightKg", "isCompleted", "notes"])) return undefined;
  if (!Number.isSafeInteger(value.setNumber) || (value.setNumber as number) < 1 || (value.setNumber as number) > 50) return undefined;
  if (!nullableFinite(value.targetReps, 1000) || !nullableFinite(value.targetWeightKg, 9999.99) || !nullableFinite(value.targetRir, 10)
    || !nullableFinite(value.actualReps, 1000) || !nullableFinite(value.actualWeightKg, 9999.99)
    || typeof value.isCompleted !== "boolean" || !nullableText(value.notes)) return undefined;
  return value as unknown as SessionSetDto;
}

export function parseLoadPattern(value: unknown): LoadPattern | undefined {
  if (!isRecord(value, ["key", "signal", "scheme", "count", "sessions"])) return undefined;
  if (typeof value.key !== "string" || !value.key || value.key.length > 1000) return undefined;
  if (value.signal !== "repeated" && value.signal !== "surplus") return undefined;
  if (!Array.isArray(value.scheme) || !value.scheme.length || value.scheme.length > 50) return undefined;
  const scheme: LoadPatternSchemeSet[] = [];
  for (const row of value.scheme) {
    if (!isRecord(row, ["reps", "weightKg"]) || !Number.isSafeInteger(row.reps) || !finite(row.reps, 0, 1000) || !finite(row.weightKg, 0, 9999.99)) return undefined;
    scheme.push({ reps: row.reps as number, weightKg: row.weightKg as number });
  }
  if (!Number.isSafeInteger(value.count) || (value.count as number) < 2 || (value.count as number) > 100) return undefined;
  if (!Array.isArray(value.sessions) || value.sessions.length !== value.count) return undefined;
  const sessions: LoadPatternSession[] = [];
  const seen = new Set<string>();
  for (const row of value.sessions) {
    if (!isRecord(row, ["sessionId", "logDate", "routineName", "sets"]) || typeof row.sessionId !== "string" || !UUID.test(row.sessionId)
      || seen.has(row.sessionId) || typeof row.logDate !== "string" || !DATE.test(row.logDate) || typeof row.routineName !== "string"
      || !Array.isArray(row.sets) || !row.sets.length || row.sets.length > 50) return undefined;
    const sets: SessionSetDto[] = [];
    for (const set of row.sets) { const parsed = parseSet(set); if (!parsed) return undefined; sets.push(parsed); }
    seen.add(row.sessionId);
    sessions.push({ sessionId: row.sessionId.toLowerCase(), logDate: row.logDate, routineName: row.routineName, sets });
  }
  return { key: value.key, signal: value.signal, scheme, count: value.count as number, sessions };
}

/** A malformed answer is `unavailable` (the session still opens); it is never read as «no pattern». */
export function parseSessionLoadPatterns(value: unknown): SessionLoadPatterns {
  if (isRecord(value, ["status"]) && value.status === "unavailable") return { status: "unavailable" };
  if (!isRecord(value, ["status", "data"]) || value.status !== "ok" || !value.data || typeof value.data !== "object" || Array.isArray(value.data)) return { status: "unavailable" };
  const data: Record<string, LoadPattern | null> = {};
  for (const [id, pattern] of Object.entries(value.data as Record<string, unknown>)) {
    if (!UUID.test(id)) return { status: "unavailable" };
    if (pattern === null) { data[id.toLowerCase()] = null; continue; }
    const parsed = parseLoadPattern(pattern);
    if (!parsed) return { status: "unavailable" };
    data[id.toLowerCase()] = parsed;
  }
  return { status: "ok", data };
}
