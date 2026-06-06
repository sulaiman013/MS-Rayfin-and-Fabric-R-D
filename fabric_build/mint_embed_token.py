# App-owns-data: mint a Power BI V2 embed token with the SERVICE PRINCIPAL and
# write it into the app's EmbedConfig table. The dashboard reads it through the
# data API and embeds the report with powerbi-client. The SP secret stays here on
# the server; only the short-lived embed token reaches the browser.
#
# Env: PBI_SP_CLIENT_ID, PBI_SP_SECRET, REPORT_ID  (PBI_SP_TENANT optional)
import os, json, uuid, struct, urllib.request, urllib.error, pyodbc, wh
from azure.identity import ClientSecretCredential

TENANT = os.environ.get("PBI_SP_TENANT", "ff3ac7f5-acd6-4e24-af3e-da685f1e1f36")
CLIENT_ID = os.environ["PBI_SP_CLIENT_ID"]
SECRET = os.environ["PBI_SP_SECRET"]
REPORT_ID = os.environ["REPORT_ID"]
WORKSPACE = "a0fb0343-3d80-4a65-b02b-6b8f00b463cc"
APP_SERVER = "6xdtv76wvqse5lz63juf6hq7gy-imb7xieahvsuvmblnohqbnddzq.database.fabric.microsoft.com"
APP_DB = "lead-pipeline-app-58807e19-4af8-44ef-be60-5395d1223adf"
PBI = "https://api.powerbi.com/v1.0/myorg"


def sp_headers():
    tok = ClientSecretCredential(TENANT, CLIENT_ID, SECRET).get_token(
        "https://analysis.windows.net/powerbi/api/.default").token
    return {"Authorization": "Bearer " + tok, "Content-Type": "application/json"}


def call(method, url, headers, body=None):
    req = urllib.request.Request(url, data=(json.dumps(body).encode() if body is not None else None),
                                 method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {url.split('myorg')[-1]} -> HTTP {e.code}: {e.read()[:500].decode(errors='ignore')}")


H = sp_headers()
print("1/3  reading report metadata ...")
rep = call("GET", f"{PBI}/groups/{WORKSPACE}/reports/{REPORT_ID}", H)
embed_url, dataset_id = rep["embedUrl"], rep.get("datasetId")
print(f"     report '{rep.get('name')}'  dataset={dataset_id}")

print("2/3  generating V2 embed token (service principal) ...")
tok = call("POST", f"{PBI}/groups/{WORKSPACE}/reports/{REPORT_ID}/GenerateToken", H, {"accessLevel": "View"})
embed_token, expiration = tok["token"], tok["expiration"]
print(f"     token len={len(embed_token)} expires={expiration}")

print("3/3  writing EmbedConfig in the app database ...")
tk = wh._token().encode("utf-16-le")
ts = struct.pack(f"<I{len(tk)}s", len(tk), tk)
cs = (f"Driver={{ODBC Driver 18 for SQL Server}};Server={APP_SERVER},1433;"
      f"Database={APP_DB};Encrypt=yes;TrustServerCertificate=no;")
cn = pyodbc.connect(cs, attrs_before={1256: ts}, autocommit=True)
cur = cn.cursor()
cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo'")
tbl = {r.TABLE_NAME.lower(): r.TABLE_NAME for r in cur.fetchall()}
T = tbl.get("embedconfigs") or tbl.get("embedconfig") or "EmbedConfigs"
cur.execute(f"DELETE FROM dbo.{T}")
cur.execute(f"INSERT INTO dbo.{T} (id, reportId, embedUrl, embedToken, expiresAt) VALUES (?,?,?,?,?)",
            str(uuid.uuid4()), REPORT_ID, embed_url, embed_token, expiration)
print(f"done. EmbedConfig ({T}) updated. Dashboard can embed the report now.")
