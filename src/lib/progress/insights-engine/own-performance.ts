import type { InsightsSnapshot } from "./read-model";
import { factorRules } from "./routine-relation";
import { relationSleepMetric } from "./sleep-metric";
import type { DayFact, InsightsSource, SessionFact, SleepNightEvidence } from "./types";

/**
 * «Rendimiento frente a lo tuyo» (bocetos/rendimiento-tramos). Each exercise of a session against the person's own recent level of
 * that exercise; the session is the median of its exercises; «Cómo llegaste» splits each factor in tramos of the person's own values
 * and gives the mean of each. Read only: nothing stored, nothing a set says is changed.
 *
 * - The measure of an exercise in a session is its best completed set: with load, the estimated strength `load × (1 + reps / 30)`
 *   (Epley), so 60 kg × 10 and 55 kg × 12 compare; without load, the most reps. Load and bodyweight readings never mix.
 * - «Lo tuyo» is the set at the median of the previous five times of the same exercise, implement, weight mode and kind of measure.
 *   With fewer than three previous times the exercise does not enter. A real set, so it can be shown as «55 kg × 11».
 * - The session needs two exercises with «lo tuyo»; its value is their median, so one odd exercise does not move it alone.
 * - A tramo's mean needs six sessions. A difference is «clear» only when the extreme tramos differ by more than twice their
 *   standard error (with the spread of every session in that factor). Never a cause: it says what coincided.
 */
export const OWN_METHOD = "insights-own/1" as const;
export const OWN_DAYS = 180;
export const OWN_BASE_SIZE = 5;
export const OWN_MIN_BASE = 3;
export const OWN_MIN_EXERCISES = 2;
export const OWN_MIN_PER_BIN = 6;
export const OWN_MIN_ROUTINE = 10;
const WEEK_MIN_DAYS = 4;

type Kind = "load" | "reps";
export type OwnSet = { load: number | null; reps: number };
export type OwnExercise = { exerciseId: string; name: string; kind: Kind; today: OwnSet; base: OwnSet | null; bases: number; pct: number | null };
export type OwnSession = {
  sessionId: string; date: string; startedAt: string | null; routineId: string | null; routineName: string | null;
  /** Median of the exercises with «lo tuyo», with two or more; null otherwise. */
  pct: number | null; compared: number; total: number; exercises: OwnExercise[];
  /** Completed sets with reps: the session's volume, for the week before the next ones. */
  sets: number;
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const strength = (load: number, reps: number) => load * (1 + reps / 30);
function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Every completed session in order, each exercise against its own previous five times. Uses the whole history for «lo tuyo». */
export function ownSessions(source: InsightsSource): OwnSession[] {
  const exercisesBySession = new Map<string, InsightsSource["exercises"][number][]>();
  for (const row of source.exercises) exercisesBySession.set(row.sessionId, [...(exercisesBySession.get(row.sessionId) ?? []), row]);
  const setsByExercise = new Map<string, InsightsSource["sets"][number][]>();
  for (const set of source.sets) if (set.isCompleted && typeof set.actualReps === "number" && set.actualReps > 0)
    setsByExercise.set(set.sessionExerciseId, [...(setsByExercise.get(set.sessionExerciseId) ?? []), set]);
  const sessions = source.sessions.filter(row => row.status === "completed" && row.date)
    .sort((a, b) => a.date!.localeCompare(b.date!) || (a.startedAt ?? "").localeCompare(b.startedAt ?? "") || a.id.localeCompare(b.id));
  const history = new Map<string, { value: number; set: OwnSet }[]>();
  return sessions.map(session => {
    const exercises: OwnExercise[] = [];
    let sets = 0;
    for (const row of exercisesBySession.get(session.id) ?? []) {
      const done = setsByExercise.get(row.id) ?? [];
      if (!done.length) continue;
      sets += done.length;
      const loaded = done.filter(set => typeof set.actualLoad === "number" && set.actualLoad > 0);
      const kind: Kind = loaded.length ? "load" : "reps";
      const best = kind === "load"
        ? loaded.reduce((a, b) => strength(b.actualLoad!, b.actualReps!) > strength(a.actualLoad!, a.actualReps!) ? b : a)
        : done.reduce((a, b) => b.actualReps! > a.actualReps! ? b : a);
      const today: OwnSet = { load: kind === "load" ? best.actualLoad! : null, reps: best.actualReps! };
      const value = kind === "load" ? strength(today.load!, today.reps) : today.reps;
      const key = `${row.exerciseId.toLowerCase()}|${row.implement ?? ""}|${row.weightMode ?? ""}|${kind}`;
      const previous = (history.get(key) ?? []).slice(-OWN_BASE_SIZE);
      let base: OwnSet | null = null, pct: number | null = null;
      if (previous.length >= OWN_MIN_BASE) {
        const ranked = [...previous].sort((a, b) => a.value - b.value), middle = ranked[(ranked.length - 1) >> 1]!;
        base = middle.set; pct = round1((value / middle.value - 1) * 100);
      }
      exercises.push({ exerciseId: row.exerciseId.toLowerCase(), name: row.name, kind, today, base, bases: previous.length, pct });
      history.set(key, [...(history.get(key) ?? []), { value, set: today }]);
    }
    const pcts = exercises.map(row => row.pct).filter((pct): pct is number => pct !== null);
    return { sessionId: session.id, date: session.date!, startedAt: session.startedAt, routineId: session.routineId?.toLowerCase() ?? null, routineName: session.routineName,
      pct: pcts.length >= OWN_MIN_EXERCISES ? round1(median(pcts)!) : null, compared: pcts.length, total: exercises.length, exercises, sets };
  });
}

/** What the week factors read, for every date: kept beside the snapshot, never published as such. */
export type OwnDaily = {
  nutrition: ReadonlyMap<string, { calories: { recorded: number; missing: number }; proteinG: { recorded: number; missing: number } }>;
  metrics: ReadonlyMap<string, { metricId: string; value: number }[]>;
  sleepEvidence: ReadonlyMap<string, ReadonlyMap<string, SleepNightEvidence>>;
  targets: ReadonlyMap<string, { calories: number | null; proteinG: number | null }> | null;
};

export type OwnBin = { from: number | null; to: number | null; label: string | null; n: number; mean: number | null };
export type OwnFactorKey = string;
export type OwnFactor = {
  key: OwnFactorKey; unit: string | null; metricId: string | null; kind: "numeric" | "category";
  /** Sessions with a measured performance and a value, and why the others with a measure have none. */
  valid: number; missing: Record<string, number>;
  /** One value per session of `sessions`, in its order; null without a value or without a measure. */
  values: (number | null)[];
  bins: OwnBin[];
  /** Mean of the last tramo minus the first, when both have six sessions; and whether it beats twice its standard error. */
  difference: number | null; clear: boolean;
  /** Per routine, the same first and last tramo: the way it goes, or «few» with fewer than three sessions in either. */
  byRoutine: { routineId: string; name: string | null; direction: "up" | "down" | "flat" | "few" }[];
};
export type InsightsOwnPerformance = {
  view: "own"; method: typeof OWN_METHOD;
  window: { start: string; end: string; days: number };
  rules: { baseSize: number; minBase: number; minExercises: number; minPerBin: number; minRoutine: number };
  routine: string | null;
  routines: { id: string; name: string | null; sessions: number; measured: number; mean: number | null }[];
  weeks: { start: string; sessions: number; measured: number; mean: number | null }[];
  sessions: OwnSession[];
  factors: { day: OwnFactor[]; week: OwnFactor[] };
};

const shiftDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
const mondayOf = (date: string) => { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return shiftDays(date, -((day + 6) % 7)); };
const hourFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Argentina/Cordoba" });
function cordobaHour(startedAt: string | null): number | null {
  if (!startedAt) return null;
  const at = Date.parse(startedAt);
  return Number.isFinite(at) ? Number(hourFormat.format(new Date(at))) % 24 : null;
}
const mean = (values: readonly number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
function sd(values: readonly number[]) {
  const m = mean(values);
  return m === null || values.length < 2 ? 0 : Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1));
}

type Read = { value: number | null; missing?: string };
type Rule = { key: string; unit: string | null; metricId: string | null; kind: "numeric" | "category"; read: (own: OwnSession) => Read;
  categories?: { label: string; test: (value: number) => boolean }[] };

/**
 * Numeric tramos: thirds of the person's own values. A limit is the value at the start of the next third, so equal values stay in
 * one tramo; equal limits merge tramos, and a single value gives one tramo (nothing to compare).
 */
function numericBins(values: readonly number[]): { from: number | null; to: number | null }[] {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length))]!;
  const limits = [...new Set([at(1 / 3), at(2 / 3)])].filter(limit => limit > sorted[0]!);
  const edges = [null, ...limits, null];
  return edges.slice(0, -1).map((from, index) => ({ from, to: edges[index + 1] ?? null }));
}
const inBin = (value: number, bin: { from: number | null; to: number | null }) => (bin.from === null || value >= bin.from) && (bin.to === null || value < bin.to);

function buildFactor(rule: Rule, sessions: readonly OwnSession[]): OwnFactor {
  const values: (number | null)[] = [], missing: Record<string, number> = {};
  for (const session of sessions) {
    if (session.pct === null) { values.push(null); continue; }
    const read = rule.read(session);
    if (read.value === null || !Number.isFinite(read.value)) { values.push(null); missing[read.missing ?? "not_recorded"] = (missing[read.missing ?? "not_recorded"] ?? 0) + 1; }
    else values.push(read.value);
  }
  const pairs = sessions.map((session, index) => ({ session, value: values[index] })).filter((row): row is { session: OwnSession; value: number } => row.value !== null && row.session.pct !== null);
  const shapes = rule.kind === "category" ? rule.categories!.map(category => ({ label: category.label, test: category.test, from: null, to: null }))
    : numericBins(pairs.map(row => row.value)).map(bin => ({ ...bin, label: null, test: (value: number) => inBin(value, bin) }));
  const groups = shapes.map(shape => pairs.filter(row => shape.test(row.value)));
  const bins: OwnBin[] = shapes.map((shape, index) => {
    const pcts = groups[index]!.map(row => row.session.pct!);
    return { from: shape.from, to: shape.to, label: shape.label, n: pcts.length, mean: pcts.length >= OWN_MIN_PER_BIN ? round1(mean(pcts)!) : null };
  });
  const first = bins[0], last = bins.at(-1);
  let difference: number | null = null, clear = false;
  if (bins.length >= 2 && first?.mean != null && last?.mean != null) {
    difference = round1(last.mean - first.mean);
    const spread = sd(pairs.map(row => row.session.pct!));
    clear = bins.every(bin => bin.n >= OWN_MIN_PER_BIN) && Math.abs(last.mean - first.mean) > 2 * spread * Math.sqrt(1 / first.n + 1 / last.n);
  }
  const routines = new Map<string, { name: string | null; low: number[]; high: number[] }>();
  if (groups.length >= 2) for (const [index, group] of [[0, groups[0]!], [groups.length - 1, groups.at(-1)!]] as const) for (const row of group) {
    if (!row.session.routineId) continue;
    const entry = routines.get(row.session.routineId) ?? { name: row.session.routineName, low: [], high: [] };
    (index === 0 ? entry.low : entry.high).push(row.session.pct!); routines.set(row.session.routineId, entry);
  }
  const byRoutine = [...routines.entries()].map(([routineId, entry]) => {
    if (entry.low.length < 3 || entry.high.length < 3) return { routineId, name: entry.name, direction: "few" as const };
    const delta = mean(entry.high)! - mean(entry.low)!;
    return { routineId, name: entry.name, direction: Math.abs(delta) < 0.1 ? "flat" as const : delta > 0 ? "up" as const : "down" as const };
  }).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "") || a.routineId.localeCompare(b.routineId));
  return { key: rule.key, unit: rule.unit, metricId: rule.metricId, kind: rule.kind, valid: pairs.length, missing, values, bins, difference, clear, byRoutine };
}

/** The day rules: Relación's own reads of the session and its day, then the hour of the session and the days since the last one. */
function dayRules(snapshot: InsightsSnapshot, all: readonly OwnSession[]): Rule[] {
  const facts = new Map<string, { session: SessionFact; day: DayFact }>();
  for (const day of snapshot.days) for (const session of day.sessions) facts.set(session.sessionId, { session, day });
  const previous = new Map<string, string>(), last = new Map<string, string>();
  for (const own of all) { if (own.routineId) { const before = last.get(own.routineId); if (before) previous.set(own.sessionId, before); last.set(own.routineId, own.date); } }
  const relation: Rule[] = factorRules(snapshot).map(rule => ({ key: rule.key, unit: rule.unit, metricId: rule.metricId, kind: "numeric", read: own => {
    const fact = facts.get(own.sessionId);
    return fact ? rule.read(fact.session, fact.day, snapshot.relationContext.priorEnergy.get(own.sessionId)) : { value: null, missing: "unavailable" };
  } }));
  return [...relation,
    { key: "training_hour", unit: "h", metricId: null, kind: "category", read: own => { const hour = cordobaHour(own.startedAt); return hour === null ? { value: null, missing: "no_start_time" } : { value: hour }; },
      categories: [{ label: "mañana", test: h => h < 12 }, { label: "tarde", test: h => h >= 12 && h < 18 }, { label: "noche", test: h => h >= 18 }] },
    { key: "days_since_previous", unit: "días", metricId: null, kind: "category", read: own => { const before = previous.get(own.sessionId); return before ? { value: dayDiff(own.date, before) } : { value: null, missing: "first_of_routine" }; },
      categories: [{ label: "1–2 días", test: d => d <= 2 }, { label: "3–4 días", test: d => d >= 3 && d <= 4 }, { label: "5 o más", test: d => d >= 5 }] },
  ];
}

/** The week rules: the seven days before the session (the night before included for sleep), with at least four of them recorded. */
function weekRules(snapshot: InsightsSnapshot, all: readonly OwnSession[]): Rule[] {
  const daily = snapshot.relationContext.ownDaily;
  const definitions = snapshot.metrics.filter(metric => !metric.archived);
  const order = new Map(snapshot.relationContext.metricOrder.map(row => [row.id, row]));
  const sleep = relationSleepMetric(definitions.map(metric => ({ ...metric, systemKey: order.get(metric.id)?.systemKey ?? null })));
  const before = (date: string) => Array.from({ length: 7 }, (_, index) => shiftDays(date, -7 + index));
  const nights = (date: string) => Array.from({ length: 7 }, (_, index) => shiftDays(date, -6 + index));
  const average = (values: number[]): Read => values.length >= WEEK_MIN_DAYS ? { value: round1(mean(values)!) } : { value: null, missing: values.length ? "few_days" : "not_recorded" };
  const food = (key: "calories" | "proteinG") => (own: OwnSession) => average(before(own.date).flatMap(date => {
    const day = daily.nutrition.get(date); return day && day[key].missing === 0 && day[key].recorded >= 0 ? [day[key].recorded] : [];
  }));
  const rules: Rule[] = [];
  if (sleep) rules.push({ key: "sleep_week", unit: definitions.find(metric => metric.id === sleep.id)?.unit ?? null, metricId: sleep.id, kind: "numeric", read: own => average(nights(own.date).flatMap(date =>
    daily.sleepEvidence.get(sleep.id)?.get(date) === "declared" ? (daily.metrics.get(date) ?? []).filter(row => row.metricId === sleep.id).map(row => row.value) : [])) });
  rules.push(
    { key: "calories_week_target", unit: "%", metricId: null, kind: "numeric", read: own => average(before(own.date).flatMap(date => {
      const day = daily.nutrition.get(date), target = daily.targets?.get(date)?.calories;
      return day && day.calories.missing === 0 && typeof target === "number" && target > 0 ? [day.calories.recorded / target * 100] : [];
    })) },
    { key: "calories_week", unit: "kcal", metricId: null, kind: "numeric", read: food("calories") },
    { key: "protein_week", unit: "g", metricId: null, kind: "numeric", read: food("proteinG") });
  const metrics = definitions.filter(metric => metric.id !== sleep?.id && order.get(metric.id)?.systemKey !== "sleep")
    .sort((a, b) => (order.get(a.id)?.order ?? Infinity) - (order.get(b.id)?.order ?? Infinity) || a.id.localeCompare(b.id));
  for (const metric of metrics) rules.push({ key: `metric_week:${metric.id}`, unit: metric.unit, metricId: metric.id, kind: "numeric",
    read: own => average(before(own.date).flatMap(date => (daily.metrics.get(date) ?? []).filter(row => row.metricId === metric.id).map(row => row.value))) });
  // Training of the week before: sets completed in the sessions of those seven days. Zero is a real week without training.
  const byDate = new Map<string, number>();
  for (const own of all) byDate.set(own.date, (byDate.get(own.date) ?? 0) + own.sets);
  rules.push({ key: "volume_week", unit: "series", metricId: null, kind: "numeric", read: own => ({ value: before(own.date).reduce((sum, date) => sum + (byDate.get(date) ?? 0), 0) }) });
  return rules;
}

export function ownPerformance(snapshot: InsightsSnapshot, routine: string | null): InsightsOwnPerformance {
  const end = snapshot.today, start = shiftDays(end, -(OWN_DAYS - 1));
  const all = snapshot.relationContext.own;
  const inWindow = all.filter(own => own.date >= start && own.date <= end);
  const routineMap = new Map<string, { id: string; name: string | null; sessions: number; measured: number[]; last: string }>();
  for (const own of inWindow) if (own.routineId) {
    const entry = routineMap.get(own.routineId) ?? { id: own.routineId, name: own.routineName, sessions: 0, measured: [], last: own.date };
    entry.sessions++; if (own.pct !== null) entry.measured.push(own.pct);
    if (own.date >= entry.last) { entry.last = own.date; entry.name = own.routineName ?? entry.name; }
    routineMap.set(own.routineId, entry);
  }
  const routines = [...routineMap.values()].sort((a, b) => b.last.localeCompare(a.last) || a.id.localeCompare(b.id))
    .map(entry => ({ id: entry.id, name: entry.name, sessions: entry.sessions, measured: entry.measured.length, mean: entry.measured.length >= OWN_MIN_ROUTINE ? round1(mean(entry.measured)!) : null }));
  const chosen = routine && routineMap.has(routine) ? routine : null;
  const sessions = chosen ? inWindow.filter(own => own.routineId === chosen) : inWindow;
  // Twelve weeks, Monday to Sunday, the newest last; a week without sessions stays with none.
  const lastMonday = mondayOf(end), weeks = Array.from({ length: 12 }, (_, index) => shiftDays(lastMonday, -7 * (11 - index))).map(monday => {
    const rows = sessions.filter(own => own.date >= monday && own.date <= shiftDays(monday, 6)), measured = rows.flatMap(own => own.pct === null ? [] : [own.pct]);
    return { start: monday, sessions: rows.length, measured: measured.length, mean: measured.length ? round1(mean(measured)!) : null };
  });
  return { view: "own", method: OWN_METHOD, window: { start, end, days: OWN_DAYS },
    rules: { baseSize: OWN_BASE_SIZE, minBase: OWN_MIN_BASE, minExercises: OWN_MIN_EXERCISES, minPerBin: OWN_MIN_PER_BIN, minRoutine: OWN_MIN_ROUTINE },
    routine: chosen, routines, weeks, sessions,
    factors: { day: dayRules(snapshot, all).map(rule => buildFactor(rule, sessions)), week: weekRules(snapshot, all).map(rule => buildFactor(rule, sessions)) } };
}
