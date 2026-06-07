# Rayfin + Microsoft Fabric: a translytical lead-to-install pipeline

<p align="center">
  <img src="assets/pipeline-demo.gif" alt="50-second animated walkthrough of the translytical pipeline app on Microsoft Fabric" width="100%" />
</p>

> One Microsoft Fabric app that does **both** jobs: reps work leads on an operational kanban
> **Board**, and a manager reads a governed analytics **Dashboard**, on the **same data**, in the
> **same app**, with no ETL pipeline in between. This is the **translytical** pattern, built end to
> end and deployed.

![Stack](https://img.shields.io/badge/Fabric-Lakehouse%20%2B%20Warehouse%20%2B%20Direct%20Lake-orange)
![App](https://img.shields.io/badge/Rayfin%20Fabric%20App-Deployed%20(F2%2C%20Central%20US)-brightgreen)
![Frontend](https://img.shields.io/badge/React%2019%20%2B%20Vite%20%2B%20Tailwind%20v4-blue)
![Tests](https://img.shields.io/badge/Playwright%20E2E-10%2F10-brightgreen)

Domain: a custom-closets business (lead → consult → quote → won / lost). The model is generic to any
sales funnel, so it reads cleanly as a portfolio piece for analytics-engineering and data-engineering
roles.

---

## TL;DR

- **What it is:** a single Fabric App (`lead-pipeline-app/`) where the **Board** captures operational
  activity (add a lead, advance a stage) and the **Dashboard** serves governed analytics, drill-through,
  and a live writeback loop, over the same pipeline.
- **The data engineering:** a deliberately **messy** historical CSV (~430 rows) is run through a real
  **medallion** in Fabric (bronze raw → silver clean/conform/dedup → gold star schema), surfaced by a
  **Direct Lake semantic model** with governed measures. 430 messy rows become **401 trusted** records.
- **The hard problem we solved:** a Fabric App is embedded in an iframe, so a browser sign-in to Power
  BI (MSAL) cannot complete, which means the dashboard could never get a token to query the model
  live. The fix is **app-owns-data via materialization**: a server-side refresh reads the model's
  governed measures and writes lead-level facts into tables the app reads through its **own data API**
  (the same one the Board uses). No per-user Power BI popup, embedded or standalone.
- **The live loop:** new leads added on the Board are read **straight from the operational table** and
  unioned with the materialized historical baseline, so the Dashboard shows them on the next refresh,
  instantly, no script and no sign-in.
- **Status:** deployed and running on a paid **F2 capacity in Central US** (a Fabric-Apps-supported
  region). Validated with a **Playwright E2E suite, 10/10**.

---

## The translytical idea: one dataset, two jobs

```
  OPERATIONAL (write)            ANALYTICS (read)
  Board: reps add / advance      Dashboard: KPIs, funnel, trend,
  leads, record stage events     by-rep / by-source, drill-through
        │                                   ▲
        ▼                                   │
  app SQL database  ──auto-mirror──▶ OneLake │  governed measures
  (operational)        (no ETL)              │  (Direct Lake model)
        │                                   │
        └── medallion: bronze → silver → gold star schema ──┘
                       (cleans 430 messy rows → 401 trusted)
```

Reps write on the Board; the same rows power the manager's Dashboard. Operational write, analytical
read, **one app, no ETL between them**. The messy-to-clean medallion is the trust story: one governed
measure, not three different spreadsheet answers.

---

## Architecture: how the Dashboard gets trustworthy numbers without a browser sign-in

A Fabric App runs **embedded in the Fabric portal iframe**. Microsoft's login page refuses to load in
that iframe (third-party cookies blocked), so a browser MSAL flow to Power BI can never complete, the
dashboard can't obtain a token, and a live Execute-DAX call is impossible. Rather than fight that, the
app uses **app-owns-data through materialization**:

1. A **server-side refresh** (`fabric_build/metrics_refresh.py`) rebuilds gold (historical + the live
   writeback), then reads the **model's governed measures** via Execute DAX and writes:
   - the **lead-level facts** into a `MetricLead` table (historical baseline), and
   - per-metric aggregates into `MetricKpi` / `MetricFunnel` / `MetricTrend` / `MetricRep` /
     `MetricSource` (a governed reference).
2. The **Dashboard reads those tables through the app's own Rayfin data API**, the same authenticated
   API the Board uses. So it just loads, embedded or standalone, with **no Power BI popup**.
3. **Live leads** are read **directly from the operational `Lead` table** the Board writes to, and
   unioned client-side with the historical baseline. A lead saved on the Board shows up on the next
   dashboard read, **instantly**.

The dashboard computes every KPI and chart **client-side from the lead-level set**, which is what makes
the slicers, click-to-cross-filter, and drill-through interactive without re-querying the server.

---

## The data engineering (medallion, `fabric_build/`)

| Layer | What happens | Result |
| --- | --- | --- |
| **Source** | `gen_historical_csv.mjs` emits a deliberately dirty export: duplicate leads, four date formats (incl. Excel serials), currency-as-text (`"$12,000"`, `"n/a"`), rep/source/stage label variants, missing values, shifted-column rows. | ~430 rows |
| **Bronze** | `to_parquet_bronze.py` lands the mess verbatim as an **all-string** Delta table in a Lakehouse (no schema inference, the dirt survives). | `bronze_historical_leads` |
| **Silver** | `sql/10_silver.sql` parses every date format, strips currency to decimals, conforms members via mapping tables, dedups on a normalized-name key, and **quarantines** unparseable / shifted rows. | 430 → **401 clean**, 5 quarantined |
| **Gold** | `sql/20_gold.sql` + `sql/30_sp_build_gold.sql` build a CTAS star schema (`DimStage`, `DimRep`, `DimLeadSource`, `DimDate`, `FactLead`, `FactStageEvent`), where gold = **cleaned historical UNION the live app writeback**. | star schema |
| **Model** | `gen_model_dw.py` generates a **Direct Lake** semantic model (TMDL, in `fabric_build/LeadPipelineSales.SemanticModel/`) over the gold Warehouse, with governed measures. | governed model |

Governed measures: Total / Won / Lost / Open Leads, **Win Rate** (`DIVIDE(Won, Won + Lost)`, defined
once), Pipeline Value, Won Value, Avg Deal Size, **Leads Reaching Stage**, Avg Days in Stage, and
**Stalled Leads** (open and idle > 14 days).

Validated through the model (Execute DAX): **401 historical leads, 53.6% win rate, $221,550 open
pipeline, ~$1.58M won, 22 stalled**, with the live writeback raising the totals from there.

---

## The app (`lead-pipeline-app/`, React 19 + Vite 7 + Tailwind v4)

A Rayfin Fabric App: a static frontend plus an auto-generated data API over a Fabric SQL database. Three
pages share one bento design system (light, emerald + indigo).

- **Board** (`/`): kanban writeback. Adding / advancing / losing a lead writes to the operational
  database and records a `StageEvent`. Includes a KPI strip and a **"Pipeline at a glance"** snapshot
  (distribution by stage / source / rep, with tooltips) that fills the board's empty space.
- **Dashboard** (`/dashboard`): big rounded KPI cards (one dark feature card), **funnel / trend /
  win-rate-by-rep / by-source** charts (Vega-Lite), a dark **"Needs follow-up"** card listing the most
  stalled leads, **slicers** (rep / source / stage / showroom / date range), **click any chart to
  cross-filter** with highlight, and a **Lead details** table with search, sortable columns,
  pagination, and **CSV export**.
- **Drill-through** (`/dashboard/drill/:dim/:value`): **right-click any chart element** (stage, rep,
  source, or month) to open a dedicated page for that slice, with its own KPIs, breakdowns, and table,
  the way Power BI drill-through works.
- **Guide** (`/guide`): a non-technical, user-facing walkthrough of both views.

The funnel, its tooltip, the click-filter, and the drill all use a single **current-stage** definition,
so every number agrees (no reaching-vs-current mismatch).

---

## Repository layout

| Path | What it is |
| --- | --- |
| `lead-pipeline-app/` | The Rayfin Fabric App (Board + Dashboard + Guide). React 19, Vite, Tailwind v4, Vega-Lite. |
| `lead-pipeline-app/rayfin/data/` | Rayfin entity definitions: `Lead`, `Rep`, `LeadSource`, `StageEvent`, `Quote`, and the materialized `Metric*` tables. |
| `lead-pipeline-app/src/dashboard/` | The dashboard: `leadData.ts` (data + client-side aggregation), `renderVisual.ts` (Vega-Lite), `visuals/` (specs). |
| `lead-pipeline-app/e2e/` | Playwright E2E UAT suite (`uat.spec.ts`, 10 tests). |
| `fabric_build/gen_historical_csv.mjs` | Messy historical CSV generator (deterministic seed, prints ground-truth aggregates). |
| `fabric_build/to_parquet_bronze.py` | CSV → all-string parquet for bronze. |
| `fabric_build/sql/` | T-SQL: `10_silver.sql`, `20_gold.sql`, `30_sp_build_gold.sql` (historical + live union). |
| `fabric_build/gen_model_dw.py` | Generates the Direct Lake TMDL model over the gold Warehouse. |
| `fabric_build/metrics_refresh.py` | The server-side refresh: rebuild gold → Execute DAX → materialize `Metric*` tables. |
| `fabric_build/wh.py`, `run_sql.py` | Warehouse connection helper (token-injected pyodbc) and SQL runner. |
| `fabric_build/app_seed*.py` | Seed reps / sources / a busy set of operational leads into the app database. |
| `fabric_build/LeadPipelineSales.SemanticModel/` | The generated TMDL semantic model. |
| `dataapp/`, `seed/` | Earlier R&D: viz-as-code spec pack, sample SQL. |

Tenant-specific values (workspace / SQL endpoint GUIDs) and all `.env*` files are **gitignored**. No
secrets are committed; the scripts read credentials from environment variables.

---

## The live writeback loop (the demo)

1. On the **Board**, add a lead (customer, rep, source, value). It writes to the operational database.
2. Open the **Dashboard** and click **Refresh**.
3. It appears **instantly**: total +1, open pipeline +its value, the lead searchable in the details
   table, and visible when you slice by its rep / source or drill into its stage.

Historical analytics are governed and pre-computed; new pipeline activity is live from the operational
store; both render in the same app. (For a fuller refresh that also re-materializes the governed
historical baseline from the model, run `python fabric_build/metrics_refresh.py`.)

---

## Reproduce it

Prerequisites: a Fabric capacity in a **Fabric-Apps-supported region** (e.g. Central US; this project
runs on F2), Node 20/22/24, Python 3.11+ with `pyarrow` and `pyodbc` (ODBC Driver 18), and the Rayfin
CLI (`@microsoft/rayfin-cli`). See [RAYFIN_NOTES.md](RAYFIN_NOTES.md).

```bash
# 1. Generate the messy data and land bronze, then build silver + gold + the model
node fabric_build/gen_historical_csv.mjs
python fabric_build/to_parquet_bronze.py
python fabric_build/run_sql.py fabric_build/sql/10_silver.sql
python fabric_build/run_sql.py fabric_build/sql/20_gold.sql
python fabric_build/gen_model_dw.py        # emits the Direct Lake TMDL model

# 2. Deploy the app (provisions the SQL database, data API, auth, hosting) and seed it
cd lead-pipeline-app
npx rayfin up                              # schema + static app
python ../fabric_build/app_seed.py         # reps + sources
python ../fabric_build/app_seed_leads.py   # a busy operational board

# 3. Materialize the dashboard's data from the model
python ../fabric_build/metrics_refresh.py  # gold rebuild → Execute DAX → Metric* tables

# 4. Run the app locally (preview = sample data, no Fabric needed) and the UAT
npm run dev:preview                        # http://localhost:5173
npx playwright test
```

---

## Engineering notes (gotchas worth knowing)

1. **A Fabric App is iframed, so browser MSAL to Power BI cannot complete.** Don't fight it: materialize
   the model's measures server-side and read them through the app's own data API. Live rows come
   straight from the operational table.
2. **Fabric Warehouse has no `datetime` type.** Use `date` / `datetime2`; e.g. cast the Excel epoch as
   `CAST('1899-12-30' AS date)`, and `CAST(GETDATE() AS date)`.
3. **Direct Lake needs materialized Delta, connected by endpoint GUID.** All gold is CTAS tables, never
   views. After a load, `POST .../sqlEndpoints/{id}/refreshMetadata` before the model can see the tables.
4. **Fabric auto-reframes a Direct Lake model when its source Delta changes**, so a manual reframe can
   collide and get cancelled. Treat that as "superseded" and poll for a Completed framing.
5. **`fab table load` has no schema inference.** Load typed parquet (or a safe-header CSV), or numeric
   columns land as text and break DAX.
6. **Keep one definition per chart.** The funnel's bar, tooltip, click-filter, and drill all use
   current-stage counts; mixing "reaching" and "current" is how a dashboard loses a user's trust.

---

## Testing

`lead-pipeline-app/e2e/uat.spec.ts` is a Playwright E2E suite (run against the preview server on sample
data) covering: board load + add-a-lead, dashboard KPIs and charts, slicer filtering, the funnel
click-filter **consistency** check, table search + pagination, CSV export download, right-click
drill-through, the drill page, and the Guide. Current run: **10/10 green**.

---

## References

- [Verified Rayfin / Fabric Apps notes](RAYFIN_NOTES.md) (decorators, CLI, data API, auth, translytical loop)
- [What is Fabric Apps (Preview)?](https://learn.microsoft.com/en-us/fabric/apps/overview)
- [SQL database mirroring (auto-mirror to OneLake)](https://learn.microsoft.com/fabric/database/sql/mirroring-overview)
- [Direct Lake overview](https://learn.microsoft.com/fabric/fundamentals/direct-lake-overview)
- [Datasets - Execute Queries REST API](https://learn.microsoft.com/rest/api/power-bi/datasets/execute-queries)
- [Introducing Rayfin (Fabric Updates Blog)](https://community.fabric.microsoft.com/t5/Fabric-Updates-Blog/Introducing-Rayfin-A-new-AI-first-way-to-build-deploy-and-govern/ba-p/5191676)

> Fabric Apps / Rayfin is in PREVIEW; confirm exact CLI and decorator syntax in the official docs
> before any production build.
