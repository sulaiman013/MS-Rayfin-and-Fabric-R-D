import { createRoot } from 'react-dom/client';

import App from '@/App';
import { AuthProvider } from '@/hooks/AuthContext';
import { bootstrapAuth } from '@/services/bootstrap';

import './main.css';

// When this window is the Power BI sign-in popup returning with its auth response,
// do NOT boot the SPA here. Leaving the response untouched in the URL lets the
// opener read the token and close the popup; rendering the app would strip the
// hash and leave the popup stuck showing the dashboard (the bug we saw).
const h = window.location.hash;
const isMsalPopupResponse =
  !!window.opener && window.opener !== window && /[#&](code|error)=/.test(h) && /[#&]state=/.test(h);

if (!isMsalPopupResponse) {
  const authService = bootstrapAuth();
  createRoot(document.getElementById('root')!).render(
    <AuthProvider authService={authService}>
      <App />
    </AuthProvider>,
  );
}
