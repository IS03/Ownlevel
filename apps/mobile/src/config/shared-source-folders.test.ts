import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { describe, expect, it } from '@jest/globals';
import * as ts from 'typescript';

import { SHARED_SOURCE_FOLDERS } from './shared-source-folders';

// Jest resolves any relative path, so a Mobile import of a src/lib folder that Metro
// does not watch passes the tests and only breaks the bundle. This walks the runtime
// import graph the way the bundle sees it (type-only imports are erased by Babel) and
// checks it against the folders metro.config.js exposes.
const APP = resolve(__dirname, '../..');
const REPO = resolve(APP, '../..');
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json'];
const SKIPPED_DIRS = new Set(['node_modules', 'ios', 'android', '.expo', 'dist', 'coverage', '__tests__']);

const isFile = (path: string) => existsSync(path) && statSync(path).isFile();
const insideApp = (path: string) => path.startsWith(APP + sep);
const fromRepo = (path: string) => relative(REPO, path).split(sep).join('/');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

function resolveRelative(from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier);
  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => join(base, `index${ext}`))];
  return candidates.find(isFile) ?? null;
}

/** Module specifiers this file loads at runtime; `import type` / `export type` are skipped. */
function runtimeImports(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword) specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!node.isTypeOnly) specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

/** Every file outside apps/mobile the bundle reaches, plus problems Metro would hit there. */
function sharedRuntimeGraph() {
  const queue = [...sourceFiles(join(APP, 'app')), ...sourceFiles(join(APP, 'src'))];
  const seen = new Set<string>();
  const shared = new Map<string, string>();
  const problems: string[] = [];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of runtimeImports(file)) {
      if (!specifier.startsWith('.')) {
        // Shared files resolve bare/aliased modules against the unwatched root tree.
        if (!insideApp(file)) problems.push(`${fromRepo(file)} imports "${specifier}"`);
        continue;
      }
      const target = resolveRelative(file, specifier);
      if (!target) {
        if (!insideApp(file)) problems.push(`${fromRepo(file)} imports unresolved "${specifier}"`);
        continue;
      }
      if (!insideApp(target)) {
        if (!shared.has(target)) shared.set(target, fromRepo(file));
        queue.push(target);
      }
    }
  }
  return { shared, problems };
}

const within = (file: string, folder: string) => file === folder || file.startsWith(`${folder}/`);

describe('Metro shared source folders', () => {
  const { shared, problems } = sharedRuntimeGraph();
  const sharedFiles = [...shared.keys()].map(fromRepo);

  it('watches every folder outside apps/mobile that the bundle imports', () => {
    const unwatched = [...shared].filter(([file]) => !SHARED_SOURCE_FOLDERS.some((folder) => within(fromRepo(file), folder)))
      .map(([file, importer]) => `${fromRepo(file)} (imported by ${importer})`);
    expect(unwatched).toEqual([]);
  });

  it('lists no folder the bundle does not use', () => {
    expect(SHARED_SOURCE_FOLDERS.filter((folder) => !sharedFiles.some((file) => within(file, folder)))).toEqual([]);
  });

  it('keeps shared files on relative imports Metro can follow', () => {
    expect(problems).toEqual([]);
  });
});
