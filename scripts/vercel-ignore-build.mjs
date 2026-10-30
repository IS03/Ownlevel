#!/usr/bin/env node
// Vercel "Ignored Build Step": exit 0 skips the deployment, any other exit builds it.
// Skips only when every file changed since the last deployment is outside the Web build.
// Anything uncertain (no previous deployment, git error, empty diff) builds.
import { execFileSync } from "node:child_process";

/** Non-code inputs outside Web. Brand tokens and integration specs are Web inputs. */
const OUTSIDE_WEB = [
  /^apps\/mobile\//,
  /^docs\/(?!(?:brand|integrations)\/)/,
  /^bocetos\//,
  /^ios\//,
  /^Logos\//,
  /^supabase\//,
  /^[^/]+\.md$/,
];

function outsideWebBuild(file) {
  // Root TypeScript includes code outside apps/mobile and docs as well.
  if (!file.startsWith("apps/mobile/") && /\.[cm]?[jt]sx?$/i.test(file)) return false;
  return OUTSIDE_WEB.some((pattern) => pattern.test(file));
}

function decide() {
  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
  if (!previous) return { build: true, reason: "no previous deployment to compare with" };
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    git("cat-file", "-e", `${previous}^{commit}`);
    const files = git("diff", "--no-renames", "--name-only", "-z", previous, "HEAD").split("\0").filter(Boolean);
    if (files.length === 0) return { build: true, reason: "no changed files" };
    const web = files.filter((file) => !outsideWebBuild(file));
    return web.length
      ? { build: true, reason: `${web.length} Web file(s) changed, e.g. ${web[0]}` }
      : { build: false, reason: `${files.length} file(s) changed, none in the Web build` };
  } catch {
    return { build: true, reason: "could not compare with the previous deployment" };
  }
}

const decision = decide();
console.log(`[vercel-ignore-build] ${decision.build ? "build" : "skip"}: ${decision.reason}`);
process.exit(decision.build ? 1 : 0);
