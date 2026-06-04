import os

BASE = r"C:/Users/Lenovo/Desktop/portfolio/Rayfin Lead Pipeline POC/fabric_build/LeadPipelineModel.SemanticModel"
DEF = os.path.join(BASE, "definition")
TBL = os.path.join(DEF, "tables")
for d in (BASE, DEF, TBL):
    os.makedirs(d, exist_ok=True)

# The Direct Lake model points at the gold Lakehouse SQL analytics endpoint.
# These are tenant-specific, so they are read from the environment to keep this
# public script free of workspace details:
#   Windows:  set FABRIC_SQL_SERVER=<your-workspace>.datawarehouse.fabric.microsoft.com
#             set FABRIC_SQL_ENDPOINT=<sql-analytics-endpoint-guid>
# Both values live in the Lakehouse SQL analytics endpoint > Settings > Connection string.
SERVER = os.environ.get("FABRIC_SQL_SERVER", "<your-workspace>.datawarehouse.fabric.microsoft.com")
ENDPOINT = os.environ.get("FABRIC_SQL_ENDPOINT", "<sql-analytics-endpoint-guid>")

def w(path, text):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)

lt = 0
def tag():
    global lt
    lt += 1
    return f"aaaaaaaa-0000-0000-0000-{lt:012d}"

# .platform
w(os.path.join(BASE, ".platform"),
  '{\n  "$schema": "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",\n'
  '  "metadata": { "type": "SemanticModel", "displayName": "LeadPipelineModel" },\n'
  '  "config": { "version": "2.0", "logicalId": "bbbbbbbb-0000-0000-0000-000000000001" }\n}\n')

# definition.pbism
w(os.path.join(BASE, "definition.pbism"), '{\n  "version": "4.2",\n  "settings": {}\n}\n')

# database.tmdl
w(os.path.join(DEF, "database.tmdl"), "database\n\tcompatibilityLevel: 1604\n")

# expressions.tmdl (Direct Lake on SQL source)
w(os.path.join(DEF, "expressions.tmdl"),
  "expression DatabaseQuery =\n"
  "\t\tlet\n"
  f'\t\t\tSource = Sql.Database("{SERVER}", "{ENDPOINT}")\n'
  "\t\tin\n"
  "\t\t\tSource\n"
  f"\tlineageTag: {tag()}\n")

# --- table specs: (name, [(col, dataType, summarizeBy)]) ---
I, S, D = "int64", "string", "double"
tables = {
    "DimRep": [("RepKey", I, "none"), ("RepName", S, "none"), ("Showroom", S, "none")],
    "DimLeadSource": [("LeadSourceKey", I, "none"), ("LeadSourceName", S, "none"), ("Channel", S, "none")],
    "DimStage": [("StageKey", I, "none"), ("StageName", S, "none"), ("StageOrder", I, "none")],
    "DimDate": [("DateKey", I, "none"), ("Date", S, "none"), ("Year", I, "none"),
                ("MonthNo", I, "none"), ("MonthName", S, "none"), ("YearMonth", S, "none")],
    "FactLead": [("LeadKey", I, "none"), ("CustomerName", S, "none"), ("RepKey", I, "none"),
                 ("LeadSourceKey", I, "none"), ("CurrentStageKey", I, "none"), ("CreatedDateKey", I, "none"),
                 ("EstimatedValue", D, "sum"), ("IsWon", I, "none"), ("IsLost", I, "none"), ("IsOpen", I, "none")],
    "FactStageEvent": [("StageEventKey", I, "none"), ("LeadKey", I, "none"), ("StageKey", I, "none"), ("EnteredDateKey", I, "none")],
}

measures = {
    "FactLead": [
        ("Total Leads", "COUNTROWS('FactLead')", "0"),
        ("Won Leads", "CALCULATE(COUNTROWS('FactLead'), 'FactLead'[IsWon] = 1)", "0"),
        ("Lost Leads", "CALCULATE(COUNTROWS('FactLead'), 'FactLead'[IsLost] = 1)", "0"),
        ("Win Rate", "DIVIDE([Won Leads], [Won Leads] + [Lost Leads])", "0.0%"),
        ("Pipeline Value", "CALCULATE(SUM('FactLead'[EstimatedValue]), 'FactLead'[IsOpen] = 1)", r"\$#,0"),
        ("Won Value", "CALCULATE(SUM('FactLead'[EstimatedValue]), 'FactLead'[IsWon] = 1)", r"\$#,0"),
    ],
    "FactStageEvent": [
        ("Leads Reaching Stage", "DISTINCTCOUNT('FactStageEvent'[LeadKey])", "0"),
    ],
}

for tname, cols in tables.items():
    lines = [f"table {tname}", f"\tlineageTag: {tag()}", ""]
    for (mname, expr, fmt) in measures.get(tname, []):
        lines.append(f"\tmeasure '{mname}' = {expr}")
        lines.append(f"\t\tformatString: {fmt}")
        lines.append(f"\t\tlineageTag: {tag()}")
        lines.append("")
    for (cname, dtype, summ) in cols:
        lines.append(f"\tcolumn {cname}")
        lines.append(f"\t\tdataType: {dtype}")
        lines.append(f"\t\tsummarizeBy: {summ}")
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

# relationships
rels = [
    ("FactLead", "RepKey", "DimRep", "RepKey"),
    ("FactLead", "LeadSourceKey", "DimLeadSource", "LeadSourceKey"),
    ("FactLead", "CurrentStageKey", "DimStage", "StageKey"),
    ("FactLead", "CreatedDateKey", "DimDate", "DateKey"),
    ("FactStageEvent", "StageKey", "DimStage", "StageKey"),
    ("FactStageEvent", "EnteredDateKey", "DimDate", "DateKey"),
]
rl = []
for i, (ft, fc, tt, tc) in enumerate(rels, 1):
    rl.append(f"relationship rel{i:02d}")
    rl.append(f"\tfromColumn: {ft}.{fc}")
    rl.append(f"\ttoColumn: {tt}.{tc}")
    rl.append("")
w(os.path.join(DEF, "relationships.tmdl"), "\n".join(rl))

# model.tmdl
ml = ["model Model", "\tculture: en-US", "\tdefaultPowerBIDataSourceVersion: powerBI_V3",
      "\tdiscourageImplicitMeasures", "\tsourceQueryCulture: en-US", ""]
w(os.path.join(DEF, "model.tmdl"), "\n".join(ml))

print("Wrote semantic model definition to:", BASE)
for root, _, files in os.walk(BASE):
    for fl in files:
        print(" ", os.path.relpath(os.path.join(root, fl), BASE))
