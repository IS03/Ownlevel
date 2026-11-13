// #303 · C1: pure functions of the development baseline. No I/O beyond `routeTemplatesFromTree`, no network, no state.
//
// What the existing development telemetry means (apps/mobile/src/api):
// - `[OWNLEVEL API]` (client.ts `record`): ONE event per LOGICAL client request, after its result. Two callers joined by
//   InFlightGet share one transport but each record their own event, so these counts are NOT physical network requests.
// - `[OWNLEVEL Read Reuse]` (confirmed-read-cache.ts `record`): decisions of the retained-read cache: reuse (no request),
//   network (a read started), join (joined a read in flight), settled (a read finished, with its duration), invalidate, evict.
// Physical network requests are not observable from these logs: every report says «No medido» for them.

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const SCHEMA = 'ownlevel-perf-baseline/1';
export const API_MARKER = '[OWNLEVEL API]';
export const READ_MARKER = '[OWNLEVEL Read Reuse]';
export const UNRECOGNIZED_ROUTE = '<ruta no reconocida>';
/** The documented procedure (docs/mobile/perf-baseline.md). Anything else is refused. */
export const SCENARIOS = Object.freeze([
  'cold-start', 'tabs', 'return-under-30s', 'return-over-30s', 'foreground', 'date-change', 'write-meal', 'write-metric',
]);
export const RUNS_PER_SCENARIO = 3;
/** Smallest samples for which a percentile is shown; below, the cell says why it is missing. */
export const MIN_SAMPLE = Object.freeze({ p50: 5, p95: 20 });

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const READ_EVENTS = new Set(['reuse', 'network', 'join', 'settled', 'invalidate', 'evict']);
const READ_FAMILIES = new Set(['overview', 'body', 'training', 'metrics', 'nutrition-report', 'nutrition-day', 'progress-extra']);
const TRIGGERS = new Set(['initial', 'foreground', 'manual']);
/** `MobileApiTelemetryOutcome` (apps/mobile/src/api/telemetry.ts + results.ts): the only outcome texts that can reach a report. */
export const OUTCOMES = Object.freeze(['ok', 'auth_required', 'unauthorized', 'conflict', 'not_found', 'validation',
  'aborted', 'auth', 'invalid_response', 'network', 'server', 'timeout']);
const OUTCOME_SET = new Set(OUTCOMES);
/** `MobileApiPlatform` and `MobileAppEnvironment` (runtime.ts, config.ts). */
export const PLATFORMS = Object.freeze(['ios', 'android']);
export const APP_ENVS = Object.freeze(['development', 'preview', 'production']);
const READ_COUNTERS = Object.freeze(['reuse', 'network', 'join', 'settled', 'invalidate', 'evict']);
/** Ten minutes: a longer client duration is not a measurement, it is a broken or forged value. */
const MAX_DURATION_MS = 600_000;
const MAX_RUN = 99;

/**
 * The only error whose message the CLI prints. Every message is a fixed text written here: it never carries input
 * (log lines, summary values, file names or paths). Any other error is reported by the CLI with a generic fixed text.
 */
export class PerfBaselineError extends Error {
  constructor(message) { super(message); this.name = 'PerfBaselineError'; }
}

// ---------- Route allowlist ----------

/**
 * Route templates of the mobile API, read from the Next.js route tree (`src/app/api/mobile/v1/** /route.ts`), so the
 * allowlist can never drift from the routes that exist. `[param]` folders become `:param`.
 */
export function routeTemplatesFromTree(appDir) {
  const base = join(appDir, 'api', 'mobile', 'v1');
  const templates = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === 'route.ts') {
        const rel = relative(appDir, dir).split(sep).map(segment => /^\[.+\]$/.test(segment) ? `:${segment.slice(1, -1)}` : segment);
        templates.push(`/${rel.join('/')}`);
      }
    }
  };
  walk(base);
  return templates.sort();
}

/**
 * Maps a client path to its template. Static segments must match exactly; a dynamic one matches one non-empty segment.
 * When several templates match, the most static wins (`/definitions/order` before `/definitions/:id`). Anything else is
 * `<ruta no reconocida>`: the raw path (it may hold ids, dates or names) never reaches the output.
 */
export function createRouteMatcher(templates) {
  const compiled = templates.map(template => {
    const parts = template.split('/').filter(Boolean);
    return { template, parts, dynamic: parts.filter(part => part.startsWith(':')).length };
  }).sort((a, b) => a.dynamic - b.dynamic || a.template.localeCompare(b.template));
  return path => {
    if (typeof path !== 'string') return UNRECOGNIZED_ROUTE;
    const clean = path.split(/[?#]/, 1)[0].replace(/\/+$/, '');
    const parts = clean.split('/').filter(Boolean);
    for (const candidate of compiled) {
      if (candidate.parts.length !== parts.length) continue;
      if (candidate.parts.every((part, index) => part.startsWith(':') ? parts[index].length > 0 : part === parts[index])) return candidate.template;
    }
    return UNRECOGNIZED_ROUTE;
  };
}

// ---------- Log extraction ----------

/** CSI/OSC escape sequences (colors, cursor) that Metro and Expo add to terminal output. */
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
export const stripAnsi = text => text.replace(ANSI, '');

/** The balanced `{…}` that starts at `start`, across lines, ignoring braces inside strings. */
function balancedObject(text, start) {
  let depth = 0, quote = null;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quote) { if (char === '\\') i++; else if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** JSON, or the inspect style of a JS console (`{ key: 'value' }`); never anything evaluated as code. */
function parseObject(raw) {
  try { return JSON.parse(raw); } catch { /* try the relaxed form */ }
  const relaxed = raw
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_m, body) => JSON.stringify(body.replace(/\\'/g, "'")))
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/:\s*undefined\b/g, ': null')
    .replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(relaxed); } catch { return undefined; }
}

/**
 * Every telemetry object found in a raw log (Expo/Metro terminal, Xcode console, `adb logcat`): ANSI stripped, objects
 * that span several lines rejoined. A marker whose object cannot be read is counted, never guessed.
 */
export function extractEvents(rawText) {
  const text = stripAnsi(String(rawText)).replace(/\r\n?/g, '\n');
  const events = [];
  let unparsed = 0;
  for (const [marker, kind] of [[API_MARKER, 'api'], [READ_MARKER, 'read']]) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(marker, from);
      if (at < 0) break;
      from = at + marker.length;
      const open = text.indexOf('{', from);
      const nextMarker = Math.min(...[API_MARKER, READ_MARKER].map(m => { const i = text.indexOf(m, from); return i < 0 ? Infinity : i; }));
      const raw = open >= 0 && open < nextMarker ? balancedObject(text, open) : null;
      const value = raw ? parseObject(raw) : undefined;
      if (value && typeof value === 'object' && !Array.isArray(value)) events.push({ kind, value, at }); else unparsed++;
    }
  }
  events.sort((a, b) => a.at - b.at);
  return { events: events.map(({ kind, value }) => ({ kind, value })), unparsed };
}

// ---------- Redaction and summary of one run ----------

const finiteMs = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_DURATION_MS ? Math.round(value) : null;

/**
 * Keeps only what the baseline needs, from an allowlist of fields and values: method, route TEMPLATE, outcome, client
 * duration, and the cache decision/family/trigger. Paths, ids, tokens, dates, versions, bodies and anything unexpected
 * are dropped. An event with an unexpected shape is rejected and counted.
 */
export function redactEvent(event, matchRoute) {
  const v = event.value;
  if (event.kind === 'api') {
    if (!METHODS.has(v.method) || !OUTCOME_SET.has(v.outcome)) return null;
    return { kind: 'api', method: v.method, route: matchRoute(v.path), outcome: v.outcome, durationMs: finiteMs(v.durationMs),
      platform: PLATFORMS.includes(v.platform) ? v.platform : null, appEnv: APP_ENVS.includes(v.appEnv) ? v.appEnv : null };
  }
  if (!READ_EVENTS.has(v.event) || !READ_FAMILIES.has(v.family)) return null;
  return { kind: 'read', event: v.event, family: v.family, trigger: TRIGGERS.has(v.trigger) ? v.trigger : null,
    durationMs: v.event === 'settled' ? finiteMs(v.durationMs) : null };
}

const tally = (map, key, fields) => { const row = map.get(key) ?? { ...fields }; map.set(key, row); return row; };

/** The stored artifact of one run: aggregates only, safe to keep. */
export function summarizeRun(rawText, { scenario, run, templates }) {
  if (!SCENARIOS.includes(scenario)) throw new PerfBaselineError(`Escenario desconocido. Válidos: ${SCENARIOS.join(', ')}`);
  if (!Number.isInteger(run) || run < 1 || run > MAX_RUN) throw new PerfBaselineError(`La corrida debe ser un entero entre 1 y ${MAX_RUN}.`);
  const matchRoute = createRouteMatcher(templates);
  const { events, unparsed } = extractEvents(rawText);
  const api = new Map(), reads = new Map(), platforms = new Set(), appEnvs = new Set();
  let rejected = 0;
  for (const event of events) {
    const clean = redactEvent(event, matchRoute);
    if (!clean) { rejected++; continue; }
    if (clean.kind === 'api') {
      if (clean.platform) platforms.add(clean.platform);
      if (clean.appEnv) appEnvs.add(clean.appEnv);
      const row = tally(api, `${clean.method} ${clean.route}`, { method: clean.method, route: clean.route, calls: 0, outcomes: {}, durationsMs: [] });
      row.calls++; row.outcomes[clean.outcome] = (row.outcomes[clean.outcome] ?? 0) + 1;
      if (clean.durationMs !== null) row.durationsMs.push(clean.durationMs);
    } else {
      const row = tally(reads, clean.family, { family: clean.family, reuse: 0, network: 0, join: 0, settled: 0, invalidate: 0, evict: 0, settledMs: [] });
      row[clean.event]++;
      if (clean.durationMs !== null) row.settledMs.push(clean.durationMs);
    }
  }
  const sortRows = rows => [...rows].sort((a, b) => (a.route ?? a.family).localeCompare(b.route ?? b.family) || (a.method ?? '').localeCompare(b.method ?? ''));
  const finish = row => ({ ...row, ...(row.durationsMs ? { durationsMs: [...row.durationsMs].sort((a, b) => a - b) } : {}),
    ...(row.settledMs ? { settledMs: [...row.settledMs].sort((a, b) => a - b) } : {}) });
  return validateSummary({
    schema: SCHEMA, scenario, run,
    environment: { platforms: [...platforms].sort(), appEnvs: [...appEnvs].sort() },
    events: { api: events.filter(e => e.kind === 'api').length, read: events.filter(e => e.kind === 'read').length, unparsed, rejected },
    api: sortRows(api.values()).map(finish),
    reads: sortRows(reads.values()).map(finish),
  }, templates);
}

const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const count = value => Number.isSafeInteger(value) && value >= 0;
const durations = (value, max) => Array.isArray(value) && value.length <= max
  && value.every((n, i) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_DURATION_MS && (i === 0 || value[i - 1] <= n));
const enumList = (value, allowed) => Array.isArray(value) && new Set(value).size === value.length && value.every(item => allowed.includes(item));

/**
 * The ONLY input `report` accepts: a summary exactly as `summarize` writes it. Every key, enum, counter and array is
 * checked, and a route must be one of the real route templates (or `<ruta no reconocida>`): a forged route such as
 * `/api/mobile/v1/perfil/nombre`, an email in the environment or any extra key is refused before anything is printed.
 * The error never echoes the offending value.
 */
export function validateSummary(summary, templates) {
  if (!Array.isArray(templates) || !templates.length) throw new PerfBaselineError('Falta la lista de plantillas de rutas para validar el resumen.');
  const allowedRoutes = new Set([...templates, UNRECOGNIZED_ROUTE]);
  const reject = where => { throw new PerfBaselineError(`Resumen inválido (${where}): no tiene la forma ownlevel-perf-baseline/1 generada por summarize.`); };
  if (!exactKeys(summary, ['schema', 'scenario', 'run', 'environment', 'events', 'api', 'reads'])) reject('claves');
  if (summary.schema !== SCHEMA) reject('schema');
  if (!SCENARIOS.includes(summary.scenario)) reject('escenario');
  if (!Number.isInteger(summary.run) || summary.run < 1 || summary.run > MAX_RUN) reject('corrida');
  const env = summary.environment;
  if (!exactKeys(env, ['platforms', 'appEnvs']) || !enumList(env.platforms, PLATFORMS) || !enumList(env.appEnvs, APP_ENVS)) reject('environment');
  const ev = summary.events;
  if (!exactKeys(ev, ['api', 'read', 'unparsed', 'rejected']) || !['api', 'read', 'unparsed', 'rejected'].every(key => count(ev[key]))) reject('events');
  if (!Array.isArray(summary.api) || !Array.isArray(summary.reads)) reject('listas');
  const seen = new Set();
  let apiCalls = 0;
  for (const row of summary.api) {
    if (!exactKeys(row, ['method', 'route', 'calls', 'outcomes', 'durationsMs'])) reject('api.claves');
    if (!METHODS.has(row.method) || typeof row.route !== 'string' || !allowedRoutes.has(row.route)) reject('api.ruta');
    if (!Number.isSafeInteger(row.calls) || row.calls < 1) reject('api.llamadas');
    if (!isObject(row.outcomes) || !Object.keys(row.outcomes).length || !Object.entries(row.outcomes).every(([key, n]) => OUTCOME_SET.has(key) && Number.isSafeInteger(n) && n >= 1)
      || Object.values(row.outcomes).reduce((sum, n) => sum + n, 0) !== row.calls) reject('api.resultados');
    if (!durations(row.durationsMs, row.calls)) reject('api.duraciones');
    const key = `${row.method} ${row.route}`;
    if (seen.has(key)) reject('api.duplicada');
    seen.add(key); apiCalls += row.calls;
  }
  if (apiCalls > ev.api) reject('api.total');
  const families = new Set();
  for (const row of summary.reads) {
    if (!exactKeys(row, ['family', ...READ_COUNTERS, 'settledMs'])) reject('reads.claves');
    if (!READ_FAMILIES.has(row.family) || families.has(row.family)) reject('reads.familia');
    if (!READ_COUNTERS.every(key => count(row[key])) || !durations(row.settledMs, row.settled)) reject('reads.contadores');
    families.add(row.family);
  }
  return summary;
}

// ---------- Statistics and report ----------

/** Nearest-rank percentile of a sorted sample; null below the minimum sample for that percentile. */
export function percentile(sorted, p) {
  const min = p === 95 ? MIN_SAMPLE.p95 : MIN_SAMPLE.p50;
  if (!sorted.length || sorted.length < min) return null;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}
const cell = (sorted, p) => { const value = percentile(sorted, p); return value === null ? `n<${p === 95 ? MIN_SAMPLE.p95 : MIN_SAMPLE.p50}` : `${value} ms`; };
const errorsOf = outcomes => Object.entries(outcomes).filter(([outcome]) => outcome !== 'ok').reduce((sum, [, n]) => sum + n, 0);

/** Markdown report across runs. It describes; it never states a saving or a cause. */
export function buildReport(summaries, templates) {
  const byScenario = new Map();
  for (const summary of summaries.map(summary => validateSummary(summary, templates))) {
    const list = byScenario.get(summary.scenario) ?? [];
    if (list.some(s => s.run === summary.run)) throw new PerfBaselineError(`Corrida repetida: ${summary.scenario} #${summary.run}.`);
    list.push(summary); byScenario.set(summary.scenario, list);
  }
  const lines = ['# Baseline de lecturas · OWNLEVEL Mobile (#303)', '',
    '> Solicitudes **lógicas** del cliente (`[OWNLEVEL API]`): dos llamadas unidas por InFlightGet cuentan dos veces. Solicitudes **físicas de red: No medido.** Duraciones medidas en el cliente (fetch + lectura del cuerpo), no en el servidor. p50 requiere n ≥ 5 y p95 n ≥ 20.', ''];
  for (const scenario of SCENARIOS.filter(s => byScenario.has(s))) {
    const runs = byScenario.get(scenario).sort((a, b) => a.run - b.run);
    const env = [...new Set(runs.flatMap(r => [...r.environment.platforms, ...r.environment.appEnvs]))].join(', ') || 'sin datos';
    lines.push(`## ${scenario}`, '', `Corridas: ${runs.length}${runs.length === RUNS_PER_SCENARIO ? '' : ` (el procedimiento pide ${RUNS_PER_SCENARIO})`} · entorno: ${env}`);
    const unparsed = runs.reduce((s, r) => s + r.events.unparsed, 0), rejected = runs.reduce((s, r) => s + r.events.rejected, 0);
    if (unparsed || rejected) lines.push(`Eventos ilegibles: ${unparsed} · rechazados por forma inesperada: ${rejected} (no incluidos).`);
    lines.push('', '| Método | Ruta | Llamadas por corrida | Mín–máx | Errores | n | p50 | p95 |', '|---|---|---|---|---|---|---|---|');
    const keys = [...new Set(runs.flatMap(r => r.api.map(row => `${row.method} ${row.route}`)))].sort();
    for (const key of keys) {
      const perRun = runs.map(r => r.api.find(row => `${row.method} ${row.route}` === key));
      const counts = perRun.map(row => row?.calls ?? 0), pooled = perRun.flatMap(row => row?.durationsMs ?? []).sort((a, b) => a - b);
      const [method, ...route] = key.split(' ');
      lines.push(`| ${method} | \`${route.join(' ')}\` | ${counts.join(' / ')} | ${Math.min(...counts)}–${Math.max(...counts)} | ${perRun.reduce((s, row) => s + (row ? errorsOf(row.outcomes) : 0), 0)} | ${pooled.length} | ${cell(pooled, 50)} | ${cell(pooled, 95)} |`);
    }
    if (!keys.length) lines.push('| — | sin solicitudes registradas | | | | | | |');
    const families = [...new Set(runs.flatMap(r => r.reads.map(row => row.family)))].sort();
    if (families.length) {
      lines.push('', '| Caché (familia) | reuse | network | join | settled | invalidate | evict | p50 settled |', '|---|---|---|---|---|---|---|---|');
      for (const family of families) {
        const rows = runs.map(r => r.reads.find(row => row.family === family));
        const sum = key => rows.map(row => row?.[key] ?? 0).join(' / ');
        lines.push(`| ${family} | ${sum('reuse')} | ${sum('network')} | ${sum('join')} | ${sum('settled')} | ${sum('invalidate')} | ${sum('evict')} | ${cell(rows.flatMap(row => row?.settledMs ?? []).sort((a, b) => a - b), 50)} |`);
      }
    }
    lines.push('');
  }
  lines.push('## Limitaciones', '', '- Build de desarrollo (`__DEV__`), no Release; red y CPU del entorno de captura, no de un iPhone en la calle.',
    '- No mide solicitudes físicas, memoria, tiempo hasta datos visibles ni costo en Supabase/Vercel.',
    '- Una captura incompleta (logs perdidos por Metro) subestima las llamadas; los eventos ilegibles se informan arriba.', '');
  return lines.join('\n');
}
