# Can the SERVICE PRINCIPAL read the Direct Lake model? If Execute DAX returns data,
# the SP has OneLake access and the embed token will render; if it errors on Direct
# Lake access, the model needs a Fixed Identity (No-SSO) cloud connection.
import os, json, urllib.request, urllib.error
from azure.identity import ClientSecretCredential

TENANT = "ff3ac7f5-acd6-4e24-af3e-da685f1e1f36"
WS = "a0fb0343-3d80-4a65-b02b-6b8f00b463cc"
DS = "1654272c-fb16-4174-8717-c2067c15f566"
tok = ClientSecretCredential(TENANT, os.environ["PBI_SP_CLIENT_ID"], os.environ["PBI_SP_SECRET"]).get_token(
    "https://analysis.windows.net/powerbi/api/.default").token
H = {"Authorization": "Bearer " + tok, "Content-Type": "application/json"}
body = json.dumps({"queries": [{"query": 'EVALUATE ROW("Total Leads", [Total Leads])'}]}).encode()
req = urllib.request.Request(f"https://api.powerbi.com/v1.0/myorg/groups/{WS}/datasets/{DS}/executeQueries",
                             data=body, method="POST", headers=H)
try:
    with urllib.request.urlopen(req, timeout=90) as r:
        print("SP CAN READ THE MODEL:", json.load(r)["results"][0]["tables"][0]["rows"])
except urllib.error.HTTPError as e:
    print(f"SP READ FAILED HTTP {e.code}:\n{e.read()[:700].decode(errors='ignore')}")
