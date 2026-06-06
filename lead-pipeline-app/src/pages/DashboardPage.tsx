import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppHeader } from '@/components/AppHeader';
import { MultiSelect } from '@/components/MultiSelect';
import { charts } from '@/dashboard/lib/registry';
import { money, num, pct } from '@/dashboard/lib/format';
import { renderVisual, type RenderOpts } from '@/dashboard/lib/renderVisual';
import {
  computeByRep, computeBySource, computeFunnel, computeKpis, computeTrend,
  EMPTY_SLICERS, getLeads, matchesCross, matchesSlicers, slicersActive,
  type CrossFilter, type FilterDim, type LeadRow, type Slicers,
} from '@/dashboard/lib/leadData';

const CHART_DIM: Record<string, FilterDim> = {
  funnel: 'stage', trend: 'month', winRateByRep: 'rep', bySource: 'source',
};
const COMPUTE: Record<string, (l: LeadRow[]) => Array<Record<string, unknown>>> = {
  funnel: computeFunnel, trend: computeTrend, winRateByRep: computeByRep, bySource: computeBySource,
};
const HIGHLIGHT_FIELD: Record<string, string> = {
  funnel: 'StageName', trend: 'YearMonth', winRateByRep: 'RepName', bySource: 'LeadSourceName',
};
const CHART_META: Record<string, { caption: string; span: string }> = {
  funnel: { caption: 'How many leads are in each stage now', span: 'lg:col-span-7' },
  trend: { caption: 'Volume created each month', span: 'lg:col-span-5' },
  winRateByRep: { caption: 'Close rate across the team', span: 'lg:col-span-4' },
  bySource: { caption: 'Which channels bring the most leads', span: 'lg:col-span-5' },
};
const STAGE_ORDER = ['New', 'Consult', 'Quote', 'Won', 'Lost'];
const STAGE_DOT: Record<string, string> = {
  New: '#94a3b8', Consult: '#f59e0b', Quote: '#8b5cf6', Won: '#10b981', Lost: '#ef4444',
};
const PAGE_SIZE = 25;
const card =
  'rounded-2xl border border-line bg-panel shadow-[0_1px_2px_rgba(16,24,40,0.04),0_14px_30px_-18px_rgba(16,24,40,0.20)]';
const darkCard =
  'rounded-2xl bg-panel-dark shadow-[0_1px_2px_rgba(16,24,40,0.06),0_18px_36px_-20px_rgba(16,24,40,0.45)]';

const sw = { className: 'h-[18px] w-[18px]', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 } as const;
const IconUsers = () => (<svg {...sw}><path strokeLinecap="round" strokeLinejoin="round" d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm11.5 8v-1a4 4 0 0 0-3-3.87M16 4.13a4 4 0 0 1 0 7.75" /></svg>);
const IconTarget = () => (<svg {...sw}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /></svg>);
const IconWallet = () => (<svg {...sw}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8a2 2 0 0 1 2-2h11M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2" /><circle cx="16.5" cy="13" r="1.1" fill="currentColor" stroke="none" /></svg>);
const IconCheck = () => (<svg {...sw}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="m8.5 12 2.3 2.3L15.5 10" /></svg>);
const IconClock = () => (<svg {...sw}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 1.8" /></svg>);

// Export the currently filtered/searched/sorted leads as a CSV (opens in Excel).
function exportCsv(rows: LeadRow[]) {
  const headers = ['Customer', 'Rep', 'Showroom', 'Source', 'Project', 'Stage', 'Value', 'Created month', 'Days idle', 'Stalled'];
  const cell = (r: LeadRow) => [
    r.customerName, r.repName, r.showroom, r.sourceName, r.projectType, r.stageName,
    r.estimatedValue, r.yearMonth, r.daysIdle, r.isStalled ? 'Yes' : 'No',
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(','), ...rows.map((r) => cell(r).map(esc).join(','))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lead-pipeline.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function crossFromDatum(name: string, d: Record<string, unknown>): CrossFilter | null {
  switch (name) {
    case 'funnel': return { dim: 'stage', value: String(d.StageName), label: `Stage: ${d.StageName}`, order: Number(d.StageOrder) };
    case 'trend': return { dim: 'month', value: String(d.YearMonth), label: `Month ${d.YearMonth}` };
    case 'winRateByRep': return { dim: 'rep', value: String(d.RepName), label: String(d.RepName) };
    case 'bySource': return { dim: 'source', value: String(d.LeadSourceName), label: String(d.LeadSourceName) };
    default: return null;
  }
}

type SortKey = 'customerName' | 'repName' | 'sourceName' | 'projectType' | 'estimatedValue' | 'stageName' | 'daysIdle';
type Tone = 'default' | 'positive' | 'warn';
const toneText: Record<Tone, string> = { default: 'text-ink', positive: 'text-positive', warn: 'text-warn' };
const toneChip: Record<Tone, string> = {
  default: 'bg-accent-soft text-accent-strong', positive: 'bg-accent-soft text-accent-strong', warn: 'bg-warn-soft text-warn',
};

export function DashboardPage() {
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slicers, setSlicers] = useState<Slicers>(EMPTY_SLICERS);
  const [cross, setCross] = useState<CrossFilter | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'estimatedValue', dir: 'desc' });
  const [tableSearch, setTableSearch] = useState('');
  const [page, setPage] = useState(0);
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLeads(await getLeads());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const all = leads ?? [];
  const bySlicers = useMemo(() => all.filter((l) => matchesSlicers(l, slicers)), [all, slicers]);
  const filtered = useMemo(() => bySlicers.filter((l) => matchesCross(l, cross)), [bySlicers, cross]);
  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const followUp = useMemo(
    () => [...filtered].filter((l) => l.isStalled).sort((a, b) => b.daysIdle - a.daysIdle),
    [filtered],
  );

  const opts = useMemo(() => ({
    reps: [...new Set(all.map((l) => l.repName))].sort(),
    sources: [...new Set(all.map((l) => l.sourceName))].sort(),
    stages: STAGE_ORDER.filter((s) => all.some((l) => l.stageName === s)),
    showrooms: [...new Set(all.map((l) => l.showroom))].sort(),
    months: [...new Set(all.map((l) => l.yearMonth))].sort(),
  }), [all]);

  const onChartClick = useCallback((name: string, d: Record<string, unknown>) => {
    const nc = crossFromDatum(name, d);
    if (!nc) return;
    setCross((p) => (p && p.dim === nc.dim && p.value === nc.value ? null : nc));
  }, []);

  useEffect(() => {
    if (!leads) return;
    for (const c of charts) {
      const el = chartRefs.current[c.name];
      if (!el) continue;
      const dim = CHART_DIM[c.name];
      const isSource = cross != null && cross.dim === dim;
      const rows = COMPUTE[c.name](isSource ? bySlicers : filtered);
      const o: RenderOpts = { onClick: (d) => onChartClick(c.name, d) };
      if (isSource && cross) { o.highlightField = HIGHLIGHT_FIELD[c.name]; o.highlightValue = cross.value; }
      o.onContextMenu = (d) => {
        const cf = crossFromDatum(c.name, d);
        if (cf) navigate(`/dashboard/drill/${cf.dim}/${encodeURIComponent(cf.value)}`);
      };
      void renderVisual(el, c, rows, o);
    }
  }, [leads, bySlicers, filtered, cross, onChartClick, navigate]);

  const searched = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(
      (l) =>
        l.customerName.toLowerCase().includes(q) || l.repName.toLowerCase().includes(q) ||
        l.sourceName.toLowerCase().includes(q) || l.projectType.toLowerCase().includes(q) ||
        l.stageName.toLowerCase().includes(q),
    );
  }, [filtered, tableSearch]);

  const tableRows = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...searched].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [searched, sort]);

  const pageCount = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = tableRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => { setPage(0); }, [tableSearch, filtered]);

  const anyFilter = slicersActive(slicers) || cross != null;
  const clearAll = () => { setSlicers(EMPTY_SLICERS); setCross(null); };
  const setSort2 = (key: SortKey) =>
    setSort((p) => (p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  const KPIS = [
    { label: 'Total leads', hint: 'in view', value: num(kpis.totalLeads), tone: 'default' as Tone, icon: <IconUsers />, dark: false },
    { label: 'Win rate', hint: 'won / closed', value: pct(kpis.winRate), tone: 'positive' as Tone, icon: <IconTarget />, dark: true },
    { label: 'Open pipeline', hint: 'estimated value', value: money(kpis.pipelineValue), tone: 'default' as Tone, icon: <IconWallet />, dark: false },
    { label: 'Won value', hint: 'closed won', value: money(kpis.wonValue), tone: 'default' as Tone, icon: <IconCheck />, dark: false },
    { label: 'Stalled', hint: '> 14 days idle', value: num(kpis.stalledLeads), tone: (kpis.stalledLeads > 0 ? 'warn' : 'default') as Tone, icon: <IconClock />, dark: false },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[oklch(0.965_0.03_166)] via-surface to-surface text-ink">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-5 px-6 py-7">
        {/* Hero */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">Sales pipeline</h1>
            <p className="mt-1 text-[13px] text-muted">
              Governed measures from the Direct Lake model{loading ? '' : ` · ${all.length} leads`}
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-rail disabled:opacity-50"
          >
            <svg className={`h-3.5 w-3.5 text-muted ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 9a8 8 0 0 0-14.9-3M4 15a8 8 0 0 0 14.9 3" />
            </svg>
            {loading ? 'Loading' : 'Refresh'}
          </button>
        </div>

        {/* Slicers */}
        <div className={`flex flex-wrap items-center gap-2 ${card} px-3 py-2.5`}>
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Slicers</span>
          <MultiSelect label="Rep" options={opts.reps} selected={slicers.reps} onChange={(v) => setSlicers((s) => ({ ...s, reps: v }))} />
          <MultiSelect label="Source" options={opts.sources} selected={slicers.sources} onChange={(v) => setSlicers((s) => ({ ...s, sources: v }))} />
          <MultiSelect label="Stage" options={opts.stages} selected={slicers.stages} onChange={(v) => setSlicers((s) => ({ ...s, stages: v }))} />
          <MultiSelect label="Showroom" options={opts.showrooms} selected={slicers.showrooms} onChange={(v) => setSlicers((s) => ({ ...s, showrooms: v }))} />
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[13px] text-muted">
            <span className="text-faint">Months</span>
            <select value={slicers.monthFrom ?? ''} onChange={(e) => setSlicers((s) => ({ ...s, monthFrom: e.target.value || null }))} className="bg-transparent text-ink outline-none">
              <option value="">start</option>
              {opts.months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-faint">to</span>
            <select value={slicers.monthTo ?? ''} onChange={(e) => setSlicers((s) => ({ ...s, monthTo: e.target.value || null }))} className="bg-transparent text-ink outline-none">
              <option value="">end</option>
              {opts.months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {cross && (
            <button data-testid="cross-chip" onClick={() => setCross(null)} className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3 py-1.5 text-[13px] font-medium text-accent-strong">
              {cross.label}<span className="text-accent-strong/70">✕</span>
            </button>
          )}
          {anyFilter && (
            <button onClick={clearAll} className="ml-auto rounded-full px-3 py-1.5 text-[13px] text-faint transition-colors hover:bg-rail hover:text-ink">
              Clear all
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-danger">{error}</div>
        )}

        {/* KPI band */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {KPIS.map((k) =>
            k.dark ? (
              <div key={k.label} className={`${darkCard} flex flex-col justify-between gap-4 p-5 text-white`}>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-accent">{k.icon}</span>
                <div>
                  {loading ? <div className="h-8 w-20 animate-pulse rounded bg-white/10" /> : (
                    <div data-testid={`kpi-${k.label.toLowerCase().replace(/ /g, '-')}`} className="text-[32px] font-semibold leading-none tabular-nums text-accent">{k.value}</div>
                  )}
                  <div className="mt-2 text-[12px] font-medium text-white/90">{k.label}</div>
                  <div className="text-[11px] text-white/45">{k.hint}</div>
                </div>
              </div>
            ) : (
              <div key={k.label} className={`${card} flex flex-col justify-between gap-4 p-5`}>
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${toneChip[k.tone]}`}>{k.icon}</span>
                <div>
                  {loading ? <div className="h-8 w-20 animate-pulse rounded bg-rail" /> : (
                    <div data-testid={`kpi-${k.label.toLowerCase().replace(/ /g, '-')}`} className={`text-[32px] font-semibold leading-none tabular-nums ${toneText[k.tone]}`}>{k.value}</div>
                  )}
                  <div className="mt-2 text-[12px] font-medium text-ink">{k.label}</div>
                  <div className="text-[11px] text-faint">{k.hint}</div>
                </div>
              </div>
            ),
          )}
        </div>

        {/* Charts + follow-up bento */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {charts.map((c) => {
            const meta = CHART_META[c.name];
            return (
              <section key={c.name} className={`${card} flex flex-col p-5 ${meta?.span ?? 'lg:col-span-6'}`}>
                <header className="mb-3">
                  <h2 className="text-[13px] font-semibold text-ink">{c.title}</h2>
                  {meta?.caption && (
                    <p className="mt-0.5 text-[11px] text-faint">
                      {meta.caption} · click to filter · right-click to drill
                    </p>
                  )}
                </header>
                <div className="relative flex-1">
                  <div ref={(el) => { chartRefs.current[c.name] = el; }} className="min-h-[240px] w-full" />
                  {loading && (
                    <div className="absolute inset-0 grid place-items-end gap-2 rounded-xl bg-rail/50 p-4">
                      <div className="flex w-full items-end gap-2" aria-hidden>
                        {[60, 85, 45, 70, 35, 55].map((h, idx) => (
                          <div key={idx} className="flex-1 animate-pulse rounded-t bg-line" style={{ height: `${h}%` }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          {/* Needs follow-up (dark accent card) */}
          <section className={`${darkCard} flex flex-col p-5 text-white lg:col-span-3`}>
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold">Needs follow-up</h2>
              <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[11px] font-semibold text-warn">{followUp.length}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-white/45">Open leads idle over 14 days</p>
            <ul className="mt-3 flex flex-1 flex-col gap-2 overflow-hidden">
              {!loading && followUp.length === 0 && <li className="mt-2 text-[12px] text-white/40">Nothing stalled right now. Nice.</li>}
              {followUp.slice(0, 6).map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.06] px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{l.customerName}</div>
                    <div className="truncate text-[11px] text-white/45">{l.repName} · {l.sourceName}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-warn">{l.daysIdle}d</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Details table */}
        <section className={`${card} flex flex-col`}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-[13px] font-semibold text-ink">Lead details</h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-3.5-3.5" />
                </svg>
                <input value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="Search leads…"
                  className="w-44 rounded-full border border-line bg-surface py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft sm:w-56" />
              </div>
              <span className="hidden whitespace-nowrap text-[11px] text-faint md:inline">{filtered.length} leads</span>
              <button
                onClick={() => exportCsv(tableRows)}
                title="Export the filtered leads to CSV (opens in Excel)"
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-rail"
              >
                <svg className="h-3.5 w-3.5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14" />
                </svg>
                Export
              </button>
            </div>
          </header>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                  {([
                    ['customerName', 'Customer'], ['repName', 'Rep'], ['sourceName', 'Source'],
                    ['projectType', 'Project'], ['stageName', 'Stage'], ['estimatedValue', 'Value'], ['daysIdle', 'Idle'],
                  ] as Array<[SortKey, string]>).map(([key, label]) => (
                    <th key={key} onClick={() => setSort2(key)}
                      className={`cursor-pointer select-none px-4 py-2.5 font-medium hover:text-ink ${key === 'estimatedValue' || key === 'daysIdle' ? 'text-right' : ''}`}>
                      {label}{sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!loading && tableRows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-faint">{tableSearch ? 'No leads match your search' : 'No leads match the current filters'}</td></tr>
                )}
                {pageRows.map((l, i) => (
                  <tr key={safePage * PAGE_SIZE + i} className="border-b border-line/60 last:border-0 hover:bg-rail/50">
                    <td className="px-4 py-2 font-medium text-ink">{l.customerName}</td>
                    <td className="px-4 py-2 text-muted">{l.repName}</td>
                    <td className="px-4 py-2 text-muted">{l.sourceName}</td>
                    <td className="px-4 py-2 text-muted">{l.projectType}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: STAGE_DOT[l.stageName] ?? '#94a3b8' }} />
                        <span className="text-ink">{l.stageName}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink">{money(l.estimatedValue)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${l.isStalled ? 'font-medium text-warn' : 'text-muted'}`}>{l.daysIdle}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tableRows.length > 0 && (
            <footer className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12px] text-muted">
              <span className="tabular-nums">
                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, tableRows.length)} of {tableRows.length}
              </span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}
                  className="rounded-full border border-line px-3 py-1 transition-colors hover:bg-rail disabled:opacity-40">Prev</button>
                <span className="px-1 tabular-nums text-faint">Page {safePage + 1} / {pageCount}</span>
                <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}
                  className="rounded-full border border-line px-3 py-1 transition-colors hover:bg-rail disabled:opacity-40">Next</button>
              </div>
            </footer>
          )}
        </section>
      </main>
    </div>
  );
}
