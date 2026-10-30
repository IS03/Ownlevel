import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/vercel-ignore-build.mjs");

/** A repo with one commit (the "previous deployment"), then `files` changed in a second commit. */
function decide(files: string[], env: Record<string, string | undefined> = {}, rename?: [string, string]) {
  const repo = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
  const seed = rename?.[0] ?? "seed.txt";
  mkdirSync(dirname(join(repo, seed)), { recursive: true });
  writeFileSync(join(repo, seed), "seed"); git("add", "."); git("commit", "-qm", "base");
  const previous = git("rev-parse", "HEAD");
  for (const file of files) { mkdirSync(dirname(join(repo, file)), { recursive: true }); writeFileSync(join(repo, file), file); }
  if (rename) { mkdirSync(dirname(join(repo, rename[1])), { recursive: true }); git("mv", rename[0], rename[1]); }
  if (files.length || rename) { git("add", "."); git("commit", "-qm", "change"); }
  const run = spawnSync(process.execPath, [SCRIPT], { cwd: repo, encoding: "utf8", env: { PATH: process.env.PATH, VERCEL_GIT_PREVIOUS_SHA: previous, ...env } as unknown as NodeJS.ProcessEnv });
  return { status: run.status, log: run.stdout };
}
const SKIP = 0, BUILD = 1;

describe("Vercel ignored build step: skip only changes outside the Web build", () => {
  it.each([
    [["apps/mobile/src/training/history-screen.tsx"]],
    [["apps/mobile/package-lock.json", "apps/mobile/app.json"]],
    [["docs/mobile/rollout.md"]],
    [["bocetos/inicio/01.png"]],
    [["ios/App/App/Info.plist"]],
    [["Logos/isotipo.svg"]],
    [["supabase/migrations/20261030_x.sql"]],
    [["AGENTS.md", "README.md"]],
    [["apps/mobile/src/a.ts", "docs/notes.md", "bocetos/b.png"]],
  ])("skips %j", (files) => {
    expect(decide(files).status).toBe(SKIP);
  });
  it.each([
    [["src/app/page.tsx"]],
    [["public/brand/icon-192.png"]],
    [["docs/brand/ownlevel-marca/tema/tokens.ts"]], // src imports it through packages/brand
    [["packages/brand/src/tokens.ts"]],
    [["docs/integrations/ownlevel-chatgpt-action.openapi.yaml"]],
    [["ios/typechecked.ts"]],
    [["supabase/functions/helper.ts"]],
    [["Logos/component.tsx"]],
    [["bocetos/example.mts"]],
    [["mobile/src/app.ts"]], // the legacy client is type-checked by next build
    [["scripts/testing/x.ts"]],
    [["package.json"]], [["package-lock.json"]], [["next.config.ts"]], [["tsconfig.json"]], [["vercel.json"]],
    [["apps/mobile/src/a.ts", "src/lib/b.ts"]],
    [["docs/AGENTS-notes/x.md", "src/lib/b.ts"]],
  ])("builds %j", (files) => {
    expect(decide(files).status).toBe(BUILD);
  });
  it("builds when it cannot compare: no previous deployment, unknown commit, or nothing changed", () => {
    expect(decide(["apps/mobile/a.ts"], { VERCEL_GIT_PREVIOUS_SHA: undefined }).status).toBe(BUILD);
    expect(decide(["apps/mobile/a.ts"], { VERCEL_GIT_PREVIOUS_SHA: "0123456789abcdef0123456789abcdef01234567" }).status).toBe(BUILD);
    expect(decide([]).status).toBe(BUILD);
  });
  it("builds when a Web file is renamed into a Mobile-only directory", () => {
    expect(decide([], {}, ["src/runtime.ts", "apps/mobile/runtime.ts"]).status).toBe(BUILD);
  });
  it("logs the decision", () => {
    expect(decide(["apps/mobile/a.ts"]).log).toMatch(/\[vercel-ignore-build\] skip: 1 file\(s\) changed, none in the Web build/);
    expect(decide(["src/a.ts"]).log).toMatch(/\[vercel-ignore-build\] build: 1 Web file\(s\) changed, e\.g\. src\/a\.ts/);
  });
});
