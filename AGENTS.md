# OWNLEVEL — Agent Instructions

## Product
OWNLEVEL is a personal training/nutrition product.

Web/PWA:
Next.js 16 App Router + React 19 + TypeScript + Tailwind + Supabase + Vercel.

Definitive Mobile:
React Native + Expo + Expo Router.

Canonical data source:
Supabase.

Web/PWA must remain operational while Mobile is built.

## Core architecture

Web/PWA:
Next/Vercel -> Supabase.

Mobile:
Expo iOS/Android
-> Mobile API v1
-> Vercel
-> Supabase Auth/Postgres/RLS.

Mobile must NOT query product tables directly.

Preserve:
- Bearer-token-derived identity.
- Never trust arbitrary userId from Mobile.
- No service_role in client paths.
- Ownership/RLS.
- missing != zero.
- empty != unavailable.
- No blind retry of sensitive writes.
- Idempotency where ambiguous results are possible.
- CAS/versioning where lost updates are possible.
- Historical snapshots/truth must remain stable.

Backend rollout:
EXPAND -> ADOPT -> OBSERVE -> CONTRACT.

## Product parity

Use product parity, not code parity.

Mobile must preserve Web:
- capabilities;
- information;
- semantics;
- states;
- business invariants.

Do NOT copy Web HTML/CSS/markup mechanically.

Use native Mobile patterns where appropriate.

## Identidad de marca (Brand identity)

Source of truth for branding, visual identity and copy tone, for BOTH Mobile and Web:

docs/brand/ownlevel-marca/

- IDENTIDAD.md: every decision and its reason.
- LEEME.md: assets and how to wire them.
- tema/tokens.ts: canonical values (colors, type, radius, space, layout, motion, haptics).
- tema/theme.ts, tema/haptics.ts, tema/theme.css: reference adapters only.

App code never imports from docs/ and never copies hex values or sizes. The values reach
code through packages/brand (a re-export of tema/tokens.ts):
- Mobile: `@/design-system` (`brandTokens`, `typography`, `spacing`, `radius`, `AppText`
  variants), built on apps/mobile/src/design-system/brand.ts → packages/brand.
- Web: not migrated yet (M9.4). docs/design/* describes the legacy Web (violet accent,
  Tailwind sizes) and is NOT a reference for new UI on either platform.

Before creating or modifying UI: read the relevant parts of IDENTIDAD.md and tokens.ts.
Do not copy IDENTIDAD.md into code comments or other docs; link to it.
If the identity conflicts with product invariants or the current implementation:
report it, do not bend either side silently.

Permanent rules (summary; IDENTIDAD.md wins on detail):
- One accent only: champagne (dark #C9B68A; light #705F36 for text/icons).
  Reserved for what matters: primary action, active set, record.
- No red/green "good/bad" on the user's personal data (weight, intake, volume, trends).
  Ups/downs use an arrow, not a color.
- Semantic colors only for real system state: `error` = system failures (sync, payment)
  and destructive actions. Never to judge the user.
- Glass only on controls: tab bar, floating buttons, top bar on scroll, controls over
  photos/charts, floating timer. Never on cards, rows, lists, inputs or the hero.
- Relevant numbers always with tabular figures (`fontVariant: ['tabular-nums']` /
  `tabular-nums`).
- System font: SF Pro on iOS (no fontFamily, no bundled font files), Roboto on Android,
  system stack on Web. Hanken Grotesk only inside the logo artwork.
- Type scale (iOS text styles, pt / weight): Large Title 34/700, Title 1 28/700,
  Title 2 22/700, Headline 17/600, Body 17/400, Subheadline 15/400, Footnote 13/400,
  Caption 12/500. On Mobile use the `AppText`/`Heading` variants (or
  `brandTokens.typeScale`), never a raw `fontSize`.
- Dynamic Type: never disable font scaling. With large text (fontScale > 1.3), stack
  label/value pairs and wrap instead of truncating or squeezing text.
- Radii (card 20, inner 12, button 14, chip 10, input 12, sheet 28, tab bar 26), spacing
  (4, 8, 12, 16, 20, 24, 32, 40; card padding 18) and fixed sizes (button 50, input 48,
  set row 44, min touch 44).
- Icons: SF Symbols on iOS; on Android/Web per IDENTIDAD.md (Lucide, stroke 2).
  Sizes 24 tab bar / 20 rows and buttons / 17 next to body text. Muted at rest, accent
  when active. No emojis as UI.
- Copy tone: gym buddy. Warm, Argentine voseo, short, direct. No guilt, no pressure,
  no moralizing food, weight or training. Exact numbers in on-screen format
  (111,5 kg). Exclamations only for real achievements, never in errors or notices.
- Empty states: useful and neutral; example data only greyed with the visible EJEMPLO
  label, never in accent color, never numbers that look like the user's.
- Charts faithful to the data: single series = champagne + previous period in grey;
  max 4 series, direct labels; 5-step intensity scale for calendars.
- Data truth is never faked visually: 0, missing, unavailable and negative values stay
  distinct (missing != zero, empty != unavailable). No interpolated gaps, no fake bars.
- Motion and haptics follow the identity (200/300 ms, soft spring, press 95 %, Reduce
  Motion = fades; haptics per event, user-switchable). Never decorative.
- Light and dark exactly as defined by the brand palettes.

## Repository layout

Root:
Web/PWA and backend.

apps/mobile/:
Expo/RN definitive Mobile app.

docs/brand/ownlevel-marca/:
canonical brand package (identity, assets, reference theme files).
Reference material only: excluded from the root TypeScript build and ESLint.

apps/mobile/ios:
Expo generated iOS project.

root ios/:
legacy Capacitor project.

mobile/:
legacy Capacitor client.

Do not confuse Expo and Capacitor iOS projects.
Do not delete legacy Capacitor yet.

Root and apps/mobile have separate package-lock/dependency trees.
Do not assume workspaces.

## Mobile validation

From apps/mobile:

npm run typecheck
npm run lint
npm run test
npm run config:check

Full Mobile validation:

npm run validate

## Development workflow

Before branch-changing or risky Git work:

git status -sb

If there are local changes:
inspect them first.

Never auto-stash.

Do not use git add -A when unexpected files exist.
Prefer selective staging.

During visual/functional QA:
DO NOT commit, push, or create a PR unless explicitly requested.

Expected flow:
scope
-> inspect only relevant sources
-> implement
-> Fast Refresh / Simulator / iPhone QA
-> small polish if needed
-> validations
-> commit
-> push
-> PR
-> merge.

The user performs visual/functional QA on Simulator/iPhone.

## Scope discipline

Do not perform broad repo audits unless explicitly requested.

Follow only directly relevant imports/files.

Do not add unrelated features or cleanup.

Do not silently enlarge a milestone.

If backend capability is missing:
report BLOCKED and propose an EXPAND step.
Do not invent a Mobile workaround that weakens architecture.

## Current roadmap

M0 Foundation audit: CLOSED
M1 Foundation/Auth/API: CLOSED
M2 Native Home: CLOSED
M3 Training: CLOSED
M4 Nutrition: CLOSED
M5 Body + Daily Metrics: CLOSED
M6 History & Calendar: CLOSED
M7 Progress: CLOSED
M8 Settings: CLOSED (PRs #171, #172; security hotfix #173)
M9 UX/UI Polish + Release: IN PROGRESS.
- M9.1 (brand package, Mobile theme, assets, icons, haptics) and M9.2 (primitives): DONE.
- M9.3 (screen by screen redesign, with sketches in bocetos/): IN PROGRESS.
  Working list of what is done and pending: bocetos/PENDIENTES.md.
- M9.4 (Web on the brand) and M9.5 (production, accessibility, store gates): PENDING.
Plan: docs/mobile/m9-brand-polish-plan.md.

M3.1 Landing + Routines + Exercise Library: CLOSED
M3.2 Routine Editor + Start Flow: CLOSED
M3.3 Active Session: CLOSED (PR #152)
M3.4 Finish + Corrections + History: CLOSED (PRs #152 backend, #153 finish, #154 history/corrections)

Do not reopen closed milestone scope unless explicitly requested.
M9 polish must not change data semantics, analytics or write paths. A new capability
(as stages, metric icons/order or account deletion were) goes through its own EXPAND
step and PR, never hidden inside a visual change.

## Training (M3) closed state

Mobile Training covers, with verified Web parity:
- landing, routines, routine editor, exercise library, start flow;
- active session (drafts, autosave, CAS/conflicts, rest timer, structural mutations, quick history);
- finish with summary, post-workout, read-only completed session;
- history (sessions, recorded exercises, exercise history), calendar, day;
- historical correction and logical discard.

Known deferred product note:
discarding a completed session does not revert routine reminders/targets applied at finish (same as Web).
Restoring them from session snapshots is a possible future improvement, not part of M3.

## Security/reliability

Prioritize:
- RLS/ownership;
- token-derived identity;
- explicit mutation conflicts;
- no false empty state;
- no false "no active session";
- server truth on conflict;
- observability without private payload leakage.

Do not weaken existing concurrency/idempotency semantics to simplify Mobile.

## Model/work efficiency

Avoid repeated broad analysis.

For simple tasks, inspect only what is necessary.

Do not create artificial PR splits.

Split work only for real reasons such as:
- rollout;
- migrations;
- concurrency;
- security;
- meaningful QA boundary.

## Documentation

Notion contains:
- Product Roadmap;
- Mobile milestone pages;
- Implementation History.

Do not update Notion automatically.
Update documentation only when explicitly requested or at milestone close.

## User interaction

Explain scope and risks before substantial implementation when needed.

For implementation work:
make concrete changes rather than producing a huge speculative plan.

For analysis-only tasks:
do not edit files.

Never commit/push/create PR unless explicitly requested.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
