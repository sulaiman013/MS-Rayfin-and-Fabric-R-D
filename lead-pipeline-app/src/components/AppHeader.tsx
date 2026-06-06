import { NavLink } from 'react-router-dom';

import { useAuth } from '@/hooks/AuthContext';

const tab = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
    isActive ? 'bg-ink text-surface shadow-sm' : 'text-muted hover:text-ink'
  }`;

// Funnel mark: three descending bars, the pipeline itself.
function FunnelMark() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white shadow-sm">
      <svg width="19" height="19" viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2" y="3.5" width="14" height="2.7" rx="1.35" fill="currentColor" />
        <rect x="4.5" y="7.7" width="9" height="2.7" rx="1.35" fill="currentColor" opacity="0.78" />
        <rect x="7" y="11.9" width="4" height="2.7" rx="1.35" fill="currentColor" opacity="0.52" />
      </svg>
    </span>
  );
}

function initialsOf(value: string): string {
  const base = value.includes('@') ? value.split('@')[0] : value;
  const parts = base.split(/[.\s_-]+/).filter(Boolean);
  const letters = (parts.length >= 2 ? parts[0][0] + parts[1][0] : base.slice(0, 2)) || '?';
  return letters.toUpperCase();
}

export function AppHeader() {
  const { signOut, user } = useAuth();
  const identity = user?.email ?? '';
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-line/70 bg-surface/80 px-6 py-3 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <FunnelMark />
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-tight text-ink">Pipeline</div>
          <div className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wider text-faint">Custom Closets</div>
        </div>
      </div>

      <nav className="flex items-center gap-0.5 rounded-full border border-line bg-panel p-1 shadow-sm">
        <NavLink to="/" end className={tab}>Board</NavLink>
        <NavLink to="/dashboard" className={tab}>Dashboard</NavLink>
        <NavLink to="/guide" className={tab}>Guide</NavLink>
      </nav>

      <div className="flex items-center gap-2.5">
        {identity && (
          <div className="hidden items-center gap-2.5 sm:flex">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-[11px] font-semibold text-white">
              {initialsOf(identity)}
            </span>
            <span className="hidden max-w-[150px] truncate text-[13px] text-muted lg:inline" title={identity}>
              {identity}
            </span>
          </div>
        )}
        <button
          onClick={() => void signOut()}
          className="rounded-full px-3 py-1.5 text-[13px] text-faint transition-colors hover:bg-rail hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
