# Validate the service principal can authenticate (client credentials) and reach
# the workspace's datasets/reports. Confirms SP + tenant setting + workspace access.
import os, json, urllib.request, urllib.error
from azure.identity import ClientSecretCredential

TENANT = "ff3ac7f5-acd6-4e24-af3e-da685f1e1f36"
WS = "a0fb0343-3d80-4a65-b02b-6b8f00b463cc"
CID = os.environ["PBI_SP_CLIENT_ID"]
SEC = os.environ["PBI_SP_SECRET"]
tok = ClientSecretCredential(TENANT, CID, SEC).get_token("https://analysis.windows.net/powerbi/api/.default").token
H = {"Authorization": "Bearer " + tok}


def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"ERROR": e.code, "body": e.read()[:400].decode(errors="ignore")}


print("SP token acquired OK.\n")
ds = get(f"https://api.powerbi.com/v1.0/myorg/groups/{WS}/datasets")
print("DATASETS:")
for d in ds.get("value", []) if isinstance(ds, dict) and "value" in ds else []:
    print(f"  {d.get('name')}  id={d.get('id')}")
if "ERROR" in (ds if isinstance(ds, dict) else {}):
    print("  ", ds)
rp = get(f"https://api.powerbi.com/v1.0/myorg/groups/{WS}/reports")
print("\nREPORTS:")
for r in rp.get("value", []) if isinstance(rp, dict) and "value" in rp else []:
    print(f"  {r.get('name')}  id={r.get('id')}  dataset={r.get('datasetId')}")
if "ERROR" in (rp if isinstance(rp, dict) else {}):
    print("  ", rp)
