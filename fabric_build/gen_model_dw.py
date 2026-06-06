# Generates a Direct Lake (on SQL) semantic model as TMDL, over the Warehouse gold.
# Clean two-fact conformed-dimension star (FactLead + FactStageEvent share DimRep/
# DimLeadSource/DimStage/DimDate), governed measures incl. Stalled Leads.
# Incorporates semantic-model-auditor fixes: sortByColumn, hidden keys/flags,
# guarded Avg Days in Stage, measure descriptions + display folders.
# Run: python gen_model_dw.py  ->  LeadPipelineSales.SemanticModel/  (then `fab import`)
import os

BASE = r"C:/Users/Lenovo/Desktop/portfolio/Rayfin Lead Pipeline POC/fabric_build/LeadPipelineSales.SemanticModel"
DEF = os.path.join(BASE, "definition")
TBL = os.path.join(DEF, "tables")
for d in (BASE, DEF, TBL):
    os.makedirs(d, exist_ok=True)

# Direct Lake on the Warehouse SQL endpoint (by item GUID, not friendly name).
SERVER = "6xdtv76wvqse5lz63juf6hq7gy-imb7xieahvsuvmblnohqbnddzq.datawarehouse.fabric.microsoft.com"
WAREHOUSE_ID = "a97a33f2-5a3a-4bee-9bfe-e461678a4c65"
MODEL_LOGICAL_ID = "1654272c-fb16-4174-8717-c2067c15f566"  # actual item GUID, so re-import updates in place

def w(path, text):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)

lt = 0
def tag():
    global lt
    lt += 1
    return f"aaaaaaaa-0000-0000-0000-{lt:012d}"

w(os.path.join(BASE, ".platform"),
  '{\n  "$schema": "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",\n'
  '  "metadata": { "type": "SemanticModel", "displayName": "LeadPipelineSales" },\n'
  f'  "config": {{ "version": "2.0", "logicalId": "{MODEL_LOGICAL_ID}" }}\n}}\n')
w(os.path.join(BASE, "definition.pbism"), '{\n  "version": "4.2",\n  "settings": {}\n}\n')
w(os.path.join(DEF, "database.tmdl"), "database\n\tcompatibilityLevel: 1604\n")
w(os.path.join(DEF, "expressions.tmdl"),
  "expression DatabaseQuery =\n\t\tlet\n"
  f'\t\t\tSource = Sql.Database("{SERVER}", "{WAREHOUSE_ID}")\n'
  "\t\tin\n\t\t\tSource\n"
  f"\tlineageTag: {tag()}\n")
w(os.path.join(DEF, "model.tmdl"),
  "model Model\n\tculture: en-US\n\tdefaultPowerBIDataSourceVersion: powerBI_V3\n"
  "\tdiscourageImplicitMeasures\n\tsourceQueryCulture: en-US\n")

# ---- column spec: (name, dataType, summarizeBy, hidden, sortByColumn) ----
I, S, DT, DEC = "int64", "string", "dateTime", "decimal"
def C(name, dtype, summ="none", hidden=False, sort=None):
    return (name, dtype, summ, hidden, sort)

tables = {
    "DimRep": [C("RepKey", I, hidden=True), C("RepName", S), C("Showroom", S),
               C("IsActive", I), C("SourceSystem", S, hidden=True)],
    "DimLeadSource": [C("LeadSourceKey", I, hidden=True), C("LeadSourceName", S), C("Channel", S)],
    "DimStage": [C("StageKey", I, hidden=True), C("StageName", S, sort="StageOrder"), C("StageOrder", I, hidden=True)],
    "DimDate": [C("DateKey", I, hidden=True), C("Date", DT), C("Year", I), C("Quarter", S),
                C("MonthNumber", I, hidden=True), C("MonthName", S, sort="MonthNumber"),
                C("YearMonth", S), C("DayOfWeek", S), C("IsWeekend", I, hidden=True)],
    "FactLead": [C("LeadKey", I, hidden=True), C("LeadBK", S, hidden=True), C("CustomerName", S),
                 C("RepKey", I, hidden=True), C("LeadSourceKey", I, hidden=True), C("CurrentStageKey", I, hidden=True),
                 C("CreatedDateKey", I, hidden=True), C("WonDateKey", I, hidden=True), C("ProjectType", S),
                 C("EstimatedValue", DEC, summ="sum"), C("IsWon", I, hidden=True), C("IsLost", I, hidden=True),
                 C("IsOpen", I, hidden=True), C("LastEventDateKey", I, hidden=True), C("IsStalled", I, hidden=True),
                 C("SourceSystem", S, hidden=True)],
    "FactStageEvent": [C("StageEventKey", I, hidden=True), C("LeadKey", I, hidden=True), C("StageKey", I, hidden=True),
                       C("EnteredDateKey", I, hidden=True), C("DurationDays", I, hidden=True), C("RepKey", I, hidden=True),
                       C("LeadSourceKey", I, hidden=True), C("SourceSystem", S, hidden=True)],
}

# ---- measures: (name, expr, formatString, displayFolder, description) ----
measures = {
    "FactLead": [
        ("Total Leads", "COUNTROWS('FactLead')", "0", "Counts", "Count of leads in context."),
        ("Won Leads", "CALCULATE(COUNTROWS('FactLead'), 'FactLead'[IsWon] = 1)", "0", "Counts", "Leads that closed Won."),
        ("Lost Leads", "CALCULATE(COUNTROWS('FactLead'), 'FactLead'[IsLost] = 1)", "0", "Counts", "Leads that closed Lost."),
        ("Open Leads", "CALCULATE(COUNTROWS('FactLead'), 'FactLead'[IsOpen] = 1)", "0", "Counts", "Leads still in New/Consult/Quote."),
        ("Win Rate", "DIVIDE([Won Leads], [Won Leads] + [Lost Leads])", "0.0%", "Rates",
         "Won / (Won + Lost). Decided-deal win rate; excludes Open leads, so it is not a percent of all leads."),
        ("Pipeline Value", "CALCULATE(SUM('FactLead'[EstimatedValue]), 'FactLead'[IsOpen] = 1)", r"\$#,0", "Value", "Estimated value of Open leads."),
        ("Won Value", "CALCULATE(SUM('FactLead'[EstimatedValue]), 'FactLead'[IsWon] = 1)", r"\$#,0", "Value", "Estimated value of Won leads."),
        ("Avg Deal Size", "DIVIDE([Won Value], [Won Leads])", r"\$#,0", "Value", "Won Value divided by Won Leads."),
        ("Stalled Leads", "CALCULATE(COUNTROWS('FactLead'), 'FactLead'[IsStalled] = 1)", "0", "Counts",
         "Open leads with no stage change in more than 14 days; the follow-up backlog."),
    ],
    "FactStageEvent": [
        ("Leads Reaching Stage", "DISTINCTCOUNT('FactStageEvent'[LeadKey])", "0", "Stage Flow",
         "Distinct leads that reached the stage in context. Drives the funnel."),
        ("Avg Days in Stage", "IF(HASONEVALUE('DimStage'[StageName]), AVERAGE('FactStageEvent'[DurationDays]))", "0.0", "Stage Flow",
         "Average days a lead spends in a stage. Blank unless a single stage is in context."),
    ],
}

for tname, cols in tables.items():
    lines = [f"table {tname}", f"\tlineageTag: {tag()}", ""]
    for (mname, expr, fmt, folder, desc) in measures.get(tname, []):
        if desc:
            lines.append(f"\t/// {desc}")
        lines.append(f"\tmeasure '{mname}' = {expr}")
        lines.append(f"\t\tformatString: {fmt}")
        lines.append(f"\t\tdisplayFolder: {folder}")
        lines.append(f"\t\tlineageTag: {tag()}")
        lines.append("")
    for (cname, dtype, summ, hidden, sort) in cols:
        lines.append(f"\tcolumn {cname}")
        lines.append(f"\t\tdataType: {dtype}")
        if hidden:
            lines.append("\t\tisHidden")
        lines.append(f"\t\tsummarizeBy: {summ}")
        if sort:
            lines.append(f"\t\tsortByColumn: {sort}")
        lines.append(f"\t\tsourceColumn: {cname}")
        lines.append(f"\t\tlineageTag: {tag()}")
        lines.append("")
    lines.append(f"\tpartition {tname} = entity")
    lines.append("\t\tmode: directLake")
    lines.append("\t\tsource")
    lines.append(f"\t\t\tentityName: {tname}")
    lines.append("\t\t\tschemaName: dbo")
    lines.append("\t\t\texpressionSource: DatabaseQuery")
    lines.append("")
    w(os.path.join(TBL, f"{tname}.tmdl"), "\n".join(lines))

# relationships: (fromTable, fromCol, toTable, toCol, isActive)
rels = [
    ("FactLead", "RepKey", "DimRep", "RepKey", True),
    ("FactLead", "LeadSourceKey", "DimLeadSource", "LeadSourceKey", True),
    ("FactLead", "CurrentStageKey", "DimStage", "StageKey", True),
    ("FactLead", "CreatedDateKey", "DimDate", "DateKey", True),
    ("FactLead", "WonDateKey", "DimDate", "DateKey", False),
    ("FactStageEvent", "StageKey", "DimStage", "StageKey", True),
    ("FactStageEvent", "EnteredDateKey", "DimDate", "DateKey", True),
    ("FactStageEvent", "RepKey", "DimRep", "RepKey", True),
    ("FactStageEvent", "LeadSourceKey", "DimLeadSource", "LeadSourceKey", True),
]
rl = []
for i, (ft, fc, tt, tc, active) in enumerate(rels, 1):
    rl.append(f"relationship rel{i:02d}")
    rl.append(f"\tfromColumn: {ft}.{fc}")
    rl.append(f"\ttoColumn: {tt}.{tc}")
    if not active:
        rl.append("\tisActive: false")
    rl.append("")
w(os.path.join(DEF, "relationships.tmdl"), "\n".join(rl))

print("Wrote semantic model to:", BASE)
