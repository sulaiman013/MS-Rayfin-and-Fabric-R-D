# Phase 2: Data App (visualization as code) on the Lead Pipeline semantic model

Phase 1 built the operational side: a Rayfin app captures leads into a Fabric SQL
database, the data auto-mirrors to OneLake, a notebook builds a star schema, and a
Direct Lake semantic model serves a Power BI report.

Phase 2 is the other kind of Fabric App: a **data app** (analytical) that reads the same
**semantic model** through the **Execute DAX Queries REST API** and renders a custom,
code-first dashboard. This is "Rayfin on both ends": one app feeds the model, another
app reads it.

## What is verified (Microsoft Learn, June 2026)
- The **data app template** connects to semantic models and uses the **Execute DAX Queries REST API** to query them. Source: https://learn.microsoft.com/fabric/apps/data-apps-template
- **Rayfin CLI is currently the only supported way** to create a data app template app.
- Prerequisites: Fabric Apps workload enabled, the **Dataset Execute Queries REST API** tenant setting enabled (Admin portal > Integration settings), **Build and Read** on the model, and the model on a Fabric or Power BI capacity.
- Preconfigured visual components include: bar (vertical/horizontal, grouped, stacked), line (with markers), area, scatter, pie/donut, heatmap, bubble, waterfall, **single-value KPI cards**, and composite visuals, plus a data grid component.
- Styling is centralized (one style file flows to every component) and format strings are defined once per column.
- Known limitation (temporary): a semantic-model data app **cannot be opened outside the Fabric portal**; the Open button errors the visual queries.
- Project layout: frontend code under `src/`, data models under `rayfin/data/`. Source: https://learn.microsoft.com/fabric/apps/project-structure

## Create the data app
```bash
# bun (per the Tabular Editor blog) or npm both work
bun create @microsoft/rayfin@latest -- "LeadPipelineApp" --template dataapp --workspace "<your workspace name>"
cd LeadPipelineApp
bun run dev          # local preview at http://localhost:5173
bunx rayfin ai-files install   # installs the AI agent skills the template uses
bunx rayfin up       # deploy to Fabric
```
Connect it to the **Lead Pipeline** Direct Lake semantic model from Phase 1 (share its
Power BI link when the template asks).

## How to use this spec pack (important, read this)
The data app template is **AI-assisted by design**: you describe visuals to Copilot and it
generates them. The template's exact internal component and auth APIs are not fully public,
and the recommended path is agent-generated visuals. So this folder is deliberately a
**human-verified spec pack**, not a claim to reproduce the template's private API. The DAX
and the Vega-Lite specs here are correct against the Phase 1 model and reviewed by a human,
which directly addresses the blog's main risk: AI inventing wrong DAX or broken visuals.

Two ways to use it:
1. **Hand it to the template's Copilot** as the source of truth, for example:
   "Build a funnel bar chart. Use the query in `src/visuals/funnel.dax` and the Vega-Lite
   spec in `src/visuals/funnel.vl.json`. Do not invent the DAX."
2. **Wire it yourself** with the portable reference renderer in `src/lib/renderVisual.ts`
   (uses `vega-embed`). Bind the one seam, `runDax`, to the template's authenticated
   Execute Queries client. Install: `bun add vega vega-lite vega-embed`.

## The viz-as-code pattern (per Kurt Buhler's blog + the docs)
Each visual is three reviewable files:
- `*.dax` : the DAX query, with a `{{FILTERS}}` placeholder for cross-filter context.
- `*.vl.json` : a Vega-Lite v5 spec. Its `data.name` is `table`; the renderer feeds rows there.
- registered in `src/visuals/index.ts`, which pairs each `.dax` with its spec.
Plus `src/styles/global.css` for centralized theming.

## Model contract (Phase 1 must expose these)
Measures: `[Total Leads]`, `[Won Leads]`, `[Win Rate]`, `[Won Value]`, `[Leads Reaching Stage]`,
`[Avg Days to Win]`. Columns: `DimStage[StageName]`, `DimStage[StageOrder]`, `DimRep[RepName]`,
`DimDate[YearMonth]`, `DimLeadSource[LeadSourceName]`.

Data contracts (flagged by the Deneb review of these specs, both satisfied by Phase 1):
- `DimDate[YearMonth]` must be ISO `YYYY-MM` so the trend line sorts chronologically. The
  Phase 1 notebook produces exactly that (`date_format(Date, "yyyy-MM")`).
- `[Win Rate]` must be a decimal ratio (0.0 to 1.0), since the axis and tooltip apply a
  percent format that multiplies by 100. It is: the measure is a `DIVIDE` of counts.

## Files
- `src/lib/dax.ts` : replaces `{{FILTERS}}` in a DAX template
- `src/lib/normalize.ts` : turns Execute Queries keys like `DimStage[StageName]` into `StageName`
- `src/lib/renderVisual.ts` : portable Vega-Lite renderer (vega-embed); one `runDax` seam
- `src/visuals/*.dax` + `*.vl.json` : the funnel, trend, win-rate, by-source visuals
- `src/visuals/kpis.dax` : single-row query for the KPI cards (bind to the card component)
- `src/visuals/index.ts` : the visual registry
- `src/styles/global.css` : centralized theme

> Source blog: Kurt Buhler, "Fabric Apps Explained: Visualization as Code in a Data App Dashboard",
> tabulareditor.com, June 3, 2026.
