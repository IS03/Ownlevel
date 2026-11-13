// node --test scripts/perf-baseline/perf-baseline-cli.test.mjs   The CLI as a process: every input here is SYNTHETIC.
// It proves the failure contract: stdout empty, exit code ≠ 0, and stderr with a fixed text that never carries file
// contents, file names or paths (a JSON.parse message, for instance, can quote the malformed input).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_MARKER, READ_MARKER } from './perf-baseline-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, 'perf-baseline.mjs');
const root = resolve(here, '..', '..');

const SECRETS = ['nombre.apellido@example.com', 'eyJhbGciOiJIUzI1NiJ9.secreto', 'sk_live_123secreto', 'Juan Pérez', 'usuario-privado'];
// A private directory and file names that are themselves sensitive: none of them may reach stderr.
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ownlevel-cli-usuario-privado-')));
const sensitive = name => join(dir, name);
after(() => rmSync(dir, { recursive: true, force: true }));

const run = (args, input) => {
  const result = spawnSync(process.execPath, [cli, ...args], { input: input ?? '', encoding: 'utf8', cwd: root });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

/** The failure contract, for any failure. `extra` lists the values specific to that case (names, paths). */
function assertSafeFailure(result, extra = []) {
  assert.notEqual(result.status, 0, 'exit code must be non-zero');
  assert.equal(result.stdout, '', 'stdout must stay empty');
  assert.ok(result.stderr.trim().length > 0, 'stderr explains the failure');
  assert.equal(result.stderr.trim().split('\n').length, 1, 'one fixed line, no stack trace');
  for (const value of [...SECRETS, dir, tmpdir(), ...extra]) assert.ok(!result.stderr.includes(value), 'stderr leaked an input value or a path');
  assert.ok(!/Unexpected token|is not valid JSON|ENOENT|EISDIR|EACCES|at .*\.mjs/.test(result.stderr), 'stderr carries a raw system or JSON error');
}

const syntheticLog = [
  `${API_MARKER} ${JSON.stringify({ appEnv: 'development', appVersion: '0.1.0', build: '42', durationMs: 120, httpStatus: 200, method: 'GET', outcome: 'ok', path: '/api/mobile/v1/home', platform: 'ios' })}`,
  `${API_MARKER} ${JSON.stringify({ appEnv: 'development', appVersion: '0.1.0', build: '42', durationMs: 90, httpStatus: 200, method: 'GET', outcome: 'ok', path: '/api/mobile/v1/nutrition/days/2026-11-12', platform: 'ios' })}`,
  `${READ_MARKER} ${JSON.stringify({ family: 'overview', event: 'settled', trigger: 'initial', durationMs: 130 })}`,
].join('\n');

function legitSummaryFile(name = 'tabs-1.json') {
  const result = run(['summarize', '--scenario', 'tabs', '--run', '1'], syntheticLog);
  assert.equal(result.status, 0, result.stderr);
  const file = sensitive(name);
  writeFileSync(file, result.stdout);
  return { file, json: result.stdout };
}

test('legitimate summaries are still processed: summarize from stdin and file, then report', () => {
  const { file, json } = legitSummaryFile();
  assert.ok(!json.includes('2026-11-12'), 'the summary never keeps the raw path');
  const log = sensitive('captura.log');
  writeFileSync(log, syntheticLog);
  const fromFile = run(['summarize', '--scenario', 'tabs', '--run', '2', '--input', log]);
  assert.equal(fromFile.status, 0, fromFile.stderr);
  const second = sensitive('tabs-2.json');
  writeFileSync(second, fromFile.stdout);
  const report = run(['report', file, second]);
  assert.equal(report.status, 0, report.stderr);
  assert.equal(report.stderr, '');
  assert.match(report.stdout, /^# Baseline de lecturas/);
  assert.match(report.stdout, /\/api\/mobile\/v1\/nutrition\/days\/:date/);
});

test('malformed JSON with synthetic secrets: fixed message, nothing of the file is echoed', () => {
  const bodies = [
    `${SECRETS[2]} ${SECRETS[0]} no es JSON`,                       // JSON.parse quotes the start of this text
    `{"token": "${SECRETS[1]}", "email": "${SECRETS[0]}", `,        // truncated object
    `{"name": "${SECRETS[3]}" "path": "/api/mobile/v1/${SECRETS[4]}"}`, // missing comma, message points into it
    `\u0000${SECRETS[2]}`,
    '',
  ];
  bodies.forEach((body, i) => {
    const file = sensitive(`${SECRETS[0]}-${SECRETS[2]}-${i}.json`);
    writeFileSync(file, body);
    assertSafeFailure(run(['report', file]), [file]);
  });
});

test('one malformed summary among valid ones: no partial report on stdout', () => {
  const { file } = legitSummaryFile('cold-start-1.json');
  const bad = sensitive(`${SECRETS[4]}.json`);
  writeFileSync(bad, `{"schema": "${SECRETS[1]}"`);
  assertSafeFailure(run(['report', file, bad]), [bad]);
  assertSafeFailure(run(['report', bad, file]), [bad]);
});

test('valid JSON forged with secrets: refused by validation, without echoing the value', () => {
  const { json } = legitSummaryFile('forge-base.json');
  const forged = JSON.parse(json);
  forged.api[0].route = `/api/mobile/v1/${SECRETS[0]}`;
  forged.environment.platforms = [SECRETS[1]];
  const file = sensitive(`${SECRETS[3]}.json`);
  writeFileSync(file, JSON.stringify(forged));
  assertSafeFailure(run(['report', file]), [file]);
});

test('missing files, directories and sensitive names: fixed message without the name or the path', () => {
  const missing = sensitive(`${SECRETS[0]}-no-existe.json`);
  assertSafeFailure(run(['report', missing]), [missing]);
  const folder = sensitive(`${SECRETS[2]}-carpeta`);
  mkdirSync(folder);
  assertSafeFailure(run(['report', folder]), [folder]);
  assertSafeFailure(run(['summarize', '--scenario', 'tabs', '--run', '1', '--input', missing]), [missing]);
  assertSafeFailure(run(['summarize', '--scenario', 'tabs', '--run', '1', '--input', folder]), [folder]);
});

test('a capture inside the repository is refused without echoing its path', () => {
  const inside = fileURLToPath(import.meta.url);
  assertSafeFailure(run(['summarize', '--scenario', 'tabs', '--run', '1', '--input', inside]), [inside, root]);
});

test('bad arguments never echo what was typed', () => {
  assertSafeFailure(run(['summarize', '--scenario', SECRETS[0], '--run', '1'], syntheticLog), [SECRETS[0]]);
  assertSafeFailure(run(['summarize', '--scenario', 'tabs', '--run', SECRETS[2]], syntheticLog));
  assertSafeFailure(run(['summarize', '--scenario', 'tabs', '--run', '1000'], syntheticLog));
  assertSafeFailure(run([SECRETS[1]]));
  assertSafeFailure(run(['report']));
});
