# Power BI Report Layout: Lead-to-Install Pipeline

Page size 1280 x 720 (16:9). Three pages. Field references use the gold star schema
and the measures in `fabric/dax_measures.dax`. Place all visuals at y of 120 or below
so they clear the page title.

I can generate this as an actual PBIR project with the create-pbi-report skill once the
Direct Lake semantic model is published. The spec below is the blueprint for that.

---

## Page 1: Funnel Overview
Purpose: the at-a-glance health of the pipeline.

- **Title textbox** (top): "Lead-to-Install Pipeline"
- **Row 1, KPI cards** (y about 120, four across):
  1. Total Leads  -> [Total Leads]
  2. Win Rate     -> [Win Rate] (percent)
  3. Pipeline Value -> [Pipeline Value] (currency)
  4. Won Value    -> [Won Value] (currency)
- **Row 2 left, Funnel visual** (about 55 percent width):
  - Category: DimStage[StageName] (sorted by DimStage[StageOrder])
  - Values: [Leads Reaching Stage]
- **Row 2 right, Clustered column, leads by source** (about 45 percent width):
  - Axis: DimLeadSource[LeadSourceName]
  - Values: [Total Leads], [Won Leads]
- **Row 3, Line chart, leads over time** (full width):
  - Axis: DimDate[YearMonth]
  - Values: [Total Leads] and [Won Leads]
- **Slicers** (top right): DimDate[Year], DimRep[Showroom]

## Page 2: Velocity and Conversion
Purpose: where deals stall, and how reps and quotes perform.

- **Bar chart, average days in stage**:
  - Axis: DimStage[StageName] (sorted by StageOrder)
  - Value: [Avg Days in Stage]
- **Matrix, rep performance**:
  - Rows: DimRep[RepName]
  - Values: [Total Leads], [Won Leads], [Win Rate], [Won Value], [Avg Days to Win]
- **KPI cards**: [Quote Acceptance Rate], [Avg Quote Response Days], [Avg Deal Size]
- **Clustered bar, conversion by lead source**:
  - Axis: DimLeadSource[LeadSourceName]
  - Values: [Win Rate]
- **Slicers**: DimDate[Year], DimLeadSource[Channel]

## Page 3: Lead Detail
Purpose: the operational drill-through list.

- **Table** (full width):
  - Columns: LeadId (or customerName from a DimLead if you add one), DimRep[RepName],
    DimLeadSource[LeadSourceName], FactLead[ProjectType], DimStage[StageName],
    [Pipeline Value], FactLead[IsWon]
  - Conditional formatting: data bar on EstimatedValue; color IsWon.
- **Slicers**: DimRep[RepName], DimStage[StageName], DimDate[YearMonth]

---

## Formatting notes
- Favor the sqlbi theme defaults over per-visual overrides.
- Hide subtitles. Use visual titles that differentiate ("by Source", "Monthly Trend"),
  not the page subject.
- Sort the funnel and the days-in-stage bar by DimStage[StageOrder], not alphabetically.
- Format Win Rate, Loss Rate, Quote Acceptance Rate as percentages; value measures as currency.

## Optional enhancements (after the POC works)
- Add a DimLead with customerName so the detail table reads cleanly.
- Add row-level security so each rep sees only their own leads (mirror the @role policy).
- Add a small multiples or decomposition tree for "why did we lose" using StageEvent notes.
