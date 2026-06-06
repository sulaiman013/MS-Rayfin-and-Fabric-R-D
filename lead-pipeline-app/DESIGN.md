# DESIGN.md

## Theme
Light. Daytime showroom use, trust, calm. Not dark for "tool cool"; the scene forces light.

## Color (restrained, OKLCH, slate hue 264)
Tokens live in `src/main.css` under `@theme`. Never #000 or #fff; every neutral leans to hue 264.
- surface `oklch(0.985 0.004 264)`, panel `oklch(0.998 0.0015 264)`, rail `oklch(0.966 0.006 264)`
- line `oklch(0.92 0.006 264)`, ink `oklch(0.27 0.02 264)`, muted `oklch(0.52 0.018 264)`, faint `oklch(0.66 0.015 264)`
- accent `oklch(0.55 0.16 264)`, accent-strong (hover), accent-soft (tints)
- Stage colors, low chroma, defined in `HomePage.tsx` STAGE_META: new slate, consult amber (h72),
  quote violet (h295), won green (h150), lost rose (h22). Rendered as 2.5px dots and soft action
  tints only, never as full-saturation fills.

## Typography
Inter (already loaded). Fixed rem scale, no fluid clamps. Labels 11px uppercase + tracking;
body and data 13 to 14px; KPI figures text-2xl semibold. `tabular-nums` on all money and counts.

## Layout
Top bar + main. A compact five-up KPI strip with dividers (deliberately not the big-number,
gradient hero-metric template). Kanban board: 280px stage columns, horizontal scroll. Cards use
a single full border, never side-stripes. "New lead" is a right slide-over, not a centered modal.

## Components
Every interactive element ships default, hover, focus, disabled. Loading is skeleton columns,
not a spinner. Empty state teaches the funnel. One accent primary button, one ghost. Card stage
actions reveal on hover.

## Motion
200ms ease-out. Drawer slides via transform, scrim fades via opacity. No animation of layout
properties, no decorative motion.

## Bans honored
No side-stripe borders, no gradient text, no glassmorphism, no hero-metric gradient cards,
no modal-as-first-thought, no em dashes.
