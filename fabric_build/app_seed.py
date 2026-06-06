# Seed the Rayfin app's operational SQL database with the canonical reps and lead
# sources (matching the historical gold dimensions), so leads added in the app UI
# conform to the same DimRep/DimLeadSource. Writes to the read-write OLTP endpoint;
# the app's GraphQL reads from here, and the rows auto-mirror to OneLake for analytics.
import uuid, struct, pyodbc, wh

APP_SERVER = "6xdtv76wvqse5lz63juf6hq7gy-imb7xieahvsuvmblnohqbnddzq.database.fabric.microsoft.com"
APP_DB = "lead-pipeline-app-58807e19-4af8-44ef-be60-5395d1223adf"

tok = wh._token().encode("utf-16-le")
ts = struct.pack(f"<I{len(tok)}s", len(tok), tok)
cs = (f"Driver={{ODBC Driver 18 for SQL Server}};Server={APP_SERVER},1433;"
      f"Database={APP_DB};Encrypt=yes;TrustServerCertificate=no;")
cn = pyodbc.connect(cs, attrs_before={1256: ts}, autocommit=True)
cur = cn.cursor()

reps = [
    ("Maria Lopez", "maria.lopez@inspiredclosets.example", "austin"),
    ("Devon Carter", "devon.carter@inspiredclosets.example", "la"),
    ("Priya Shah", "priya.shah@inspiredclosets.example", "online"),
    ("Sam Okafor", "sam.okafor@inspiredclosets.example", "dallas"),
]
sources = [
    ("Google Ads", "ad"), ("Houzz", "web"), ("Referral Past Client", "referral"),
    ("Showroom Walk-in", "showroom"), ("Instagram", "ad"),
]

for name, email, showroom in reps:
    cur.execute(
        "IF NOT EXISTS (SELECT 1 FROM dbo.Reps WHERE name = ?) "
        "INSERT INTO dbo.Reps (id, name, email, showroom, active, createdAt) "
        "VALUES (?, ?, ?, ?, 1, SYSUTCDATETIME())",
        name, str(uuid.uuid4()), name, email, showroom)

for name, channel in sources:
    cur.execute(
        "IF NOT EXISTS (SELECT 1 FROM dbo.LeadSources WHERE name = ?) "
        "INSERT INTO dbo.LeadSources (id, name, channel, createdAt) "
        "VALUES (?, ?, ?, SYSUTCDATETIME())",
        name, str(uuid.uuid4()), name, channel)

cur.execute("SELECT (SELECT COUNT(*) FROM dbo.Reps) AS reps, (SELECT COUNT(*) FROM dbo.LeadSources) AS sources")
r = cur.fetchone()
print(f"Reps in app DB: {r.reps}   LeadSources: {r.sources}")
print("Seeded the app operational database.")
