import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppHeader } from '@/components/AppHeader';
import {
  advanceLead,
  createLead,
  getLeadSources,
  getLeads,
  getReps,
  markLost,
  nextStage,
  STAGES,
  type Lead,
  type LeadSource,
  type NewLeadInput,
  type Rep,
  type Stage,
} from '@/services/leads';

const STAGE_META: Record<Stage, { label: string; dot: string; soft: string; ink: string }> = {
  new: { label: 'New', dot: 'oklch(0.58 0.02 264)', soft: 'oklch(0.955 0.006 264)', ink: 'oklch(0.40 0.02 264)' },
  consult: { label: 'Consult', dot: 'oklch(0.68 0.12 72)', soft: 'oklch(0.962 0.035 80)', ink: 'oklch(0.46 0.10 62)' },
  quote: { label: 'Quote', dot: 'oklch(0.56 0.13 295)', soft: 'oklch(0.962 0.03 295)', ink: 'oklch(0.45 0.13 295)' },
  won: { label: 'Won', dot: 'oklch(0.56 0.12 150)', soft: 'oklch(0.955 0.035 150)', ink: 'oklch(0.42 0.11 150)' },
  lost: { label: 'Lost', dot: 'oklch(0.60 0.13 22)', soft: 'oklch(0.962 0.025 22)', ink: 'oklch(0.48 0.13 22)' },
};

const money = (n: number | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

export function HomePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [reps, setReps] = useState<Rep[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [l, r, s] = await Promise.all([getLeads(), getReps(), getLeadSources()]);
    setLeads(l);
    setReps(r);
    setSources(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const repName = useMemo(() => new Map(reps.map((r) => [r.id, r.name])), [reps]);
  const sourceName = useMemo(() => new Map(sources.map((s) => [s.id, s.name])), [sources]);

  const kpis = useMemo(() => {
    const open = leads.filter((l) => l.stage === 'new' || l.stage === 'consult' || l.stage === 'quote');
    const won = leads.filter((l) => l.stage === 'won');
    const lost = leads.filter((l) => l.stage === 'lost');
    const closed = won.length + lost.length;
    const wonValue = won.reduce((a, l) => a + (l.estimatedValue ?? 0), 0);
    return {
      open: open.length,
      winRate: closed ? won.length / closed : 0,
      pipeline: open.reduce((a, l) => a + (l.estimatedValue ?? 0), 0),
      wonValue,
      avgDeal: won.length ? wonValue / won.length : 0,
    };
  }, [leads]);

  const handleCreate = async (input: NewLeadInput) => {
    await createLead(input);
    setDrawerOpen(false);
    await refresh();
  };
  const handleAdvance = async (lead: Lead) => {
    await advanceLead(lead);
    await refresh();
  };
  const handleLost = async (lead: Lead) => {
    await markLost(lead);
    await refresh();
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface text-ink">
      <AppHeader />

      <main className="flex flex-1 flex-col gap-5 px-6 py-5">
        <KpiStrip loading={loading} kpis={kpis} />

        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold text-ink">
            Leads <span className="ml-1 font-normal text-faint">{loading ? '' : leads.length}</span>
          </h1>
          <button
            onClick={() => setDrawerOpen(true)}
            disabled={loading}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-strong disabled:opacity-40"
          >
            New lead
          </button>
        </div>

        {loading ? (
          <BoardSkeleton />
        ) : leads.length === 0 ? (
          <EmptyState onAdd={() => setDrawerOpen(true)} />
        ) : (
          <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
            {STAGES.map((stage) => (
              <StageColumn
                key={stage}
                stage={stage}
                leads={leads.filter((l) => l.stage === stage)}
                repName={repName}
                sourceName={sourceName}
                onAdvance={handleAdvance}
                onLost={handleLost}
              />
            ))}
            <SnapshotPanel leads={leads} repName={repName} sourceName={sourceName} />
          </div>
        )}
      </main>

      <NewLeadDrawer
        open={drawerOpen}
        reps={reps}
        sources={sources}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}

function KpiStrip({ loading, kpis }: { loading: boolean; kpis: { open: number; winRate: number; pipeline: number; wonValue: number; avgDeal: number } }) {
  const items = [
    { label: 'Open leads', value: loading ? null : String(kpis.open), hint: 'active in funnel', positive: false },
    { label: 'Win rate', value: loading ? null : pct(kpis.winRate), hint: 'won / closed', positive: !loading && kpis.winRate >= 0.5 },
    { label: 'Pipeline value', value: loading ? null : money(kpis.pipeline), hint: 'open estimated', positive: false },
    { label: 'Won value', value: loading ? null : money(kpis.wonValue), hint: 'closed won', positive: false },
    { label: 'Avg deal', value: loading ? null : money(kpis.avgDeal), hint: 'per won', positive: false },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <div key={it.label} className="bg-panel px-5 py-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-faint">{it.label}</div>
          {it.value == null ? (
            <div className="mt-2 h-7 w-20 animate-pulse rounded bg-rail" />
          ) : (
            <div className={`mt-1 text-[26px] font-semibold leading-none tabular-nums ${it.positive ? 'text-positive' : 'text-ink'}`}>{it.value}</div>
          )}
          <div className="mt-1.5 text-[11px] text-faint">{it.hint}</div>
        </div>
      ))}
    </div>
  );
}

function StageColumn({
  stage,
  leads,
  repName,
  sourceName,
  onAdvance,
  onLost,
}: {
  stage: Stage;
  leads: Lead[];
  repName: Map<string, string>;
  sourceName: Map<string, string>;
  onAdvance: (l: Lead) => void;
  onLost: (l: Lead) => void;
}) {
  const meta = STAGE_META[stage];
  const total = leads.reduce((a, l) => a + (l.estimatedValue ?? 0), 0);
  return (
    <section className="flex w-[280px] shrink-0 flex-col rounded-xl bg-rail">
      <header className="sticky top-0 flex items-center justify-between rounded-t-xl bg-rail/95 px-3.5 pt-3.5 pb-2 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.dot }} />
          <span className="text-[13px] font-semibold text-ink">{meta.label}</span>
          <span className="rounded-full bg-panel px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted">
            {leads.length}
          </span>
        </div>
        <span className="text-xs tabular-nums text-faint">{money(total)}</span>
      </header>
      <div className="flex flex-col gap-2 overflow-y-auto px-2.5 pb-2.5">
        {leads.length === 0 ? (
          <p className="px-1.5 py-6 text-center text-xs text-faint">No leads</p>
        ) : (
          leads.map((l) => (
            <LeadCard
              key={l.id}
              lead={l}
              repName={repName.get(l.rep_id) ?? 'Unassigned'}
              sourceName={sourceName.get(l.leadSource_id) ?? ''}
              onAdvance={onAdvance}
              onLost={onLost}
            />
          ))
        )}
      </div>
    </section>
  );
}

function LeadCard({
  lead,
  repName,
  sourceName,
  onAdvance,
  onLost,
}: {
  lead: Lead;
  repName: string;
  sourceName: string;
  onAdvance: (l: Lead) => void;
  onLost: (l: Lead) => void;
}) {
  const meta = STAGE_META[lead.stage];
  const next = nextStage(lead.stage);
  const isOpen = lead.stage === 'new' || lead.stage === 'consult' || lead.stage === 'quote';
  return (
    <article className="group rounded-lg border border-line bg-panel p-3 shadow-sm transition-colors hover:border-faint/60">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight text-ink">{lead.customerName}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{money(lead.estimatedValue)}</span>
      </div>
      {lead.projectType && <p className="mt-0.5 text-xs text-muted">{lead.projectType}</p>}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-rail text-[10px] font-semibold text-muted">
            {initials(repName)}
          </span>
          <span className="text-xs text-faint">{repName}</span>
        </div>
        {sourceName && (
          <span className="rounded-md bg-rail px-1.5 py-0.5 text-[11px] text-faint">{sourceName}</span>
        )}
      </div>

      {isOpen ? (
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-2.5">
          <button
            onClick={() => onAdvance(lead)}
            className="flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
            style={{ background: STAGE_META[next ?? 'won'].soft, color: STAGE_META[next ?? 'won'].ink }}
          >
            Move to {STAGE_META[next ?? 'won'].label}
          </button>
          <button
            onClick={() => onLost(lead)}
            className="rounded-md px-2 py-1.5 text-xs text-faint opacity-0 transition hover:text-ink group-hover:opacity-100"
          >
            Lost
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
          <span className="text-[11px] font-medium" style={{ color: meta.ink }}>
            {lead.stage === 'won' ? 'Closed won' : 'Closed lost'}
          </span>
        </div>
      )}
    </article>
  );
}

function NewLeadDrawer({
  open,
  reps,
  sources,
  onClose,
  onSubmit,
}: {
  open: boolean;
  reps: Rep[];
  sources: LeadSource[];
  onClose: () => void;
  onSubmit: (input: NewLeadInput) => void;
}) {
  const [name, setName] = useState('');
  const [project, setProject] = useState('');
  const [value, setValue] = useState('');
  const [repId, setRepId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setProject('');
      setValue('');
      setRepId(reps[0]?.id ?? '');
      setSourceId(sources[0]?.id ?? '');
      setSaving(false);
    }
  }, [open, reps, sources]);

  const valid = name.trim() && repId && sourceId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    await onSubmit({
      customerName: name.trim(),
      projectType: project.trim() || undefined,
      estimatedValue: value ? Number(value) : undefined,
      rep_id: repId,
      leadSource_id: sourceId,
    });
  };

  const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft';
  const label = 'mb-1.5 block text-xs font-medium text-muted';

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-ink/20 transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-panel shadow-xl transition-transform duration-200 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-label="New lead"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">New lead</h2>
          <button onClick={onClose} className="text-faint transition-colors hover:text-ink" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          <div>
            <label className={label} htmlFor="nl-name">Customer name</label>
            <input id="nl-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Anderson Family" autoFocus />
          </div>
          <div>
            <label className={label} htmlFor="nl-project">Project type</label>
            <input id="nl-project" className={field} value={project} onChange={(e) => setProject(e.target.value)} placeholder="Walk-in closet" />
          </div>
          <div>
            <label className={label} htmlFor="nl-value">Estimated value (USD)</label>
            <input id="nl-value" className={field} value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="12500" />
          </div>
          <div>
            <label className={label} htmlFor="nl-rep">Assigned rep</label>
            <select id="nl-rep" className={field} value={repId} onChange={(e) => setRepId(e.target.value)}>
              {reps.length === 0 && <option value="">No reps yet</option>}
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="nl-source">Lead source</label>
            <select id="nl-source" className={field} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {sources.length === 0 && <option value="">No sources yet</option>}
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="mt-auto flex items-center gap-2.5 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-rail">
              Cancel
            </button>
            <button type="submit" disabled={!valid || saving} className="flex-1 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-40">
              {saving ? 'Saving...' : 'Add lead'}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

function SnapshotPanel({
  leads,
  repName,
  sourceName,
}: {
  leads: Lead[];
  repName: Map<string, string>;
  sourceName: Map<string, string>;
}) {
  const total = leads.length || 1;
  const stages = STAGES.map((s) => {
    const ls = leads.filter((l) => l.stage === s);
    return { stage: s, meta: STAGE_META[s], count: ls.length, value: ls.reduce((a, l) => a + (l.estimatedValue ?? 0), 0) };
  });
  const tally = (key: (l: Lead) => string) => {
    const m = new Map<string, number>();
    for (const l of leads) m.set(key(l), (m.get(key(l)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const sources = tally((l) => sourceName.get(l.leadSource_id) ?? 'Unknown').slice(0, 5);
  const reps = tally((l) => repName.get(l.rep_id) ?? 'Unassigned');
  const maxSrc = Math.max(1, ...sources.map((s) => s[1]));
  const maxRep = Math.max(1, ...reps.map((r) => r[1]));

  const Bars = ({ items, max, color }: { items: Array<[string, number]>; max: number; color: string }) => (
    <ul className="space-y-2">
      {items.map(([name, n]) => (
        <li key={name} title={`${name}: ${n} lead${n === 1 ? '' : 's'}`} className="text-[12.5px]">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-muted">{name}</span>
            <span className="font-medium tabular-nums text-ink">{n}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-rail">
            <div className="h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="flex w-[300px] min-w-[280px] flex-1 shrink-0 flex-col gap-5 rounded-xl border border-line bg-panel p-4 shadow-sm">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Pipeline at a glance</h3>
        <p className="mt-0.5 text-[11px] text-faint">{leads.length} leads right now</p>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">By stage</div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-rail">
          {stages.map((s) =>
            s.count > 0 ? (
              <div
                key={s.stage}
                title={`${s.meta.label}: ${s.count} lead${s.count === 1 ? '' : 's'} · ${money(s.value)}`}
                style={{ width: `${(s.count / total) * 100}%`, background: s.meta.dot }}
              />
            ) : null,
          )}
        </div>
        <ul className="mt-3 space-y-1.5">
          {stages.map((s) => (
            <li key={s.stage} className="flex items-center gap-2 text-[12.5px]">
              <span className="h-2 w-2 rounded-full" style={{ background: s.meta.dot }} />
              <span className="text-muted">{s.meta.label}</span>
              <span className="ml-auto font-medium tabular-nums text-ink">{s.count}</span>
              <span className="w-16 text-right tabular-nums text-faint">{money(s.value)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Top sources</div>
        <Bars items={sources} max={maxSrc} color="var(--color-accent)" />
      </div>

      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">By rep</div>
        <Bars items={reps} max={maxRep} color="var(--color-indigo)" />
      </div>
    </section>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex flex-1 gap-4 overflow-hidden pb-2">
      {STAGES.map((s) => (
        <div key={s} className="w-[280px] shrink-0 rounded-xl bg-rail p-2.5">
          <div className="mb-3 h-4 w-24 rounded bg-line" />
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-[92px] rounded-lg border border-line bg-panel" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-line py-20 text-center">
      <p className="text-sm font-medium text-ink">No leads in the pipeline yet</p>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Add your first lead to see it flow from New to Won. Each move you make records a stage event that powers the analytics.
      </p>
      <button onClick={onAdd} className="mt-5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong">
        New lead
      </button>
    </div>
  );
}
