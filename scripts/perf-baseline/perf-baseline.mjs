#!/usr/bin/env node
// #303 · C1 development baseline. Usage: see docs/mobile/perf-baseline.md.
//   summarize --scenario <id> --run <n> [--input <file outside the repo>]   (or the raw log on stdin) → JSON on stdout
//   report <summary.json> [...]                                             → Markdown on stdout
// It writes nothing to disk: the caller redirects the output. Raw logs never enter the repository.

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, routeTemplatesFromTree, summarizeRun } from './perf-baseline-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fail = message => { process.stderr.write(`${message}\n`); process.exit(1); };
const readStdin = () => readFileSync(0, 'utf8');
const option = (args, name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const [command, ...args] = process.argv.slice(2);
if (command === 'summarize') {
  const scenario = option(args, '--scenario'), run = Number(option(args, '--run')), input = option(args, '--input');
  if (!scenario || !Number.isInteger(run)) fail('Uso: summarize --scenario <id> --run <n> [--input <archivo fuera del repo>]');
  let raw;
  if (input) {
    const real = realpathSync(resolve(input));
    // A raw capture holds paths with ids and dates: it must live outside the repository.
    if (real === root || real.startsWith(root + sep)) fail('La captura cruda está dentro del repositorio. Guardala fuera (por ejemplo en /tmp) y borrala al terminar.');
    raw = readFileSync(real, 'utf8');
  } else raw = readStdin();
  try {
    const summary = summarizeRun(raw, { scenario, run, templates: routeTemplatesFromTree(join(root, 'src', 'app')) });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) { fail(error.message); }
} else if (command === 'report') {
  if (!args.length) fail('Uso: report <resumen.json> [...]');
  try { process.stdout.write(buildReport(args.map(file => JSON.parse(readFileSync(file, 'utf8'))))); } catch (error) { fail(error.message); }
} else fail('Comandos: summarize | report. Ver docs/mobile/perf-baseline.md');
