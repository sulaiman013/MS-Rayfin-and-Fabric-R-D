# The "Refresh data" step of the translytical loop: rebuild the gold star schema
# (historical + live app leads) and reframe the Direct Lake model so the dashboard
# reflects new writeback. Run after adding/advancing a lead in the app.
import os, json, time, urllib.request, urllib.error, wh
from azure.identity import DeviceCodeCredential

TENANT = "<tenant-id>"
WORKSPACE = "<workspace-id>"
DATASET = "<dataset-id>"
PCACHE = os.path.join(os.environ.get("TEMP", "."), "fabricpbi_token.json")

# 1) rebuild gold (= cleaned historical UNION live app leads)
cn = wh.connect()
cur = cn.cursor()
cur.execute("EXEC dbo.sp_build_gold;")
print("1/2  sp_build_gold rebuilt gold (historical + live).")

# 2) reframe the Direct Lake model so it serves the new gold
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

req = urllib.request.Request(
    f"https://api.powerbi.com/v1.0/myorg/groups/{WORKSPACE}/datasets/{DATASET}/refreshes",
    data=json.dumps({"type": "full"}).encode(), method="POST",
    headers={"Authorization": "Bearer " + pbi_token(), "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        print(f"2/2  Direct Lake reframe requested (HTTP {r.status}). Dashboard is current within seconds.")
except urllib.error.HTTPError as e:
    print(f"2/2  reframe HTTP {e.code}: {e.read()[:200].decode(errors='ignore')}")
print("done")
