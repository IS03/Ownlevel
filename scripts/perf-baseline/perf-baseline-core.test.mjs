// node --test scripts/perf-baseline/perf-baseline-core.test.mjs   (built-in runner, no dependency). Every input here is SYNTHETIC: these tests prove the
// parser and the redaction, never a measurement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_MARKER, READ_MARKER, UNRECOGNIZED_ROUTE, buildReport, createRouteMatcher, extractEvents, percentile, redactEvent,
  routeTemplatesFromTree, stripAnsi, summarizeRun, validateSummary,
} from './perf-baseline-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATES = routeTemplatesFromTree(join(root, 'src', 'app'));
const match = createRouteMatcher(TEMPLATES);
const UUID = '4f1d2c3b-0a9e-4b8c-9d7e-6f5a4b3c2d1e';
const api = (path, extra = {}) => `${API_MARKER} ${JSON.stringify({ appEnv: 'development', appVersion: '0.1.0', build: '42', durationMs: 120, httpStatus: 200,
  method: 'GET', outcome: 'ok', path, platform: 'ios', ...extra })}`;
const read = value => `${READ_MARKER} ${JSON.stringify(value)}`;

test('the allowlist comes from the real route tree, with dynamic folders as :params', () => {
  assert.ok(TEMPLATES.length > 50);
  assert.ok(TEMPLATES.includes('/api/mobile/v1/home'));
  assert.ok(TEMPLATES.includes('/api/mobile/v1/nutrition/days/:date/meals/:id'));
  assert.ok(TEMPLATES.every(t => t.startsWith('/api/mobile/v1') && !/\[/.test(t)));
});

test('paths with UUIDs, dates and ids map to their template; the raw value never survives', () => {
  assert.equal(match('/api/mobile/v1/nutrition/days/2026-11-12'), '/api/mobile/v1/nutrition/days/:date');
  assert.equal(match(`/api/mobile/v1/nutrition/days/2026-11-12/meals/${UUID}`), '/api/mobile/v1/nutrition/days/:date/meals/:id');
  assert.equal(match(`/api/mobile/v1/training/sessions/${UUID}/feelings`), '/api/mobile/v1/training/sessions/:sessionId/feelings');
  assert.equal(match('/api/mobile/v1/progress/body?period=7&from=2026-11-01'), '/api/mobile/v1/progress/body');
  assert.equal(match('/api/mobile/v1/home/'), '/api/mobile/v1/home');
});

test('a static segment beats a dynamic one (order vs :id)', () => {
  assert.equal(match('/api/mobile/v1/metrics/definitions/order'), '/api/mobile/v1/metrics/definitions/order');
  assert.equal(match(`/api/mobile/v1/metrics/definitions/${UUID}`), '/api/mobile/v1/metrics/definitions/:id');
});

test('anything not in the allowlist is anonymized, never echoed', () => {
  for (const path of ['/api/mobile/v1/unknown/thing', `/api/mobile/v1/home/${UUID}`, '/rest/v1/meal_entries?user_id=eq.123', 'https://example.com/x', '', null, 42]) {
    assert.equal(match(path), UNRECOGNIZED_ROUTE);
  }
});

test('Expo/Metro output: ANSI colors, LOG/INFO prefixes and multi-line objects are read', () => {
  const ansi = `\u001b[2m12:00:01\u001b[22m \u001b[36m INFO \u001b[39m ${api('/api/mobile/v1/home')}`;
  const multi = ` LOG  ${API_MARKER} {\n  "appEnv": "development",\n  "durationMs": 88,\n  "httpStatus": 200,\n  "method": "GET",\n  "outcome": "ok",\n  "path": "/api/mobile/v1/nutrition/days/2026-11-12",\n  "platform": "ios"\n}`;
  const inspect = `(NOBRIDGE) LOG  ${READ_MARKER} { event: 'settled', family: 'nutrition-day', durationMs: 77, trigger: undefined }`;
  const { events, unparsed } = extractEvents([ansi, multi, inspect, 'iOS Bundled 812ms index.ts (1530 modules)'].join('\n'));
  assert.equal(unparsed, 0);
  assert.deepEqual(events.map(e => e.kind), ['api', 'api', 'read']);
  assert.equal(events[1].value.durationMs, 88);
  assert.equal(events[2].value.family, 'nutrition-day');
  assert.equal(stripAnsi('\u001b[31mx\u001b[0m'), 'x');
});

test('an unreadable or truncated object is counted, never guessed', () => {
  const { events, unparsed } = extractEvents(`${API_MARKER} {"method": "GET", "path": \n${API_MARKER} not an object\n${READ_MARKER} {event: 'reuse', family: `);
  assert.equal(events.length, 0);
  assert.equal(unparsed, 3);
});

test('redaction keeps only allowlisted fields: no path, version, build, status code or unknown key', () => {
  const clean = redactEvent({ kind: 'api', value: { method: 'GET', path: `/api/mobile/v1/training/routines/${UUID}`, outcome: 'ok', durationMs: 12.6,
    appVersion: '0.1.0', build: '42', httpStatus: 200, platform: 'ios', appEnv: 'development', token: 'Bearer secret', body: '{"kcal":500}' } }, match);
  assert.deepEqual(clean, { kind: 'api', method: 'GET', route: '/api/mobile/v1/training/routines/:id', outcome: 'ok', durationMs: 13, platform: 'ios', appEnv: 'development' });
  assert.equal(redactEvent({ kind: 'api', value: { method: 'EVIL', path: '/api/mobile/v1/home', outcome: 'ok' } }, match), null);
  assert.equal(redactEvent({ kind: 'read', value: { event: 'reuse', family: 'secret-family' } }, match), null);
});

test('a run summary holds aggregates only: no raw path, date, UUID or token anywhere in its JSON', () => {
  const raw = [
    api('/api/mobile/v1/home'), api('/api/mobile/v1/home', { durationMs: 140 }),
    api(`/api/mobile/v1/nutrition/days/2026-11-12/meals/${UUID}`, { method: 'DELETE', outcome: 'conflict', httpStatus: 409 }),
    api('/api/mobile/v1/secret/2026-11-12'), read({ event: 'reuse', family: 'nutrition-day', trigger: 'initial', ageMs: 1200 }),
    read({ event: 'settled', family: 'nutrition-day', durationMs: 90 }), `${API_MARKER} {"Authorization": "Bearer abc.def.ghi"}`,
  ].join('\n');
  const summary = summarizeRun(raw, { scenario: 'tabs', run: 1, templates: TEMPLATES });
  const json = JSON.stringify(summary);
  for (const leak of [UUID, '2026-11-12', 'Bearer', '0.1.0', '"42"', 'secret', 'httpStatus']) assert.ok(!json.includes(leak), `leaked ${leak}`);
  assert.equal(summary.api.find(r => r.route === '/api/mobile/v1/home').calls, 2);
  assert.deepEqual(summary.api.find(r => r.route === '/api/mobile/v1/home').durationsMs, [120, 140]);
  assert.equal(summary.api.find(r => r.route === UNRECOGNIZED_ROUTE).calls, 1);
  assert.equal(summary.events.rejected, 1);
  assert.deepEqual(summary.reads, [{ family: 'nutrition-day', reuse: 1, network: 0, join: 0, settled: 1, invalidate: 0, evict: 0, settledMs: [90] }]);
  validateSummary(summary);
});

test('logical requests: two callers joined by InFlightGet are two API events, and the report never calls them physical', () => {
  // One transport, two consumers: the client records one event per caller.
  const raw = [api('/api/mobile/v1/home'), api('/api/mobile/v1/home'), read({ event: 'join', family: 'overview', trigger: 'initial' })].join('\n');
  const summary = summarizeRun(raw, { scenario: 'cold-start', run: 1, templates: TEMPLATES });
  assert.equal(summary.api[0].calls, 2);
  const report = buildReport([summary]);
  assert.match(report, /Solicitudes \*\*lógicas\*\*/);
  assert.match(report, /físicas de red: No medido/);
});

test('nearest-rank percentiles, and nothing below the minimum sample', () => {
  const ten = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(ten, 50), 50);
  assert.equal(percentile(ten, 95), null);
  const twenty = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
  assert.equal(percentile(twenty, 95), 190);
  assert.equal(percentile([5, 6, 7, 8], 50), null);
  assert.equal(percentile([], 50), null);
});

test('the report shows per-run counts, spread, errors, sample sizes and flags missing runs', () => {
  const run = (n, homes) => summarizeRun(Array.from({ length: homes }, (_, i) => api('/api/mobile/v1/home', { durationMs: 100 + i })).join('\n'),
    { scenario: 'return-over-30s', run: n, templates: TEMPLATES });
  const report = buildReport([run(1, 2), run(2, 3), run(3, 2)]);
  assert.match(report, /\| GET \| `\/api\/mobile\/v1\/home` \| 2 \/ 3 \/ 2 \| 2–3 \| 0 \| 7 \| 101 ms \| n<20 \|/);
  assert.match(buildReport([run(1, 1)]), /el procedimiento pide 3/);
  assert.throws(() => buildReport([run(1, 1), run(1, 1)]), /Corrida repetida/);
});

test('unknown scenarios, bad runs and hand-made summaries are refused', () => {
  assert.throws(() => summarizeRun('', { scenario: 'my-scenario', run: 1, templates: TEMPLATES }), /Escenario desconocido/);
  assert.throws(() => summarizeRun('', { scenario: 'tabs', run: 0, templates: TEMPLATES }), /entero/);
  const forged = { ...summarizeRun(api('/api/mobile/v1/home'), { scenario: 'tabs', run: 1, templates: TEMPLATES }) };
  forged.api = [{ ...forged.api[0], route: `/api/mobile/v1/nutrition/days/2026-11-12` }];
  assert.throws(() => validateSummary(forged), /Resumen inválido/);
  assert.throws(() => validateSummary({ schema: 'other' }), /Resumen inválido/);
});
