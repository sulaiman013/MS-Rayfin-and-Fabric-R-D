# De-risk CORS: send an unauthenticated OPTIONS preflight to the Execute Queries
# endpoint with our webapp Origin and inspect the Access-Control-* response headers.
# If the server echoes our origin (or *), a browser SPA can call it directly; if not,
# we need a same-origin proxy.
import urllib.request, urllib.error

ORIGIN = "https://early-zeal-1ffebaf6c4-centralus.webapp.fabricapps.net"
URL = ("https://api.powerbi.com/v1.0/myorg/groups/a0fb0343-3d80-4a65-b02b-6b8f00b463cc/"
       "datasets/1654272c-fb16-4174-8717-c2067c15f566/executeQueries")
HDRS = ["Access-Control-Allow-Origin", "Access-Control-Allow-Methods",
        "Access-Control-Allow-Headers", "Access-Control-Allow-Credentials"]

req = urllib.request.Request(URL, method="OPTIONS", headers={
    "Origin": ORIGIN,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,content-type",
})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        status, hdrs = r.status, r.headers
except urllib.error.HTTPError as e:
    status, hdrs = e.code, e.headers
except Exception as ex:
    print("ERROR:", ex); raise SystemExit(1)

print("preflight status:", status)
allow = None
for h in HDRS:
    v = hdrs.get(h)
    print(f"  {h}: {v}")
    if h == "Access-Control-Allow-Origin":
        allow = v
print()
if allow and (allow == "*" or ORIGIN.lower() in allow.lower()):
    print("VERDICT: CORS ALLOWED -> browser can call executeQueries directly.")
else:
    print("VERDICT: CORS BLOCKED -> need a same-origin proxy for the DAX calls.")
