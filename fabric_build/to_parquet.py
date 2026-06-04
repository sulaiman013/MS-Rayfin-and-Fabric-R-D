import csv, os
import pyarrow as pa
import pyarrow.parquet as pq

BASE = r"C:/Users/Lenovo/Desktop/portfolio/Rayfin Lead Pipeline POC/fabric_build"
SEED = os.path.join(BASE, "seed")
OUT = os.path.join(BASE, "parquet")
os.makedirs(OUT, exist_ok=True)

I, S, D = pa.int64(), pa.string(), pa.float64()

schemas = {
    "DimRep": {"RepKey": I, "RepName": S, "Showroom": S},
    "DimLeadSource": {"LeadSourceKey": I, "LeadSourceName": S, "Channel": S},
    "DimStage": {"StageKey": I, "StageName": S, "StageOrder": I},
    "DimDate": {"DateKey": I, "Date": S, "Year": I, "MonthNo": I, "MonthName": S, "YearMonth": S},
    "FactLead": {"LeadKey": I, "CustomerName": S, "RepKey": I, "LeadSourceKey": I,
                 "CurrentStageKey": I, "CreatedDateKey": I, "EstimatedValue": D,
                 "IsWon": I, "IsLost": I, "IsOpen": I},
    "FactStageEvent": {"StageEventKey": I, "LeadKey": I, "StageKey": I, "EnteredDateKey": I},
}


def cast(val, typ):
    if typ == I:
        return int(val)
    if typ == D:
        return float(val)
    return val


for name, smap in schemas.items():
    with open(os.path.join(SEED, name + ".csv"), newline="") as f:
        rd = csv.DictReader(f)
        cols = {c: [] for c in smap}
        for row in rd:
            for c, t in smap.items():
                cols[c].append(cast(row[c], t))
    arrays = [pa.array(cols[c], type=t) for c, t in smap.items()]
    table = pa.table(arrays, names=list(smap.keys()))
    pq.write_table(table, os.path.join(OUT, name + ".parquet"))
    print(name, table.num_rows, "rows", [f.name + ":" + str(f.type) for f in table.schema])

print("OUT:", OUT)