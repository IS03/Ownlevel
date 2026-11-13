#!/usr/bin/env node
// #303 · C1 development baseline. Usage: see docs/mobile/perf-baseline.md.
//   summarize --scenario <id> --run <n> [--input <file outside the repo>]   (or the raw log on stdin) → JSON on stdout
//   report <summary.json> [...]                                             → Markdown on stdout
// It writes nothing to disk: the caller redirects the output. Raw logs never enter the repository.
//
// Error output is fixed text only. stderr never carries file contents, file names, paths or the message of a system or
// JSON error (a JSON.parse message can quote the malformed input). stdout stays empty on any failure.

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerfBaselineError, buildReport, routeTemplatesFromTree, summarizeRun } from './perf-baseline-core.mjs';

const MESSAGES = Object.freeze({
  usage: 'Comandos: summarize | report. Ver docs/mobile/perf-baseline.md',
  summarizeUsage: 'Uso: summarize --scenario <id> --run <n> [--input <archivo fuera del repo>]',
  reportUsage: 'Uso: report <resumen.json> [...]',
  insideRepo: 'La captura cruda está dentro del repositorio. Guardala fuera (por ejemplo en /tmp) y borrala al terminar.',
  unreadableInput: 'No se pudo leer la captura indicada.',
  unreadableStdin: 'No se pudo leer la entrada estándar.',
  unreadableSummary: 'No se pudo leer uno de los resúmenes indicados.',
  invalidJson: 'Uno de los resúmenes no es JSON válido.',
  routes: 'No se pudo leer el árbol de rutas de la API.',
  unexpected: 'Error inesperado. No se imprimió ningún resultado.',
});

/** Fails with a fixed message: the cause (system error, JSON error) is dropped on purpose and never printed. */
class CliFailure extends Error {}
const failWith = key => { throw new CliFailure(MESSAGES[key]); };
const attempt = (fn, key) => { try { return fn(); } catch { return failWith(key); } };
const option = (args, name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const templates = () => attempt(() => routeTemplatesFromTree(join(root, 'src', 'app')), 'routes');

function summarize(args) {
  const scenario = option(args, '--scenario'), run = Number(option(args, '--run')), input = option(args, '--input');
  if (!scenario || !Number.isInteger(run)) failWith('summarizeUsage');
  let raw;
  if (input) {
    const real = attempt(() => realpathSync(resolve(input)), 'unreadableInput');
    // A raw capture holds paths with ids and dates: it must live outside the repository.
    if (real === root || real.startsWith(root + sep)) failWith('insideRepo');
    raw = attempt(() => readFileSync(real, 'utf8'), 'unreadableInput');
  } else raw = attempt(() => readFileSync(0, 'utf8'), 'unreadableStdin');
  return `${JSON.stringify(summarizeRun(raw, { scenario, run, templates: templates() }), null, 2)}\n`;
}

function report(files) {
  if (!files.length) failWith('reportUsage');
  // Read, parse and validate everything first: a rejected input produces no partial report.
  const summaries = files.map(file => {
    const text = attempt(() => readFileSync(file, 'utf8'), 'unreadableSummary');
    return attempt(() => JSON.parse(text), 'invalidJson');
  });
  return buildReport(summaries, templates());
}

const [command, ...args] = process.argv.slice(2);
let output;
try {
  if (command === 'summarize') output = summarize(args);
  else if (command === 'report') output = report(args);
  else failWith('usage');
} catch (error) {
  // Only our own fixed texts reach stderr: CliFailure (this file) and PerfBaselineError (core, never echoes input).
  const safe = error instanceof CliFailure || error instanceof PerfBaselineError ? error.message : MESSAGES.unexpected;
  process.stderr.write(`${safe}\n`);
  process.exit(1);
}
process.stdout.write(output);
