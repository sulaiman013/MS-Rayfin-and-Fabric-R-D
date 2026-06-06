# Convert the messy historical CSV to an ALL-STRING parquet for the bronze layer.
# Bronze keeps every value exactly as exported (no type coercion, mess preserved),
# because `fab table load` has no schema inference and we want the raw strings intact.
# Run: python to_parquet_bronze.py  ->  parquet/bronze_historical_leads.parquet
import csv, os
import pyarrow as pa
import pyarrow.parquet as pq

BASE = r"C:/Users/Lenovo/Desktop/portfolio/Rayfin Lead Pipeline POC/fabric_build"
SRC = os.path.join(BASE, "seed", "historical_leads_export.csv")
OUT = os.path.join(BASE, "parquet")
os.makedirs(OUT, exist_ok=True)

with open(SRC, newline="", encoding="utf-8") as f:
    rd = csv.reader(f)
    header = next(rd)
    cols = {h: [] for h in header}
    n = 0
    for row in rd:
        # rows are fixed 24-field (shifted rows are misaligned but still 24 fields)
        for i, h in enumerate(header):
            cols[h].append(row[i] if i < len(row) else None)
        n += 1

# Delta column names cannot contain spaces, so sanitize the NAMES (values stay messy).
def safe(h):
    return h.strip().replace(" ", "_")

safe_header = [safe(h) for h in header]
# every column is string at bronze
arrays = [pa.array(cols[h], type=pa.string()) for h in header]
table = pa.table(arrays, names=safe_header)
pq.write_table(table, os.path.join(OUT, "bronze_historical_leads.parquet"))
print(f"bronze_historical_leads.parquet: {table.num_rows} rows x {table.num_columns} cols (all string)")
print("columns:", ", ".join(safe_header))

# Also emit a SAFE-HEADER CSV for `fab table load` (CSV load has no schema inference,
# so every value lands as text = exactly what bronze wants). The original messy-header
# CSV (historical_leads_export.csv) stays untouched as the raw "export" artifact.
with open(SRC, encoding="utf-8") as f:
    lines = f.readlines()
lines[0] = ",".join(safe_header) + "\n"
load_csv = os.path.join(BASE, "seed", "bronze_historical_leads.csv")
with open(load_csv, "w", encoding="utf-8", newline="") as f:
    f.writelines(lines)
print("safe-header load CSV:", load_csv)
print("OUT:", OUT)
