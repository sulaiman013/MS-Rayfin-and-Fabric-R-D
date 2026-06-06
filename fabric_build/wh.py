# Connection helper for the Fabric Warehouse (and Lakehouse SQL endpoint).
# Acquires an Entra token for the SQL audience via azure-identity with a PERSISTENT
# cache, so the first run opens a browser sign-in and later runs are silent. The token
# is injected into pyodbc (ODBC Driver 18) via SQL_COPT_SS_ACCESS_TOKEN.
import os, sys, json, time, struct, pyodbc
from azure.identity import DeviceCodeCredential

TENANT = "<tenant-id>"
SERVER = os.environ.get("WH_SERVER", "<your-workspace>.datawarehouse.fabric.microsoft.com")
DB = os.environ.get("WH_DB", "LeadPipelineDW")
SQL_COPT_SS_ACCESS_TOKEN = 1256
SCOPE = "https://database.windows.net/.default"
CACHE = os.path.join(os.environ.get("TEMP", "."), "fabricwh_token.json")

def _prompt(verification_uri, user_code, expires_on):
    print(f"\n>>> DEVICE LOGIN: open {verification_uri} and enter code: {user_code}\n", flush=True)

def _token():
    # reuse a cached raw access token across processes until it nears expiry
    try:
        with open(CACHE) as f:
            d = json.load(f)
        if d.get("expires_on", 0) > time.time() + 120:
            return d["token"]
    except Exception:
        pass
    cred = DeviceCodeCredential(tenant_id=TENANT, timeout=600, prompt_callback=_prompt)
    t = cred.get_token(SCOPE)
    try:
        with open(CACHE, "w") as f:
            json.dump({"token": t.token, "expires_on": t.expires_on}, f)
    except Exception:
        pass
    return t.token

def connect(database=None):
    tok = _token().encode("utf-16-le")
    ts = struct.pack(f"<I{len(tok)}s", len(tok), tok)
    cs = (f"Driver={{ODBC Driver 18 for SQL Server}};Server={SERVER},1433;"
          f"Database={database or DB};Encrypt=yes;TrustServerCertificate=no;")
    return pyodbc.connect(cs, attrs_before={SQL_COPT_SS_ACCESS_TOKEN: ts}, autocommit=True)
