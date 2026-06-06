import { type AuthUser, type IAuthService } from './IAuthService';

// Offline preview auth (npm run dev:preview). Auto-signs-in with a fixed user
// and never touches the network, so the UI renders against the in-memory seed
// data with no Fabric backend deployed. Never used in a real deployment.
const PREVIEW_USER: AuthUser = {
  id: 'preview-user',
  email: 'preview@local',
  name: 'Preview',
};

export class PreviewAuthService implements IAuthService {
  readonly fabricAuthEnabled = false;

  async signIn(): Promise<AuthUser> {
    return PREVIEW_USER;
  }

  async signOut(): Promise<void> {
    // No session to clear in preview mode.
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    return PREVIEW_USER;
  }

  async initEmbeddedAuth(): Promise<AuthUser | null> {
    // Returning a user here makes AuthProvider auto-authenticate on load,
    // so the board renders with no sign-in step.
    return PREVIEW_USER;
  }
}
