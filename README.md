# Rayfin + Microsoft Fabric: Lead-to-Install Pipeline (R&D POC)

> A hands-on proof of concept for the **translytical** pattern announced at Microsoft Build 2026:
> one operational app and one analytics report sharing a single dataset on Microsoft Fabric,
> with no ETL pipeline in between.

![Stage](https://img.shields.io/badge/Fabric%20Apps-Preview-orange)
![Analytics](https://img.shields.io/badge/Analytics%20half-Built%20%26%20validated-brightgreen)
![App](https://img.shields.io/badge/Rayfin%20deploy-Paused%20(region)-yellow)
![Built with](https://img.shields.io/badge/Built-CLI%20only%20(fab%20%2B%20pbir)-blue)

Domain: a custom-closets business (lead, design consult, quote, won, installed). The model is
generic to any sales funnel, so it reads cleanly as a portfolio piece for analytics and data
engineering roles.

---

## TL;DR

- **Goal:** prove that a Fabric app can capture operational data and a Power BI report can serve
  analytics on the **same rows**, with the app-to-analytics bridge handled automatically by Fabric.
- **Built and validated:** the entire analytics half (Fabric SQL database, a 6-table star schema in
  a OneLake Lakehouse, a Direct Lake semantic model with 7 measures, and an 8-visual Power BI report),
  constructed **entirely from the command line** with the `fab` CLI and the `pbir` CLI. DAX query
  results check out: 50 leads, 66.7% win rate, $152,910 won.
- **Paused, by design:** the Rayfin operational front-door. Not a bug, a **region limitation**. The
  trial capacity is in **East US**, and Microsoft's own docs confirm Fabric Apps is not available
  in East US yet (details below).
- **What is in this repo:** the working build artifacts (generators, parquet, TMDL semantic model,
  PBIR report), plus the Rayfin entity definitions and a second "data app" visualization-as-code spec pack.

---

## The idea: one dataset, two jobs (the translytical loop)

The value of Rayfin + Fabric is that the **same data** the app writes becomes analytics-ready with no
copy job. Four stages plus an optional write-back:

```
  [1] OPERATIONAL (write)     [2] MIRROR (automatic)     [3] ANALYTICS (read)      [4] DELIVERABLE
   Rayfin app                   Fabric mirrors the          Star schema +            Power BI report
   reps create leads,   ─────▶  SQL database into   ─────▶  Direct Lake      ─────▶  funnel, win rate,
   advance stages,              OneLake as Delta            semantic model           pipeline value,
   log quotes                   (no ETL, no copy)           (the modeling)           time in stage
        │                                                                                  │
        └────────────────  optional write-back (translytical task)  ◀──────────────────────┘
```

- **Stage 1 (Rayfin):** the operational front-door. Reps create and move leads. OLTP source of truth.
  The app provisions a **SQL database in Fabric** from TypeScript entity decorators.
- **Stage 2 (the bridge):** a SQL database in Fabric **auto-mirrors into OneLake as Delta parquet,
  always on, with no configuration and no ETL**, and exposes a read-only SQL analytics endpoint that a
  Direct Lake model can sit on. This is the documented translytical mechanism, not an assumption.
  ([mirroring overview](https://learn.microsoft.com/fabric/database/sql/mirroring-overview))
- **Stage 3:** model the mirrored tables into a star schema and a Direct Lake semantic model.
- **Stage 4:** a Power BI report reads the semantic model over Direct Lake.

---

## Current status

| Stage | Component | Status |
| --- | --- | --- |
| 1 | Rayfin operational app (UI + backend) | UI built and polished. Deploy **paused** by region gate. |
| 2 | SQL database to OneLake auto-mirror | Pending Stage 1. |
| 3 | Lakehouse star schema (6 tables, OneLake Delta) | **Built** on a Trial FT1 capacity. |
| 4 | Direct Lake semantic model (7 measures, 6 relationships) | **Built and DAX-validated.** |
| 5 | Power BI report (8 visuals) | **Built and published.** |

So Fabric SQL database, Lakehouse, Direct Lake, and Power BI all work end to end on a free trial
capacity. Only the Rayfin / Fabric Apps front-door is waiting on a region.

### Validated results (DAX over the published Direct Lake model)

| Measure | Value |
| --- | --- |
| Total Leads | 50 |
| Win Rate | 66.7% |
| Won Value | $152,910 |
| Open Pipeline Value | $155,850 |

---

## The region finding (why the front-door is paused)

The Rayfin deploy (`npx rayfin up`) returns `403 Forbidden: The feature is not available`. This is
**not** a trial-vs-paid limitation. It is a **regional rollout gap**, and it is documented.

Microsoft's [Fabric region availability](https://learn.microsoft.com/en-us/fabric/admin/region-availability)
page (refreshed 2026-06-03) marks **East US** with footnote 8, which reads verbatim:
*"Fabric App isn't available in these regions."* The trial capacity here is in East US, so the gate
applies. There is **no published date** for when East US gets Fabric Apps.

| Fabric Apps available (no footnote 8) | Fabric Apps not yet available (footnote 8) |
| --- | --- |
| Central US, North Central US, West US, West US 2 | East US, East US 2, South Central US, West US 3 |
| France Central, West Europe, Norway East, Switzerland North | UK South/West, Germany West Central, North Europe |
| **UAE North**, South Africa North | Canada Central/East, Brazil South, Mexico Central |
| **Southeast Asia**, **Central India**, East Asia, Korea Central, Australia East | **Malaysia West**, South India, Japan East/West, Taiwan, New Zealand North |

**Two ways forward:** either spin up a fresh trial in a supported region (Southeast Asia or Central
India are good picks) to run Stage 1 today, or keep the analytics half in East US and watch the
footnote-8 marker drop from the East US row. East US is fine for everything except Fabric Apps.

---

## What was actually built, and how

The headline of this POC is the **delivery method**: the entire analytics half was provisioned without
clicking through the Fabric portal. It was generated as code and pushed with CLIs.

- **`fabric_build/gen_star_schema.mjs`** generates the star schema as CSVs (4 reps, 5 lead sources,
  5 stages, 181 date rows, 50 leads, 160 stage events).
- **`fabric_build/to_parquet.py`** converts those CSVs to **typed parquet** with pyarrow (int64 /
  string / double). This matters: `fab table load` has no schema inference, so loading parquet is the
  only way to preserve numeric types for DAX.
- **`fab` CLI** creates the workspace items (SQL database, Lakehouse), loads the parquet into OneLake
  Delta tables, and refreshes the Lakehouse SQL analytics endpoint metadata.
- **`fabric_build/gen_model.py`** emits a complete **Direct Lake semantic model in TMDL** (tables,
  columns, 7 measures, 6 relationships, a `mode: directLake` partition per table). The model points at
  the gold Lakehouse SQL analytics endpoint. `fab import` deploys it.
- **`pbir` CLI** builds the **PBIR report** (in `report/`) and binds it to the published model.

The result is fully reproducible from scripts, which is the point of an R&D kit.

---

## Repository layout

| Path | What it is | State |
| --- | --- | --- |
| `fabric_build/gen_star_schema.mjs` | Star-schema seed generator (CSV) | Working |
| `fabric_build/to_parquet.py` | CSV to typed parquet (pyarrow) | Working |
| `fabric_build/gen_model.py` | Generates the Direct Lake TMDL semantic model | Working |
| `fabric_build/seed/`, `fabric_build/parquet/` | Generated sample data | Sample stand-in |
| `fabric_build/LeadPipelineModel.SemanticModel/` | The generated TMDL model definition | Deployed |
| `report/LeadPipeline.pbip` + `report/LeadPipeline.Report/` | PBIR report (8 visuals) | Deployed |
| `rayfin/data/` | Rayfin TypeScript entities (Rep, LeadSource, Lead, StageEvent, Quote) + schema | For Stage 1 |
| `fabric/build_gold_star_schema.py` | PySpark version of the star build (for the real mirror) | Reference |
| `fabric/dax_measures.dax` | Full measure library (volume, value, conversion, funnel, quotes, time) | Reference |
| `powerbi/report-layout.md` | Page-by-page report layout spec | Reference |
| `dataapp/` | Phase 2: a data app (visualization-as-code) reading the model over the DAX REST API | Spec pack |
| `seed/seed_sample_data.sql` | T-SQL sample data for the no-Rayfin path | Optional |

Tenant-specific values (workspace endpoint, SQL analytics endpoint GUID) are **not** committed. The
generators read them from `FABRIC_SQL_SERVER` and `FABRIC_SQL_ENDPOINT` environment variables.

---

## Reproduce it

### Track A: the full loop (a region that supports Fabric Apps)

> Prerequisites: Node 20, 22, or 24; Docker for the local stack; pin the beta CLI
> (`@microsoft/rayfin-cli`). See [RAYFIN_NOTES.md](RAYFIN_NOTES.md) for the full command and decorator reference.

1. Start a Fabric trial (or use a capacity) in a **supported region** (for example Southeast Asia).
2. `npm create @microsoft/rayfin@latest lead-pipeline --workspace "<your workspace>"`, copy the files
   from `rayfin/data/` into the project, then `npx rayfin up`. This provisions the SQL database,
   GraphQL API, auth, and hosting.
3. Confirm the **auto-mirror**: open the SQL database item, switch to its SQL analytics endpoint, and
   the entity tables appear as read-only Delta with zero setup. That is the translytical bridge.
4. Build the gold star schema over the mirrored tables with `fabric/build_gold_star_schema.py`,
   create the Direct Lake model, add `fabric/dax_measures.dax`, and lay out the report per
   `powerbi/report-layout.md`.

### Track B: analytics only (any Fabric capacity, no Fabric Apps)

This is the half already built here, and it runs on a **free trial in any region**:

```bash
# 1. Generate the star schema and type it as parquet
node fabric_build/gen_star_schema.mjs
python fabric_build/to_parquet.py

# 2. Point the model generator at your gold Lakehouse SQL analytics endpoint
set FABRIC_SQL_SERVER=<your-workspace>.datawarehouse.fabric.microsoft.com
set FABRIC_SQL_ENDPOINT=<sql-analytics-endpoint-guid>
python fabric_build/gen_model.py

# 3. Use the fab CLI to create the Lakehouse, load the parquet, refresh the SQL endpoint,
#    and import the semantic model; then bind report/ with the pbir CLI.
```

---

## Engineering notes (gotchas worth knowing)

These cost real time to find, so they are documented for the next person:

1. **`fab table load` has no schema inference.** Load **parquet**, not CSV, or every numeric column
   lands as text and the DAX breaks.
2. **The Lakehouse SQL analytics endpoint must be metadata-refreshed** after a table load
   (`POST .../sqlEndpoints/{id}/refreshMetadata`) before Direct Lake can see `dbo.<table>`.
3. **Direct Lake TMDL import:** do **not** put `ref table` lines in `model.tmdl`. The `tables/` folder
   auto-loads, and an explicit ref throws `Unexpected line type: ReferenceObject`.
4. **`pbir` can be poisoned by stdout noise.** The `fab` CLI printed a `fabric-cicd` update notice to
   stdout that `pbir` captured into the model connection string, corrupting the bind. Fix:
   `pip install --upgrade fabric-cicd` (>= 1.1.0, which removes the version check).
5. **`fab cp`** uploads local files to OneLake Files but cannot auto-create nested folders.

---

## Rayfin / Fabric Apps reference

The full verified reference (decorators, CLI, data API, auth policies, the data app template, and the
translytical mechanism with citations) lives in [RAYFIN_NOTES.md](RAYFIN_NOTES.md). Two things worth
calling out here:

- **The entities are idiomatic and compile.** `rayfin/data/` models relationships with `@one`/`@many`
  (each `@one` generates a `<prop>_id` FK), uses `@email`/`@decimal`/`@set`/`@boolean`, and is RLS-ready
  (a commented `@role` policy shows how to scope each rep to their own leads). They type-check against
  `@microsoft/rayfin-core` 1.33.1. Note: relationship targets must be value imports, not `import type`,
  since `@one(() => Rep)` uses the class at runtime.
- **The data app reads an existing model, it does not build one.** The Phase 2 `dataapp/` connects to
  the semantic model through the Execute DAX Queries REST API (needs the "Dataset Execute Queries REST
  API" tenant setting plus Build and Read on the model, and the model on a capacity), and cannot be
  opened outside the Fabric portal yet. So the star-schema plus Direct Lake build here is the bridge
  between the operational app and the analytics app, not redundant work.

---

## Roadmap

- [ ] Deploy Stage 1 (Rayfin app) in a supported region, or wait for Fabric Apps to reach East US.
- [ ] Repoint the semantic model from the sample Lakehouse tables to the **mirrored operational tables**
      once Stage 1 is live, so the same report runs on real app activity.
- [ ] Add a `Consultation` entity for no-show analysis and an `Install` phase to extend into a Job Tracker.
- [ ] Add role-based row security so each rep sees only their own leads.

---

## A note on the sample data

The rows in `fabric_build/seed/` and `parquet/` are a **stand-in**. Because Stage 1 is region-blocked,
they were generated and loaded directly into the Lakehouse to prove that Stages 3 to 5 work. Think of
them as a crash-test dummy: they prove the model and report drive correctly. When the Rayfin app
deploys in a supported region, real rows flow through the auto-mirror and the synthetic seed is retired.

---

## References

- [Verified Rayfin / Fabric Apps notes](RAYFIN_NOTES.md) in this repo (decorators, CLI, data API, auth, data app, translytical loop)
- [What is Fabric Apps (Preview)?](https://learn.microsoft.com/en-us/fabric/apps/overview)
- [Fabric Apps data models](https://learn.microsoft.com/fabric/apps/data-models) and [CLI reference](https://learn.microsoft.com/fabric/apps/cli-reference)
- [Data app template](https://learn.microsoft.com/fabric/apps/data-apps-template)
- [SQL database mirroring (auto-mirror to OneLake)](https://learn.microsoft.com/fabric/database/sql/mirroring-overview)
- [Fabric region availability](https://learn.microsoft.com/en-us/fabric/admin/region-availability) (East US footnote 8)
- [Introducing Rayfin (Fabric Updates Blog)](https://community.fabric.microsoft.com/t5/Fabric-Updates-Blog/Introducing-Rayfin-A-new-AI-first-way-to-build-deploy-and-govern/ba-p/5191676)

> Verified against Microsoft Learn in June 2026. Fabric Apps / Rayfin is in PREVIEW, so confirm exact
> CLI and decorator syntax in the official docs before any production build.
