# OWNLEVEL — Claude Code

@AGENTS.md

Project rules shared by every agent (Claude Code, Codex) live in AGENTS.md (imported
above, versioned). This file only adds the brand section, kept identical to AGENTS.md.
Do not duplicate other AGENTS.md sections here.

Current milestone plan for UX/UI polish and release: docs/mobile/m9-brand-polish-plan.md.
M9 starts only when explicitly requested.

## Identidad de marca (Brand identity)

<!-- Keep this section identical to AGENTS.md › Identidad de marca. -->

Source of truth for branding, visual identity and copy tone, for BOTH Mobile and Web:

docs/brand/ownlevel-marca/

- IDENTIDAD.md: every decision and its reason.
- LEEME.md: assets and how to wire them.
- tema/tokens.ts: canonical values (colors, type, radius, space, layout, motion, haptics).
- tema/theme.ts, tema/haptics.ts, tema/theme.css: reference adapters. Do not import them
  directly from app code; M9 moves them into the shared brand package (see the M9 plan).

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
- Use the brand type scale, radii (card 20, inner 12, button 14, chip 10, input 12,
  sheet 28, tab bar 26), spacing (4, 8, 12, 16, 20, 24, 32, 40; card padding 18) and
  fixed sizes (button 50, input 48, set row 44, min touch 44).
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
