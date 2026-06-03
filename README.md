# Rayfin + Microsoft Fabric POC: Lead-to-Install Sales Pipeline

An end-to-end R&D proof of concept that proves the "translytical" loop:
an operational app captures sales pipeline data, the data auto-mirrors into
OneLake, Fabric data engineering shapes it into a star schema, and a Power BI
report (Direct Lake) delivers funnel analytics, with no ETL between the app and analytics.

Built for a custom-closets business (lead, design consult, quote, sold, installed),
but the model is generic to any sales funnel.

> Decorators and CLI commands here were verified against Microsoft Learn (Fabric Apps docs) in June 2026.
> Fabric Apps / Rayfin is in PREVIEW, so confirm exact syntax in the official docs before a production build.

## What this POC demonstrates
- Code-first backend on Fabric (Rayfin SDK + CLI)
- Operational write-back through a GraphQL API into a Fabric SQL database
- Automatic mirroring of the SQL database into OneLake (Delta), no pipeline to build
- A clean dimensional model (star schema) built with PySpark
- A Direct Lake semantic model and a Power BI funnel report
- Skills on display: translytical architecture, SCD-style dimensions, funnel and time-in-stage analytics

## Architecture (5 stages)
1. Rayfin app (React/Next frontend, built and hosted by Rayfin)
2. Fabric SQL database (OLTP): Rep, LeadSource, Lead, StageEvent, Quote
3. Auto-mirror to OneLake as Delta Parquet (near real time, automatic)
4. PySpark notebook shapes the mirrored tables into a gold star schema
5. Direct Lake semantic model -> Power BI report

## Prerequisites (read this first)
- A Fabric workspace with **Fabric capacity assigned** (you have a workspace ready).
- A tenant admin must enable the **Fabric Apps (preview)** workload (Admin portal > Tenant settings).
- **Node 20, 22, or 24** locally (odd majors and 21/23 are not supported by the CLI).
- Power BI / Fabric permissions to create a Lakehouse, a semantic model, and a report.

### If the Fabric Apps preview is NOT enabled on your tenant
You can still prove the exact same loop without Raysin:
1. Create a **SQL database** item in the workspace.
2. Create the five tables with T-SQL (column types are in each entity file: uuid = UNIQUEIDENTIFIER, text = NVARCHAR, int = INT, decimal = DECIMAL, boolean = BIT, date = DATETIME2).
3. Seed it with `seed/seed_sample_data.sql`.
4. Continue from Build step 4 below.
Swap the Rayfin front end in later once the workload is enabled. The analytics half is identical.

## Build order
1. **Scaffold the Rayfin app and define the model**
   - `npm create @microsoft/rayfin@latest lead-pipeline --workspace "<your workspace name>"`
   - `cd lead-pipeline`
   - Copy the files from `rayfin/data/` in this kit into the project's `rayfin/data/` folder.
   - Register entities (already done in `schema.ts`).
   - `npm run dev` to test locally, then deploy:
   - `npx rayfin up` (provisions the Fabric SQL database, GraphQL API, auth, and hosting)
   - For later schema changes: `npx rayfin up db apply`
2. **(Optional) Seed sample data** so the report has something to show immediately:
   - Open the SQL database in the Fabric portal, open the query editor, run `seed/seed_sample_data.sql`.
   - Adjust table/column names if the generated schema differs from the entity definitions.
3. **Confirm the auto-mirror**
   - Open the SQL database item, switch to its **SQL analytics endpoint**.
   - You should see the five tables as read-only Delta, with no setup. That is the translytical bridge.
4. **Create a GOLD lakehouse and shortcut the source tables**
   - Create a Lakehouse, for example `LeadPipelineGold`.
   - In the lakehouse, add **OneLake shortcuts** (Tables section) pointing to the five mirrored tables in the SQL database (Rep, LeadSource, Lead, StageEvent, Quote).
5. **Build the star schema**
   - Open a PySpark notebook attached to `LeadPipelineGold`.
   - Paste and run `fabric/build_gold_star_schema.py` cell by cell.
   - It writes: DimRep, DimLeadSource, DimStage, DimDate, FactLead, FactStageEvent, FactQuote.
6. **Create the Direct Lake semantic model**
   - From the gold lakehouse SQL analytics endpoint, New semantic model, select the Dim and Fact tables.
   - Create these relationships (single direction, single active):
     - DimDate[DateKey] -> FactLead[CreatedDateKey], FactStageEvent[EnteredDateKey], FactQuote[IssuedDateKey]
     - DimRep[RepKey] -> FactLead[RepKey], FactStageEvent[RepKey], FactQuote[RepKey]
     - DimLeadSource[LeadSourceKey] -> FactLead[LeadSourceKey], FactStageEvent[LeadSourceKey], FactQuote[LeadSourceKey]
     - DimStage[StageKey] -> FactLead[CurrentStageKey], FactStageEvent[StageKey]
   - Mark DimDate as a date table on DimDate[Date].
   - Add the measures from `fabric/dax_measures.dax`.
7. **Build the Power BI report**
   - Follow `powerbi/report-layout.md` (3 pages: Funnel Overview, Velocity and Conversion, Lead Detail).

## Folder contents
- `rayfin/data/` : the Rayfin TypeScript entities and schema registration
- `fabric/build_gold_star_schema.py` : PySpark notebook to build the gold star schema
- `fabric/dax_measures.dax` : the semantic model measures
- `powerbi/report-layout.md` : page-by-page report layout spec
- `seed/seed_sample_data.sql` : optional T-SQL sample data

## A note on scope
This is a POC. Keep the first pass thin: deploy, seed, mirror, model, one report page.
Once it works end to end, grow it (add Consultation entity for no-show analysis, add
role-based row security so each rep sees only their leads, add an Install phase to extend
into the Job Tracker POC).
