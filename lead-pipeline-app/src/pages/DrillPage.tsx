import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AppHeader } from '@/components/AppHeader';
import { charts } from '@/dashboard/lib/registry';
import { money, num, pct } from '@/dashboard/lib/format';
import { renderVisual } from '@/dashboard/lib/renderVisual';
import {
  computeByRep, computeBySource, computeFunnel, computeKpis, computeTrend,
  getLeads, type LeadRow,
} from '@/dashboard/lib/leadData';

const card =
  'rounded-2xl border border-line bg-panel shadow-[0_1px_2px_rgba(16,24,40,0.04),0_14px_30px_-18px_rgba(16,24,40,0.20)]';
const STAGE_DOT: Record<string, string> = {
  New: '#94a3b8', Consult: '#f59e0b', Quote: '#8b5cf6', Won: '#10b981', Lost: '#ef4444',
};
const DIM_LABEL: Record<string, string> = { stage: 'Stage', rep: 'Rep', source: 'Source', month: 'Month' };
// The chart that represents each drill dimension (hidden on its own drill page).
const DIM_CHART: Record<string, string> = { stage: 'funnel', rep: 'winRateByRep', source: 'bySource', month: 'trend' };
const COMPUTE: Record<string, (l: LeadRow[]) => Array<Record<string, unknown>>> = {
  funnel: computeFunnel, trend: computeTrend, winRateByRep: computeByRep, bySource: computeBySource,
};
const MATCH: Record<string, (l: LeadRow, v: string) => boolean> = {
  stage: (l, v) => l.stageName === v,
  rep: (l, v) => l.repName === v,
  source: (l, v) => l.sourceName === v,
  month: (l, v) => l.yearMonth === v,
};

export function DrillPage() {
  const { dim = 'stage', value = '' } = useParams();
  const decoded = decodeURIComponent(value);
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getLeads();
        if (!cancelled) setLeads(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    const f = MATCH[dim];
    return f ? (leads ?? []).filter((l) => f(l, decoded)) : leads ?? [];
  }, [leads, dim, decoded]);
  const kpis = useMemo(() => computeKpis(rows), [rows]);
  const otherCharts = useMemo(() => charts.filter((c) => c.name !== DIM_CHART[dim]), [dim]);

  useEffect(() => {
    if (!leads) return;
    for (const c of otherCharts) {
      const el = chartRefs.current[c.name];
      if (el) void renderVisual(el, c, COMPUTE[c.name](rows));
    }
  }, [leads, rows, otherCharts]);

  const table = useMemo(() => [...rows].sort((a, b) => b.estimatedValue - a.estimatedValue), [rows]);

  const KPIS = [
    { label: 'Leads', value: num(kpis.totalLeads) },
    { label: 'Win rate', value: pct(kpis.winRate) },
    { label: 'Open pipeline', value: money(kpis.pipelineValue) },
    { label: 'Won value', value: money(kpis.wonValue) },
    { label: 'Stalled', value: num(kpis.stalledLeads) },
  ];
  const captions: Record<string, string> = {
    funnel: 'By stage', winRateByRep: 'Win rate by rep', bySource: 'By source', trend: 'By month',
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[oklch(0.965_0.03_166)] via-surface to-surface text-ink">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-5 px-6 py-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {dim === 'stage' && <span className="h-3 w-3 rounded-full" style={{ background: STAGE_DOT[decoded] ?? '#94a3b8' }} />}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                {DIM_LABEL[dim] ?? 'Drill'} drill-through
              </div>
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{decoded}</h1>
            </div>
          </div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-4 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-rail"
          >
            <svg className="h-3.5 w-3.5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
            </svg>
            Back to dashboard
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {KPIS.map((k) => (
            <div key={k.label} className={`${card} p-5`}>
              <div className="text-[11px] font-medium uppercase tracking-wider text-faint">{k.label}</div>
              {loading ? (
                <div className="mt-2 h-7 w-20 animate-pulse rounded bg-rail" />
              ) : (
                <div className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums text-ink">{k.value}</div>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {otherCharts.map((c) => (
            <section key={c.name} className={`${card} p-5`}>
              <h2 className="mb-3 text-[13px] font-semibold text-ink">{captions[c.name] ?? c.title}</h2>
              <div ref={(el) => { chartRefs.current[c.name] = el; }} className="min-h-[220px] w-full" />
            </section>
          ))}
        </div>

        <section className={`${card} flex flex-col`}>
          <header className="border-b border-line px-4 py-3">
            <h2 className="text-[13px] font-semibold text-ink">{decoded} · {rows.length} leads</h2>
          </header>
          <div className="max-h-[460px] overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Rep</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 text-right font-medium">Value</th>
                  <th className="px-4 py-2.5 text-right font-medium">Idle</th>
                </tr>
              </thead>
              <tbody>
                {!loading && table.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-faint">No leads here</td></tr>
                )}
                {table.map((l, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0 hover:bg-rail/50">
                    <td className="px-4 py-2 font-medium text-ink">{l.customerName}</td>
                    <td className="px-4 py-2 text-muted">{l.repName}</td>
                    <td className="px-4 py-2 text-muted">{l.sourceName}</td>
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
        </section>
      </main>
    </div>
  );
}
