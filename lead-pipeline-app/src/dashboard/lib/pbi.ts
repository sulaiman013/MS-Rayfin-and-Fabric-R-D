// Power BI Execute DAX Queries client for the in-app dashboard.
// Standalone auth: the app acquires its own Power BI token via MSAL (separate from
// the Rayfin/Fabric SSO session that powers writeback), then calls the Execute
// Queries REST API directly (CORS for this endpoint allows the webapp origin).
import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import { normalizeRows } from './normalize';
import { mockDax } from './pbiMocks';

const TENANT = import.meta.env.VITE_FABRIC_TENANT_ID as string | undefined;
const CLIENT_ID = import.meta.env.VITE_PBI_CLIENT_ID as string | undefined;
const WORKSPACE = import.meta.env.VITE_FABRIC_WORKSPACE_ID as string | undefined;
const DATASET = import.meta.env.VITE_PBI_DATASET_ID as string | undefined;
const PBI_SCOPES = ['https://analysis.windows.net/powerbi/api/Dataset.Read.All'];
const PBI_BASE = 'https://api.powerbi.com/v1.0/myorg';

// Mock when running offline (preview) or before the Entra app / dataset are wired.
export function isPbiMock(): boolean {
  return import.meta.env.VITE_PREVIEW === '1' || !CLIENT_ID || !DATASET || !WORKSPACE;
}

let msal: PublicClientApplication | null = null;
async function getMsal(): Promise<PublicClientApplication> {
  if (!msal) {
    msal = new PublicClientApplication({
      auth: {
        clientId: CLIENT_ID as string,
        authority: `https://login.microsoftonline.com/${TENANT}`,
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'localStorage' },
    });
    await msal.initialize();
    // Completes a full-page redirect sign-in when the popup path was not usable.
    const resp = await msal.handleRedirectPromise();
    if (resp?.account) msal.setActiveAccount(resp.account);
  }
  return msal;
}

// Silent path only. Safe to call on page load: it never opens a popup, so it can
// never trip the browser popup blocker. Returns null when interactive sign-in is
// required (no cached account and no usable SSO session).
export async function getPbiTokenSilent(loginHint?: string): Promise<string | null> {
  const m = await getMsal();
  const account: AccountInfo | undefined = m.getActiveAccount() ?? m.getAllAccounts()[0];
  if (account) {
    try {
      const r = await m.acquireTokenSilent({ scopes: PBI_SCOPES, account });
      m.setActiveAccount(r.account);
      return r.accessToken;
    } catch {
      // cached token expired and silent refresh failed; try SSO, else null
    }
  }
  // ssoSilent renews through a hidden iframe. When the app itself is embedded in
  // an iframe (the Fabric portal "Open app" embed), that nested iframe hangs on
  // the Microsoft login page. Only attempt it when we are the top-level window;
  // otherwise fall straight to the interactive Connect button.
  const topLevel = window.self === window.top;
  if (loginHint && topLevel) {
    try {
      const r = await m.ssoSilent({ scopes: PBI_SCOPES, loginHint });
      m.setActiveAccount(r.account);
      return r.accessToken;
    } catch {
      // no shared session in the hidden iframe; interactive sign-in needed
    }
  }
  return null;
}

// Interactive path. MUST be called from a real user gesture (a click handler),
// otherwise the browser blocks the popup (popup_window_error). After this resolves
// once, getPbiTokenSilent() succeeds for the rest of the session.
export async function signInPbi(loginHint?: string): Promise<string> {
  const m = await getMsal();
  const r = await m.acquireTokenPopup({ scopes: PBI_SCOPES, loginHint });
  m.setActiveAccount(r.account);
  return r.accessToken;
}

// Full-page redirect sign-in. Bulletproof when the app is open standalone (not
// embedded): no popup blocker, no iframe. Navigates away; getMsal() completes it
// on return and getPbiTokenSilent() then succeeds. Used as the popup fallback.
export async function signInPbiRedirect(loginHint?: string): Promise<void> {
  const m = await getMsal();
  await m.acquireTokenRedirect({ scopes: PBI_SCOPES, loginHint });
}

// Execute one DAX query with a pre-acquired token; returns normalized rows.
// In mock mode the token is ignored (offline preview / unconfigured env).
export async function executeDax(
  dax: string,
  token: string | null,
): Promise<Array<Record<string, unknown>>> {
  if (isPbiMock()) return mockDax(dax);
  if (!token) throw new Error('NOT_CONNECTED');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let res: Response;
  try {
    res = await fetch(`${PBI_BASE}/groups/${WORKSPACE}/datasets/${DATASET}/executeQueries`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: [{ query: dax }], serializerSettings: { includeNulls: true } }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError')
      throw new Error('The query timed out reaching Power BI. Check the network and try Refresh.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        'Not authorized to query the model. Ask an admin to grant Build on the semantic model and enable the Execute Queries tenant setting.',
      );
    }
    throw new Error(`Execute Queries failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const rows = data?.results?.[0]?.tables?.[0]?.rows ?? [];
  return normalizeRows(rows);
}
