# Validate the Direct Lake model through the Power BI Execute DAX Queries REST API
# (the exact path the in-app dashboard will use). Acquires a Power BI token via device
# code (cached to a temp file), POSTs DAX, prints the measure results.
import os, sys, json, time, urllib.request
from azure.identity import DeviceCodeCredential

TENANT = "ff3ac7f5-acd6-4e24-af3e-da685f1e1f36"
WORKSPACE = "a0fb0343-3d80-4a65-b02b-6b8f00b463cc"
DATASET = "1654272c-fb16-4174-8717-c2067c15f566"
SCOPE = "https://analysis.windows.net/powerbi/api/.default"
CACHE = os.path.join(os.environ.get("TEMP", "."), "fabricpbi_token.json")

def _prompt(uri, code, exp):
    print(f"\n>>> DEVICE LOGIN: open {uri} and enter code: {code}\n", flush=True)

def token():
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

def execute_dax(dax):
    url = f"https://api.powerbi.com/v1.0/myorg/groups/{WORKSPACE}/datasets/{DATASET}/executeQueries"
    body = json.dumps({"queries": [{"query": dax}], "serializerSettings": {"includeNulls": True}}).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    return data["results"][0]["tables"][0]["rows"]

KPIS = ('EVALUATE ROW('
        '"Total Leads", [Total Leads], "Won", [Won Leads], "Lost", [Lost Leads], "Open", [Open Leads], '
        '"Win Rate", [Win Rate], "Won Value", [Won Value], "Pipeline", [Pipeline Value], "Stalled", [Stalled Leads])')
FUNNEL = ("EVALUATE SUMMARIZECOLUMNS('DimStage'[StageName], 'DimStage'[StageOrder], "
          '"Leads", [Leads Reaching Stage]) ORDER BY [StageOrder]')

print("=== KPIs (via Execute DAX Queries) ===")
for row in execute_dax(KPIS):
    for k, v in row.items():
        print(f"  {k.replace('[','').replace(']','')}: {v}")
print("\n=== Funnel ===")
for row in execute_dax(FUNNEL):
    print("  " + " | ".join(f"{k.split('[')[-1].rstrip(']')}={v}" for k, v in row.items()))
print("\nOK")
