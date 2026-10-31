import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("../phase2/cordoba-date", () => ({ todayInCordoba: () => "2026-10-05" }));
vi.mock("@/lib/phase2/cordoba-date", () => ({ todayInCordoba: () => "2026-10-05" }));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: vi.fn() }));
vi.mock("@/lib/phase1/profile", () => ({ getMyProfile: vi.fn(async () => null) }));
vi.mock("@/lib/phase1/day-log", () => ({ listWeightHistory: vi.fn(async () => []) }));
vi.mock("@/lib/body-measurements", () => ({ listBodyMeasurements: vi.fn(async () => []) }));
vi.mock("@/lib/phase2/training-robust", () => ({ loadCompletedTrainingData: vi.fn(), loadTrainingRecordsData: vi.fn() }));
vi.mock("@/lib/phase2/training", () => ({ listRoutines: vi.fn(async () => []) }));
import { authenticateMobileAccessToken } from "./supabase";
import { loadCompletedTrainingData, loadTrainingRecordsData } from "@/lib/phase2/training-robust";
import { GET as trainingGET } from "@/app/api/mobile/v1/progress/training/route";
import { GET as recordsGET } from "@/app/api/mobile/v1/progress/training/records/route";
import { GET as exerciseGET } from "@/app/api/mobile/v1/progress/training/exercises/[id]/route";
import { GET as overviewGET } from "@/app/api/mobile/v1/progress/route";
import { addProgressIsoDays } from "@/lib/progress/analytics";
import { parseProgressOverview, parseProgressTraining, parseProgressTrainingExercise, parseProgressTrainingRecords, type ProgressTraining, type ProgressTrainingExerciseDetail } from "./progress-contract";

const TODAY = "2026-10-05";
const d = (offset: number) => addProgressIsoDays(TODAY, offset);
const ex = { bench: "e1000000-0000-4000-8000-000000000001", squat: "e1000000-0000-4000-8000-000000000002", pullup: "e1000000-0000-4000-8000-000000000003",
  plank: "e1000000-0000-4000-8000-000000000004", cable: "e1000000-0000-4000-8000-000000000005", curl: "e1000000-0000-4000-8000-000000000006", fresh: "e1000000-0000-4000-8000-000000000007" };
type SetSpec = [reps: number | null, kg: number | null];
type ExerciseSpec = { id: string; name: string; mode: string; sets: SetSpec[] };
type SessionSpec = { date: string; minutes?: number; routine?: string | null; feelings?: { energy?: number; performance?: number; pain?: number }; exercises: ExerciseSpec[] };

function source(specs: SessionSpec[]) {
  const sessions: Record<string, unknown>[] = [], sessionExercises: Record<string, unknown>[] = [], sets: Record<string, unknown>[] = [];
  const dateByDayLog = new Map<string, string>();
  specs.forEach((spec, i) => {
    const dayLogId = `day-${spec.date}`; dateByDayLog.set(dayLogId, spec.date);
    const sessionId = `s1000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const start = new Date(`${spec.date}T10:00:00Z`);
    sessions.push({ id: sessionId, user_id: "owner", day_log_id: dayLogId, status: "completed", started_at: start.toISOString(),
      ended_at: new Date(start.getTime() + (spec.minutes ?? 60) * 60_000).toISOString(), routine_id: spec.routine ?? null,
      routine_name_snapshot: spec.routine ? "Torso" : null, session_name: null,
      energy_level: spec.feelings?.energy ?? null, performance_level: spec.feelings?.performance ?? null, pain_level: spec.feelings?.pain ?? null });
    spec.exercises.forEach((exercise, e) => {
      const id = `${sessionId}-${e}`;
      sessionExercises.push({ id, workout_session_id: sessionId, exercise_id: exercise.id, nombre_snapshot: exercise.name, grupo_muscular_snapshot: "pecho",
        muscle_group_label_snapshot: null, weight_mode_snapshot: exercise.mode, is_completed: true, decision: "keep", decision_note: null, implement_snapshot: null });
      exercise.sets.forEach(([reps, kg], k) => sets.push({ id: `${id}-${k}`, workout_session_exercise_id: id, set_number: k + 1, is_completed: true,
        actual_reps: reps, actual_weight_kg: kg, target_reps: null, target_weight_kg: null, target_rir: null }));
    });
  });
  return { sessions, sessionExercises, sets, dateByDayLog } as never;
}
const bench = (sets: SetSpec[]): ExerciseSpec => ({ id: ex.bench, name: "Press banca", mode: "Peso total", sets });
const request = (path: string, token = "Bearer token") => new NextRequest(`https://www.ownlevel.fit/api/mobile/v1/${path}`, { headers: { authorization: token } });
async function read<T>(response: Response, parse: (v: unknown) => T | undefined): Promise<T> {
  expect(response.status).toBe(200);
  const raw = await response.json();
  const body = parse(raw);
  expect(body).toBeDefined();
  expect(JSON.stringify(raw)).not.toMatch(/volume|Volumen/); // never a global (or any) volume
  return body!;
}
const training = (path = "progress/training") => trainingGET(request(path)).then(r => read(r, parseProgressTraining));
const exercise = (id: string, period = "30") => exerciseGET(request(`progress/training/exercises/${id}?period=${period}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticateMobileAccessToken).mockResolvedValue({ userId: "owner", supabase: {} } as never);
  vi.mocked(loadCompletedTrainingData).mockResolvedValue(source([]));
});

describe("GET /progress/training — summary", () => {
  it("no training: real zeros, no feelings, no exercises, comparison without a percent", async () => {
    const t: ProgressTraining = await training();
    expect(t.summary).toMatchObject({ sessions: 0, trainingDays: 0, sets: 0, minutes: 0, sessionsPerWeek: 0 });
    expect(t.summary.comparisons.sessions).toMatchObject({ current: 0, previous: 0, deltaPercent: null });
    expect(t.summary.performance).toMatchObject({ comparable: 0, headline: "No hay suficiente historial comparable" });
    expect(t.feelings).toEqual([]); expect(t.exercises).toEqual([]); expect(t.series.every(p => p.sessions === 0)).toBe(true);
  });
  it("sessions, training days (two sessions on one day = 1 day), sets, duration (start→end) and the previous-period comparison", async () => {
    vi.mocked(loadCompletedTrainingData).mockResolvedValue(source([
      { date: d(-1), minutes: 75, exercises: [bench([[8, 60], [8, 60]])] },
      { date: d(-1), minutes: 30, exercises: [bench([[10, 50]])] },
      { date: d(-10), minutes: 60, exercises: [bench([[8, 60], [8, 60], [8, 60]])] },
      { date: d(-29), minutes: 45, exercises: [bench([[6, 55]])] }, // first day of the 30-day window
      { date: d(-30), minutes: 50, exercises: [bench([[6, 55]])] }, // last day of the previous window
    ]));
    const t = await training();
    expect(t.summary).toMatchObject({ sessions: 4, trainingDays: 3, sets: 7, minutes: 210, sessionsPerWeek: 0.9 });
    expect(t.summary.comparisons.sessions).toMatchObject({ status: "comparable", current: 4, previous: 1, deltaAbsolute: 3, deltaPercent: 300 });
    expect(t.summary.comparisons.trainingDays).toMatchObject({ current: 3, previous: 1 });
    expect(t.summary.comparisons.minutes).toMatchObject({ current: 210, previous: 50 });
    expect(t.series.reduce((n, p) => n + p.sessions, 0)).toBe(4);
    expect(t.routines).toEqual([{ id: "__free__", name: "Sesión libre", sessions: 4, sets: 7, minutes: 210 }]);
    expect(t.muscles[0]).toMatchObject({ label: "Pecho", sets: 7, sessions: 4, exercises: 1 });
  });
  it("previous period empty: current is shown; the engine reports the comparison as insufficient (no delta, no percent)", async () => {
    vi.mocked(loadCompletedTrainingData).mockResolvedValue(source([{ date: d(-2), exercises: [bench([[8, 60]])] }]));
    const t = await training();
    expect(t.summary).toMatchObject({ sessions: 1, trainingDays: 1, sets: 1 });
    expect(t.summary.comparisons.sessions).toMatchObject({ status: "insufficient_data", reason: "previous_period_empty", current: 1, deltaAbsolute: null, deltaPercent: null });
    expect(t.exercises[0]).toMatchObject({ id: ex.bench, status: "insufficient_data", reason: "new_exercise", signal: null, sessions: 1 });
  });
});

describe("GET /progress/training — exercise performance by real weight mode", () => {
  beforeEach(() => {
    vi.mocked(loadCompletedTrainingData).mockResolvedValue(source([
      // Previous window (d-59..d-30) and older history.
      { date: d(-80), exercises: [{ id: ex.squat, name: "Sentadilla", mode: "Total con barra", sets: [[5, 100]] }] },
      { date: d(-40), exercises: [bench([[8, 60]]), { id: ex.squat, name: "Sentadilla", mode: "Total con barra", sets: [[5, 90]] },
        { id: ex.pullup, name: "Dominadas", mode: "Peso corporal", sets: [[10, null]] }, { id: ex.plank, name: "Plancha", mode: "Tiempo (segundos)", sets: [[60, null]] },
        { id: ex.cable, name: "Remo máquina", mode: "Carga manual", sets: [[10, 40]] }, { id: ex.curl, name: "Curl", mode: "Por mancuerna", sets: [[10, 12]] }],
        feelings: { energy: 3 } },
      // Current window.
      { date: d(-5), exercises: [bench([[10, 60]]), { id: ex.squat, name: "Sentadilla", mode: "Total con barra", sets: [[5, 95]] },
        { id: ex.pullup, name: "Dominadas", mode: "Peso corporal", sets: [[8, null]] }, { id: ex.plank, name: "Plancha", mode: "Tiempo (segundos)", sets: [[60, null]] },
        { id: ex.cable, name: "Remo máquina", mode: "Carga manual", sets: [[12, 45]] }, { id: ex.curl, name: "Curl", mode: "Por mancuerna", sets: [[10, 12]] },
        { id: ex.fresh, name: "Fondos", mode: "Peso corporal", sets: [[12, null]] }],
        feelings: { energy: 4, performance: 4, pain: 2 } },
      { date: d(-2), exercises: [{ id: ex.squat, name: "Sentadilla", mode: "Total con barra", sets: [[5, 105]] }], feelings: { energy: 5, pain: 0 } },
      { date: d(-1), exercises: [bench([[10, 60]])] },
    ]));
  });
  it("uses only the validated strategy per mode; unsupported modes are not comparable; PRs need history", async () => {
    const t = await training();
    const byId = new Map(t.exercises.map(e => [e.id, e]));
    // 10 reps with 60 kg beats every earlier set at that load: the existing rep-record rule.
    expect(byId.get(ex.bench)).toMatchObject({ status: "improved", isPersonalRecord: true, signal: { kind: "new_rep_record", currentValue: 10, referenceValue: 8, contextValue: 60 } });
    expect(byId.get(ex.squat)).toMatchObject({ status: "improved", isPersonalRecord: true, signal: { kind: "new_best_weight", currentValue: 105, referenceValue: 100 } });
    expect(byId.get(ex.pullup)).toMatchObject({ status: "declined", signal: { kind: "fewer_reps_bodyweight" } });
    expect(byId.get(ex.plank)).toMatchObject({ status: "stable", signal: { kind: "stable" } });
    expect(byId.get(ex.cable)).toMatchObject({ status: "insufficient_data", reason: "unsupported_weight_mode", signal: null });
    expect(byId.get(ex.curl)).toMatchObject({ status: "stable" });
    expect(byId.get(ex.fresh)).toMatchObject({ status: "insufficient_data", reason: "new_exercise" });
    expect(t.summary.performance).toMatchObject({ improved: 2, declined: 1, stable: 2, comparable: 5, insufficient: 2, headline: "2 de 5 ejercicios mejoraron" });
    expect(t.personalRecords).toEqual(expect.arrayContaining([
      { exerciseId: ex.squat, name: "Sentadilla", description: expect.stringContaining("105") },
      { exerciseId: ex.bench, name: "Press banca", description: expect.stringContaining("10") }]));
    expect(t.personalRecords).toHaveLength(2); // stable/declined/unsupported never become records
  });
  it("feelings are averaged only over sessions that recorded them, always with coverage; absent ones are omitted", async () => {
    const t = await training();
    const energy = t.feelings.find(f => f.key === "energy")!, pain = t.feelings.find(f => f.key === "pain")!;
    expect(energy).toMatchObject({ average: 4.5, registered: 2, eligible: 3, scaleMaximum: 5 });
    expect(pain).toMatchObject({ average: 1, registered: 2, eligible: 3, scaleMaximum: 10 });
    expect(t.feelings.some(f => f.key === "performance")).toBe(false); // one value is not representative (engine needs ≥2)
  });
  it("exercise analytics: mode-compatible chart (load/reps/time), no chart for unsupported modes, marks without volume, sessions for drilldown", async () => {
    const squat: ProgressTrainingExerciseDetail = await read(await exercise(ex.squat), parseProgressTrainingExercise);
    expect(squat.chart).toMatchObject({ kind: "load", unit: "kg", points: [{ date: d(-5), value: 95, context: 5 }, { date: d(-2), value: 105, context: 5 }] });
    expect(squat.performance).toMatchObject({ status: "improved", isPersonalRecord: true });
    expect(squat.marks.map(m => m.kind)).toEqual(["best_load"]);
    expect(squat.comparisons.sessions).toMatchObject({ current: 2, previous: 1 });
    expect(squat.sessions.map(s => s.date)).toEqual([d(-2), d(-5)]);
    const pullup = await read(await exercise(ex.pullup), parseProgressTrainingExercise);
    expect(pullup.chart).toMatchObject({ kind: "reps", unit: "reps", points: [{ value: 8 }] });
    const plank = await read(await exercise(ex.plank), parseProgressTrainingExercise);
    expect(plank.chart).toMatchObject({ kind: "time", unit: "s" });
    const cable = await read(await exercise(ex.cable), parseProgressTrainingExercise);
    expect(cable.chart).toBeNull(); expect(cable.performance.signal).toBeNull();
    const single = await read(await exercise(ex.fresh), parseProgressTrainingExercise);
    expect(single.chart!.points).toHaveLength(1); expect(single.performance.reason).toBe("new_exercise");
    expect((await exercise("e1000000-0000-4000-8000-0000000000ff")).status).toBe(404);
    expect((await exercise("nope")).status).toBe(400);
  });
  it("overview: training summary and deterministic training findings that open the exercise", async () => {
    const response = await overviewGET(request("progress"));
    const o = parseProgressOverview(await response.json())!;
    expect(o.training.status === "ok" && o.training.data.performance.headline).toBe("2 de 5 ejercicios mejoraron");
    expect(o.evolution[0]).toMatchObject({ id: "training.performance", destination: { kind: "training" } });
    const trainingFindings = o.changes.filter(c => c.domain === "training");
    expect(trainingFindings.length).toBeGreaterThan(0); expect(trainingFindings.length).toBeLessThanOrEqual(2);
    expect(trainingFindings[0].destination).toMatchObject({ kind: "training_exercise" });
  });
  it("is owner-scoped and authenticated", async () => {
    expect((await trainingGET(request("progress/training", ""))).status).toBe(401);
    expect((await trainingGET(request("progress/training?user_id=other"))).status).toBe(400);
  });
});

/** Only the columns `recordColumns` selects (the loader's own list): anything else read downstream shows up as a difference. */
const { RECORD_COLUMNS, trainingRecordsSource } = await vi.importActual<typeof import("@/lib/phase2/training-robust")>("@/lib/phase2/training-robust");
const columns = (list: string) => list.split(", ");
function narrow(full: ReturnType<typeof source>) {
  const data = full as unknown as Record<"sessions" | "sessionExercises" | "sets", Record<string, unknown>[]> & { dateByDayLog: Map<string, string> };
  const pick = (rows: Record<string, unknown>[], columns: readonly string[]) => rows.map(row => Object.fromEntries(columns.map(column => [column, row[column]])));
  return { sessions: pick(data.sessions, columns(RECORD_COLUMNS.sessions)), sessionExercises: pick(data.sessionExercises, columns(RECORD_COLUMNS.exercises)),
    sets: pick(data.sets, columns(RECORD_COLUMNS.sets)), dateByDayLog: data.dateByDayLog } as never;
}
type Row = Record<string, unknown>;
/** What `mobile_read_training_records` returns for the fixture, with the migration's own filters. */
function rpcRead(full: ReturnType<typeof source>, from: string) {
  const data = full as unknown as { sessions: Row[]; sessionExercises: Row[]; sets: Row[]; dateByDayLog: Map<string, string> };
  const date = (session: Row) => data.dateByDayLog.get(String(session.day_log_id));
  const sessions = data.sessions.filter(session => session.status === "completed" && (date(session) ?? "") >= from && date(session) !== undefined);
  const sessionIds = new Set(sessions.map(session => session.id));
  const exercises = data.sessionExercises.filter(exercise => sessionIds.has(exercise.workout_session_id));
  const exerciseIds = new Set(exercises.map(exercise => exercise.id));
  const sets = data.sets.filter(set => set.is_completed && exerciseIds.has(set.workout_session_exercise_id));
  const older = new Set(data.sessions.filter(session => session.status === "completed" && session.ended_at && date(session) !== undefined && date(session)! < from).map(session => session.id));
  const olderExercises = new Map(data.sessionExercises.filter(exercise => exercise.is_completed && older.has(exercise.workout_session_id)).map(exercise => [exercise.id, exercise]));
  const history = new Map<string, { exercise_id: string; weight_mode_snapshot: string | null; load: number; reps: number }>();
  for (const set of data.sets) {
    const exercise = olderExercises.get(set.workout_session_exercise_id), reps = set.actual_reps, load = set.actual_weight_kg;
    if (!exercise || !set.is_completed || typeof reps !== "number" || reps <= 0 || typeof load !== "number" || !Number.isFinite(load) || load <= 0) continue;
    const key = JSON.stringify([exercise.exercise_id, exercise.weight_mode_snapshot, load]);
    if ((history.get(key)?.reps ?? 0) < reps) history.set(key, { exercise_id: String(exercise.exercise_id), weight_mode_snapshot: exercise.weight_mode_snapshot as string | null, load, reps });
  }
  const pick = (rows: Row[], list: string) => rows.map(row => Object.fromEntries(columns(list).map(column => [column, row[column]])));
  return { sessions: pick(sessions, RECORD_COLUMNS.sessions).map(session => ({ ...session, day: { log_date: date(session) } })),
    exercises: pick(exercises, RECORD_COLUMNS.exercises), sets: pick(sets, RECORD_COLUMNS.sets), history: [...history.values()] } as never;
}
/** Full rows for /progress/training; the records read (window rows plus aggregated history) for /progress/training/records. */
function serve(full: ReturnType<typeof source>) {
  vi.mocked(loadCompletedTrainingData).mockImplementation(async (_auth, scope) => scope?.recordColumns ? narrow(full) : full);
  vi.mocked(loadTrainingRecordsData).mockImplementation(async (_auth, from) => trainingRecordsSource(rpcRead(full, from), from));
}
const records = (path = "progress/training/records?period=30") => recordsGET(request(path)).then(r => read(r, parseProgressTrainingRecords));

describe("GET /progress/training/records — Home's records card", () => {
  const scenarios: [string, SessionSpec[]][] = [
    ["no training", []],
    ["records, every strategy and unsupported modes", [
      { date: d(-80), exercises: [{ id: ex.squat, name: "Sentadilla", mode: "Total con barra", sets: [[5, 100]] }] },
      { date: d(-40), exercises: [bench([[8, 60]]), { id: ex.squat, name: "Sentadilla", mode: "Total con barra", sets: [[5, 90]] },
        { id: ex.pullup, name: "Dominadas", mode: "Peso corporal", sets: [[10, null]] }, { id: ex.plank, name: "Plancha", mode: "Tiempo (segundos)", sets: [[60, null]] },
        { id: ex.cable, name: "Remo máquina", mode: "Carga manual", sets: [[10, 40]] }, { id: ex.curl, name: "Curl", mode: "Por mancuerna", sets: [[10, 12]] }] },
      { date: d(-5), exercises: [bench([[10, 60]]), { id: ex.squat, name: "Sentadilla", mode: "Total con barra", sets: [[5, 95]] },
        { id: ex.pullup, name: "Dominadas", mode: "Peso corporal", sets: [[8, null]] }, { id: ex.plank, name: "Plancha", mode: "Tiempo (segundos)", sets: [[60, null]] },
        { id: ex.cable, name: "Remo máquina", mode: "Carga manual", sets: [[12, 45]] }, { id: ex.curl, name: "Curl", mode: "Por mancuerna", sets: [[10, 12]] },
        { id: ex.fresh, name: "Fondos", mode: "Peso corporal", sets: [[12, null]] }] },
      { date: d(-2), exercises: [{ id: ex.squat, name: "Sentadilla", mode: "Total con barra", sets: [[5, 105]] }] },
      { date: d(-1), exercises: [bench([[10, 60]])] },
    ]],
    ["older history only: zero, missing and repeated loads, another mode, a bodyweight exercise", [
      { date: d(-300), exercises: [bench([[12, 60], [3, 0], [8, null], [0, 80]]), { id: ex.pullup, name: "Dominadas", mode: "Peso corporal", sets: [[15, null]] }] },
      { date: d(-250), exercises: [bench([[6, 70], [12, 60]]), { id: ex.squat, name: "Sentadilla", mode: "Por mancuerna", sets: [[10, 200]] }] },
      { date: d(-40), exercises: [bench([[8, 65]]), { id: ex.squat, name: "Sentadilla", mode: "Total con barra", sets: [[5, 90]] }, { id: ex.pullup, name: "Dominadas", mode: "Peso corporal", sets: [[10, null]] }] },
      { date: d(-10), exercises: [bench([[13, 60], [6, 70]]), { id: ex.squat, name: "Sentadilla", mode: "Total con barra", sets: [[5, 100]] }, { id: ex.pullup, name: "Dominadas", mode: "Peso corporal", sets: [[11, null]] }] },
    ]],
    ["a weight-mode change hides older loads; lingotes; repeated loads; the period's first day; renamed exercise", [
      { date: d(-200), exercises: [{ id: ex.bench, name: "Press plano", mode: "Por mancuerna", sets: [[12, 40], [6, 70]] }] },
      { date: d(-120), exercises: [bench([[8, 50], [8, 50], [6, 55]]), { id: ex.cable, name: "Remo", mode: "Lingotes (no kg)", sets: [[10, 8]] }] },
      { date: d(-45), exercises: [bench([[9, 50]]), { id: ex.cable, name: "Remo", mode: " lingotes  (NO kg) ", sets: [[10, 9]] }] },
      { date: d(-29), exercises: [bench([[10, 50], [5, 0], [0, 55], [null, 55]]), { id: ex.cable, name: "Remo", mode: "Lingotes (no kg)", sets: [[12, 9]] }] },
      { date: d(-3), exercises: [bench([[7, 55]]), { id: ex.cable, name: "Remo nuevo", mode: "Lingotes (no kg)", sets: [[10, 10]] }] },
    ]],
  ];
  it.each(scenarios)("same records, performance and exercises as /progress/training: %s", async (_name, specs) => {
    serve(source(specs));
    const [full, home] = [await training("progress/training?period=30"), await records()];
    expect(home).toEqual({ today: full.today, period: full.period, performance: full.summary.performance, exercises: full.exercises, personalRecords: full.personalRecords });
  });
  it("finds the records the full read finds", async () => {
    serve(source(scenarios[1][1]));
    expect((await records()).personalRecords.map(record => record.exerciseId).sort()).toEqual([ex.bench, ex.squat].sort());
  });
  it("an older session without an end stays out of the history, as in the full read", async () => {
    const full = source(scenarios[2][1]) as unknown as { sessions: Row[] };
    full.sessions[1].ended_at = null;
    serve(full as never);
    const [all, home] = [await training("progress/training?period=30"), await records()];
    expect(home.personalRecords).toEqual(all.personalRecords);
    expect(home.exercises).toEqual(all.exercises);
  });
  it("reads from the earliest compared day, and is owner-scoped and authenticated", async () => {
    await records();
    expect(vi.mocked(loadTrainingRecordsData)).toHaveBeenCalledWith({ userId: "owner", supabase: {} }, d(-59));
    expect((await recordsGET(request("progress/training/records", ""))).status).toBe(401);
    expect((await recordsGET(request("progress/training/records?user_id=other"))).status).toBe(400);
  });
});
