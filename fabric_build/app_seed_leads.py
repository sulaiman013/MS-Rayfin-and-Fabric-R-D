# Seed the Rayfin app's operational SQL database with a realistic, BUSY pipeline of
# leads + their StageEvent trails, so the kanban board looks like a working business
# and the live arm of sp_build_gold has real operational rows to union into gold.
#
# Idempotent: a lead is only inserted if its customerName is not already present, so
# re-running never duplicates. Reps/LeadSources must already exist (run app_seed.py).
import uuid, struct, random, datetime as dt, pyodbc, wh

APP_SERVER = "6xdtv76wvqse5lz63juf6hq7gy-imb7xieahvsuvmblnohqbnddzq.database.fabric.microsoft.com"
APP_DB = "lead-pipeline-app-58807e19-4af8-44ef-be60-5395d1223adf"

random.seed(42)
NOW = dt.datetime.utcnow()

tok = wh._token().encode("utf-16-le")
ts = struct.pack(f"<I{len(tok)}s", len(tok), tok)
cs = (f"Driver={{ODBC Driver 18 for SQL Server}};Server={APP_SERVER},1433;"
      f"Database={APP_DB};Encrypt=yes;TrustServerCertificate=no;")
cn = pyodbc.connect(cs, attrs_before={1256: ts}, autocommit=True)
cur = cn.cursor()

# Resolve actual table names (Rayfin pluralizes entity classes; be robust about it).
cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo'")
tbl = {r.TABLE_NAME.lower(): r.TABLE_NAME for r in cur.fetchall()}
LEADS = tbl.get("leads", "Leads")
EVENTS = tbl.get("stageevents", "StageEvents")
REPS = tbl.get("reps", "Reps")
SRCS = tbl.get("leadsources", "LeadSources")

cur.execute(f"SELECT id, name FROM dbo.{REPS}")
reps = [r.id for r in cur.fetchall()]
cur.execute(f"SELECT id, name FROM dbo.{SRCS}")
sources = [r.id for r in cur.fetchall()]
if not reps or not sources:
    raise SystemExit("Reps/LeadSources missing. Run app_seed.py first.")

PROJECTS = {
    "Walk-in closet": (9000, 18000),
    "Garage storage": (5000, 9500),
    "Pantry": (2200, 4200),
    "Home office": (5000, 8500),
    "Mudroom": (3800, 6800),
    "Reach-in closet": (1800, 3500),
    "Laundry room": (3000, 6000),
    "Wardrobe wall": (4000, 7500),
}
PROJ_NAMES = list(PROJECTS)

NAMES = [
    "Anderson Family", "Bennett Residence", "Carlsson Home", "The Delgado Family",
    "Emerson Loft", "Fairbanks LLC", "Goldstein Residence", "Harper Family",
    "Ishikawa Home", "Juniper Estate", "Kowalski Family", "Lindqvist Residence",
    "Montgomery Home", "Nakamura Family", "O'Brien Residence", "Pemberton LLC",
    "Quintero Home", "Rasmussen Family", "Sinclair Residence", "Thompson Loft",
    "Underwood Home", "Vasquez Family", "Whitaker Residence", "Yamamoto Home",
    "Zhang Family", "Abbott Townhouse", "Brennan Family", "Castellano Home",
    "Donovan Residence", "Engstrom Family", "Forsythe LLC", "Greenwood Home",
    "Hollis Family", "Ibrahim Residence", "Jorgensen Home", "Kensington Estate",
    "Lassiter Family", "Marchetti Home", "Novak Residence", "Prescott Family",
    "Ramirez Home", "Saunders Residence", "Tillman Family", "Voss Residence",
    "Westbrook Family", "Yardley Residence", "Zimmerman Family", "Ashworth Home",
    "Calloway Family", "Driscoll Residence",
]

# A busy, realistic distribution: open leads dominate, with closed deals behind them.
plan = ["new"] * 11 + ["consult"] * 9 + ["quote"] * 7 + ["won"] * 9 + ["lost"] * 6
random.shuffle(plan)

OPEN = {"new", "consult", "quote"}
ORDER = ["new", "consult", "quote"]


def trail(stage, created):
    """Stage history from 'new' up to the lead's current stage, timestamps progressing."""
    if stage == "won":
        path = ["new", "consult", "quote", "won"]
    elif stage == "lost":
        path = ORDER[: random.choice([2, 3, 3])] + ["lost"]
    else:
        path = ORDER[: ORDER.index(stage) + 1]
    events, te = [], created
    for i, s in enumerate(path):
        if i > 0:
            te = te + dt.timedelta(days=random.randint(2, 12), hours=random.randint(0, 12))
        events.append((s, min(te, NOW - dt.timedelta(hours=1))))
    return events


inserted, counts, stalled_open = 0, {}, 0
for idx, stage in enumerate(plan):
    name = NAMES[idx]
    cur.execute(f"SELECT COUNT(*) FROM dbo.{LEADS} WHERE customerName = ?", name)
    if cur.fetchone()[0] > 0:
        continue

    proj = random.choice(PROJ_NAMES)
    lo, hi = PROJECTS[proj]
    value = int(round(random.randint(lo, hi), -2))
    rep_id, src_id = random.choice(reps), random.choice(sources)

    if stage in OPEN:
        stalled = idx % 2 == 0            # ~half the open leads have gone quiet
        created = NOW - dt.timedelta(days=random.randint(28, 60) if stalled else random.randint(1, 12))
    else:
        created = NOW - dt.timedelta(days=random.randint(20, 75))

    events = trail(stage, created)
    updated = events[-1][1]
    if stage in OPEN and (NOW - updated).days > 14:
        stalled_open += 1
    lead_id = str(uuid.uuid4())

    cur.execute(
        f"INSERT INTO dbo.{LEADS} (id, customerName, projectType, estimatedValue, stage, "
        f"createdAt, updatedAt, rep_id, leadSource_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        lead_id, name, proj, value, stage, created, updated, rep_id, src_id)
    for s, te in events:
        cur.execute(
            f"INSERT INTO dbo.{EVENTS} (id, lead_id, stage, enteredAt) VALUES (?, ?, ?, ?)",
            str(uuid.uuid4()), lead_id, s, te)
    counts[stage] = counts.get(stage, 0) + 1
    inserted += 1

print(f"Inserted {inserted} new leads (idle>14d among open: {stalled_open}).")
cur.execute(f"SELECT stage, COUNT(*) c, SUM(estimatedValue) v FROM dbo.{LEADS} GROUP BY stage")
print("Board now holds:")
for r in cur.fetchall():
    print(f"  {r.stage:8} {r.c:3}  ${int(r.v or 0):,}")
cur.execute(f"SELECT COUNT(*) FROM dbo.{LEADS}")
total = cur.fetchone()[0]
cur.execute(f"SELECT COUNT(*) FROM dbo.{EVENTS}")
ev = cur.fetchone()[0]
print(f"Total leads: {total}   Total stage events: {ev}")
