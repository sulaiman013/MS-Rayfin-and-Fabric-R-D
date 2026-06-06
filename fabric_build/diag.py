# Diagnose the model state: latest refresh error + whether Execute DAX works.
# Reads the cached Power BI token (no new device login).
import os, json, urllib.request, urllib.error

WORKSPACE = "a0fb0343-3d80-4a65-b02b-6b8f00b463cc"
DATASET = "1654272c-fb16-4174-8717-c2067c15f566"
PBI = "https://api.powerbi.com/v1.0/myorg"
PCACHE = os.path.join(os.environ.get("TEMP", "."), "fabricpbi_token.json")
TOK = json.load(open(PCACHE))["token"]
H = {"Authorization": "Bearer " + TOK, "Content-Type": "application/json"}


def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=60))


def dax(q):
    body = json.dumps({"queries": [{"query": q}]}).encode()
    req = urllib.request.Request(f"{PBI}/groups/{WORKSPACE}/datasets/{DATASET}/executeQueries",
                                 data=body, method="POST", headers=H)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return "OK", json.load(r)["results"][0]["tables"][0]["rows"]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")[:600]


print("=== last 3 refreshes ===")
for x in get(f"{PBI}/groups/{WORKSPACE}/datasets/{DATASET}/refreshes?$top=3")["value"]:
    print(f"  {x.get('refreshType')} {x.get('status')} start={x.get('startTime')}")
    if x.get("serviceExceptionJson"):
        print("    err:", x["serviceExceptionJson"][:400])

print("\n=== trivial query ===")
print(" ", dax('EVALUATE ROW("ok", 1)'))
print("\n=== one measure ===")
print(" ", dax("EVALUATE ROW(\"Total Leads\", [Total Leads])"))
print("\n=== funnel dim ===")
print(" ", dax("EVALUATE SUMMARIZECOLUMNS('DimStage'[StageName], \"n\", [Total Leads])"))
