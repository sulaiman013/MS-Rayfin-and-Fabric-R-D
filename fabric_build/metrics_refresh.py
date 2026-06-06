# Refresh the dashboard's data. Primary output is the lead-level MetricLead table
# (from the gold star schema, SQL only, no Power BI sign-in), which the dashboard
# uses to compute every KPI/chart client-side and to power slicers, click-to-filter
# interactions, and the details table.
#
# Modes (env vars):
#   (default)      rebuild gold (historical + live) -> MetricLead -> model agg tables
#   SKIP_GOLD=1    skip the gold rebuild (gold assumed current)
#   SKIP_MODEL=1   skip the Power BI model step (MetricLead only, NO device login)
import os, json, uuid, struct, time, urllib.request, urllib.error, pyodbc, wh
from azure.identity import DeviceCodeCredential

TENANT = "<tenant-id>"
WORKSPACE = "<workspace-id>"
DATASET = "<dataset-id>"
APP_SERVER = "<your-workspace>.database.fabric.microsoft.com"
APP_DB = "<app-db-name>"
PCACHE = os.path.join(os.environ.get("TEMP", "."), "fabricpbi_token.json")
PBI = "https://api.powerbi.com/v1.0/myorg"
SKIP_GOLD = bool(os.environ.get("SKIP_GOLD"))
SKIP_MODEL = bool(os.environ.get("SKIP_MODEL"))

I = lambda v: int(round(float(v))) if v is not None else 0
F = lambda v: float(v) if v is not None else 0.0


def app_conn():
    tk = wh._token().encode("utf-16-le")
    ts = struct.pack(f"<I{len(tk)}s", len(tk), tk)
    cs = (f"Driver={{ODBC Driver 18 for SQL Server}};Server={APP_SERVER},1433;"
          f"Database={APP_DB};Encrypt=yes;TrustServerCertificate=no;")
    return pyodbc.connect(cs, attrs_before={1256: ts}, autocommit=True)


LEAD_SQL = """
SELECT fl.CustomerName, r.RepName, r.Showroom, s.LeadSourceName,
       COALESCE(fl.ProjectType,'Unknown') ProjectType, st.StageName, st.StageOrder,
       COALESCE(rm.ReachedMask, POWER(2, fl.CurrentStageKey)) ReachedMask,
       COALESCE(fl.EstimatedValue,0) EstimatedValue, fl.CreatedDateKey, d.YearMonth,
       fl.IsWon, fl.IsLost, fl.IsOpen, fl.IsStalled,
       DATEDIFF(day, CONVERT(date, CAST(fl.LastEventDateKey AS varchar(8)), 112), CAST(GETDATE() AS date)) DaysIdle
FROM dbo.FactLead fl
JOIN dbo.DimStage st ON st.StageKey = fl.CurrentStageKey
JOIN dbo.DimRep r ON r.RepKey = fl.RepKey
JOIN dbo.DimLeadSource s ON s.LeadSourceKey = fl.LeadSourceKey
JOIN dbo.DimDate d ON d.DateKey = fl.CreatedDateKey
OUTER APPLY (
  SELECT SUM(m) ReachedMask FROM (
    SELECT DISTINCT POWER(2, e.StageKey) m FROM dbo.FactStageEvent e WHERE e.LeadKey = fl.LeadKey
  ) x
) rm
"""

# ---- gold (SQL) ----------------------------------------------------------
dw = wh.connect()
dwc = dw.cursor()
if SKIP_GOLD:
    print("1  skip gold rebuild (gold assumed current).")
else:
    print("1  EXEC dbo.sp_build_gold ...")
    dwc.execute("EXEC dbo.sp_build_gold;")
    print("   gold rebuilt.")

# ---- MetricLead from gold (SQL only) -------------------------------------
print("2  reading lead-level facts from gold ...")
dwc.execute(LEAD_SQL)
cols = [c[0] for c in dwc.description]
leads = [dict(zip(cols, r)) for r in dwc.fetchall()]
print(f"   {len(leads)} leads.")

cn = app_conn()
cur = cn.cursor()
cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo'")
tbl = {r.TABLE_NAME.lower(): r.TABLE_NAME for r in cur.fetchall()}


def resolve(base):
    b = base.lower()
    for cand in (b + "s", b):
        if cand in tbl:
            return tbl[cand]
    for k, v in tbl.items():
        if k.startswith(b):
            return v
    raise SystemExit(f"Table for {base} not found. Tables: {list(tbl)}")


T_LEAD = resolve("metriclead")
cur.execute(f"DELETE FROM dbo.{T_LEAD}")
for l in leads:
    cur.execute(
        f"INSERT INTO dbo.{T_LEAD} (id, customerName, repName, showroom, sourceName, projectType, "
        f"stageName, stageOrder, reachedMask, estimatedValue, createdDateKey, yearMonth, "
        f"isWon, isLost, isOpen, isStalled, daysIdle) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        str(uuid.uuid4()), l["CustomerName"], l["RepName"], l["Showroom"], l["LeadSourceName"],
        l["ProjectType"], l["StageName"], I(l["StageOrder"]), I(l["ReachedMask"]), F(l["EstimatedValue"]),
        I(l["CreatedDateKey"]), l["YearMonth"], I(l["IsWon"]), I(l["IsLost"]), I(l["IsOpen"]),
        I(l["IsStalled"]), I(l["DaysIdle"]))
won = sum(I(l["IsWon"]) for l in leads)
lost = sum(I(l["IsLost"]) for l in leads)
print(f"   MetricLead written ({T_LEAD}): {len(leads)} leads, win rate {won}/{won + lost}.")

# ---- optional: Power BI model governed-measure agg tables -----------------
if SKIP_MODEL:
    print("3  skip model agg tables (dashboard computes from MetricLead).")
    print("done (SQL only, no Power BI sign-in).")
    raise SystemExit(0)


def pbi_token():
    try:
        d = json.load(open(PCACHE))
        if d.get("expires_on", 0) > time.time() + 120:
            return d["token"]
    except Exception:
        pass
    cred = DeviceCodeCredential(tenant_id=TENANT, timeout=600,
        prompt_callback=lambda u, c, e: print(f"\n>>> DEVICE LOGIN: open {u} and enter code: {c}\n", flush=True))
    t = cred.get_token("https://analysis.windows.net/powerbi/api/.default")
    json.dump({"token": t.token, "expires_on": t.expires_on}, open(PCACHE, "w"))
    return t.token


def _hdr():
    return {"Authorization": "Bearer " + pbi_token(), "Content-Type": "application/json"}


def execute_dax(dax):
    body = json.dumps({"queries": [{"query": dax}], "serializerSettings": {"includeNulls": True}}).encode()
    req = urllib.request.Request(f"{PBI}/groups/{WORKSPACE}/datasets/{DATASET}/executeQueries",
                                 data=body, method="POST", headers=_hdr())
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    return [{k.split('[')[-1].rstrip(']'): v for k, v in row.items()}
            for row in data["results"][0]["tables"][0]["rows"]]


def reframe_and_wait(timeout_s=150):
    try:
        req = urllib.request.Request(f"{PBI}/groups/{WORKSPACE}/datasets/{DATASET}/refreshes",
                                     data=json.dumps({"type": "full"}).encode(), method="POST", headers=_hdr())
        urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as e:
        print(f"   reframe POST HTTP {e.code} (likely already auto-reframing); waiting.")
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        time.sleep(5)
        req = urllib.request.Request(f"{PBI}/groups/{WORKSPACE}/datasets/{DATASET}/refreshes?$top=1", headers=_hdr())
        with urllib.request.urlopen(req, timeout=60) as r:
            st = json.load(r)["value"][0]["status"]
        if st == "Completed":
            print("   reframe Completed.")
            return
    print("   reframe wait ended (continuing).")


Q_KPI = ('EVALUATE ROW("TotalLeads",[Total Leads],"WonLeads",[Won Leads],"LostLeads",[Lost Leads],'
         '"OpenLeads",[Open Leads],"PipelineValue",[Pipeline Value],"WonValue",[Won Value],'
         '"StalledLeads",[Stalled Leads])')
Q_FUNNEL = ("EVALUATE SUMMARIZECOLUMNS('DimStage'[StageName],'DimStage'[StageOrder],"
            '"Leads",[Leads Reaching Stage]) ORDER BY \'DimStage\'[StageOrder]')
Q_TREND = ("EVALUATE SUMMARIZECOLUMNS('DimDate'[YearMonth],\"TotalLeads\",[Total Leads],"
           '"WonLeads",[Won Leads]) ORDER BY \'DimDate\'[YearMonth]')
Q_REP = ("EVALUATE SUMMARIZECOLUMNS('DimRep'[RepName],\"WonLeads\",[Won Leads],"
         '"LostLeads",[Lost Leads],"TotalLeads",[Total Leads]) ORDER BY [Won Leads] DESC')
Q_SOURCE = ("EVALUATE SUMMARIZECOLUMNS('DimLeadSource'[LeadSourceName],\"TotalLeads\",[Total Leads],"
            '"WonLeads",[Won Leads],"WonValue",[Won Value]) ORDER BY [Total Leads] DESC')

print("3  reframing + reading governed measures from the model ...")
reframe_and_wait()
kpi = execute_dax(Q_KPI)[0]
funnel, trend, reps, sources = execute_dax(Q_FUNNEL), execute_dax(Q_TREND), execute_dax(Q_REP), execute_dax(Q_SOURCE)

T_KPI, T_FUN, T_TRE, T_REP, T_SRC = (resolve(x) for x in
                                     ("metrickpi", "metricfunnel", "metrictrend", "metricrep", "metricsource"))
cur.execute(f"DELETE FROM dbo.{T_KPI}")
cur.execute(f"INSERT INTO dbo.{T_KPI} (id, totalLeads, wonLeads, lostLeads, openLeads, pipelineValue, wonValue, stalledLeads, refreshedAt) "
            f"VALUES (?,?,?,?,?,?,?,?, SYSUTCDATETIME())", str(uuid.uuid4()), I(kpi["TotalLeads"]), I(kpi["WonLeads"]),
            I(kpi["LostLeads"]), I(kpi["OpenLeads"]), F(kpi["PipelineValue"]), F(kpi["WonValue"]), I(kpi["StalledLeads"]))
cur.execute(f"DELETE FROM dbo.{T_FUN}")
for r in funnel:
    cur.execute(f"INSERT INTO dbo.{T_FUN} (id, stageName, stageOrder, leads) VALUES (?,?,?,?)",
                str(uuid.uuid4()), r["StageName"], I(r["StageOrder"]), I(r["Leads"]))
cur.execute(f"DELETE FROM dbo.{T_TRE}")
for r in trend:
    cur.execute(f"INSERT INTO dbo.{T_TRE} (id, yearMonth, totalLeads, wonLeads) VALUES (?,?,?,?)",
                str(uuid.uuid4()), str(r["YearMonth"]), I(r["TotalLeads"]), I(r["WonLeads"]))
cur.execute(f"DELETE FROM dbo.{T_REP}")
for r in reps:
    cur.execute(f"INSERT INTO dbo.{T_REP} (id, repName, wonLeads, closedLeads, totalLeads) VALUES (?,?,?,?,?)",
                str(uuid.uuid4()), r["RepName"], I(r["WonLeads"]), I(r["WonLeads"]) + I(r["LostLeads"]), I(r["TotalLeads"]))
cur.execute(f"DELETE FROM dbo.{T_SRC}")
for r in sources:
    cur.execute(f"INSERT INTO dbo.{T_SRC} (id, sourceName, totalLeads, wonLeads, wonValue) VALUES (?,?,?,?,?)",
                str(uuid.uuid4()), r["LeadSourceName"], I(r["TotalLeads"]), I(r["WonLeads"]), F(r["WonValue"]))
print(f"done. Model agg tables refreshed too ({I(kpi['TotalLeads'])} leads).")
