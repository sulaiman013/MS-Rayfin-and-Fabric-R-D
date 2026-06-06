// Lead-level data + client-side aggregation. The dashboard loads every lead once
// (from the MetricLead table via the data API), then recomputes KPIs and charts from
// the current slicer + click selection. This is what makes the slicers, click-to-filter
// interactions, and the details table work without re-querying the server.
import { getRayfinClient, isLocalBackend } from '@/services/rayfinClient';

export interface LeadRow {
  customerName: string;
  repName: string;
  showroom: string;
  sourceName: string;
  projectType: string;
  stageName: string;
  stageOrder: number;
  reachedMask: number;
  estimatedValue: number;
  createdDateKey: number;
  yearMonth: string;
  isWon: number;
  isLost: number;
  isOpen: number;
  isStalled: number;
  daysIdle: number;
}

export type FilterDim = 'rep' | 'source' | 'stage' | 'month' | 'showroom';

export interface Slicers {
  reps: string[];
  sources: string[];
  stages: string[];
  showrooms: string[];
  monthFrom: string | null;
  monthTo: string | null;
}

export const EMPTY_SLICERS: Slicers = {
  reps: [], sources: [], stages: [], showrooms: [], monthFrom: null, monthTo: null,
};

export interface CrossFilter {
  dim: FilterDim;
  value: string;
  label: string;
  order?: number; // stage funnel order, for the "reached stage" predicate
}

export function slicersActive(s: Slicers): boolean {
  return (
    s.reps.length > 0 || s.sources.length > 0 || s.stages.length > 0 ||
    s.showrooms.length > 0 || s.monthFrom != null || s.monthTo != null
  );
}

export function matchesSlicers(l: LeadRow, s: Slicers): boolean {
  if (s.reps.length && !s.reps.includes(l.repName)) return false;
  if (s.sources.length && !s.sources.includes(l.sourceName)) return false;
  if (s.stages.length && !s.stages.includes(l.stageName)) return false;
  if (s.showrooms.length && !s.showrooms.includes(l.showroom)) return false;
  if (s.monthFrom && l.yearMonth < s.monthFrom) return false;
  if (s.monthTo && l.yearMonth > s.monthTo) return false;
  return true;
}

export function matchesCross(l: LeadRow, c: CrossFilter | null): boolean {
  if (!c) return true;
  switch (c.dim) {
    case 'rep': return l.repName === c.value;
    case 'source': return l.sourceName === c.value;
    case 'showroom': return l.showroom === c.value;
    case 'month': return l.yearMonth === c.value;
    // Filter by the lead's current stage. ("Reached stage" would make New match
    // every lead, since all leads pass through New, so clicking it changed nothing.)
    case 'stage': return l.stageName === c.value;
  }
}

// ---- aggregations (all from a lead array) --------------------------------
const FUNNEL_STAGES: Array<[string, number]> = [
  ['New', 1], ['Consult', 2], ['Quote', 3], ['Won', 4], ['Lost', 5],
];

export interface Kpis {
  totalLeads: number; wonLeads: number; lostLeads: number; openLeads: number;
  pipelineValue: number; wonValue: number; stalledLeads: number; winRate: number;
}

export function computeKpis(leads: LeadRow[]): Kpis {
  let won = 0, lost = 0, open = 0, pipeline = 0, wonValue = 0, stalled = 0;
  for (const l of leads) {
    won += l.isWon; lost += l.isLost; open += l.isOpen; stalled += l.isStalled;
    if (l.isOpen) pipeline += l.estimatedValue;
    if (l.isWon) wonValue += l.estimatedValue;
  }
  return {
    totalLeads: leads.length, wonLeads: won, lostLeads: lost, openLeads: open,
    pipelineValue: pipeline, wonValue, stalledLeads: stalled,
    winRate: won + lost > 0 ? won / (won + lost) : 0,
  };
}

export function computeFunnel(leads: LeadRow[]): Array<Record<string, unknown>> {
  // Current-stage count, so the bar, the tooltip, the click-filter, and the
  // drill-through all report the same number for each stage (no reaching-vs-current
  // mismatch).
  return FUNNEL_STAGES.map(([StageName, StageOrder]) => ({
    StageName, StageOrder,
    Leads: leads.reduce((n, l) => n + (l.stageName === StageName ? 1 : 0), 0),
  }));
}

export function computeTrend(leads: LeadRow[]): Array<Record<string, unknown>> {
  const m = new Map<string, { t: number; w: number }>();
  for (const l of leads) {
    const e = m.get(l.yearMonth) ?? { t: 0, w: 0 };
    e.t += 1; e.w += l.isWon; m.set(l.yearMonth, e);
  }
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([YearMonth, v]) => ({ YearMonth, 'Total Leads': v.t, 'Won Leads': v.w }));
}

export function computeByRep(leads: LeadRow[]): Array<Record<string, unknown>> {
  const m = new Map<string, { w: number; c: number; t: number }>();
  for (const l of leads) {
    const e = m.get(l.repName) ?? { w: 0, c: 0, t: 0 };
    e.w += l.isWon; e.c += l.isWon + l.isLost; e.t += 1; m.set(l.repName, e);
  }
  return [...m.entries()]
    .map(([RepName, v]) => ({ RepName, 'Win Rate': v.c > 0 ? v.w / v.c : 0, 'Won Leads': v.w, 'Total Leads': v.t }))
    .sort((a, b) => (b['Win Rate'] as number) - (a['Win Rate'] as number));
}

export function computeBySource(leads: LeadRow[]): Array<Record<string, unknown>> {
  const m = new Map<string, { t: number; w: number; wv: number }>();
  for (const l of leads) {
    const e = m.get(l.sourceName) ?? { t: 0, w: 0, wv: 0 };
    e.t += 1; e.w += l.isWon; if (l.isWon) e.wv += l.estimatedValue; m.set(l.sourceName, e);
  }
  return [...m.entries()]
    .map(([LeadSourceName, v]) => ({ LeadSourceName, 'Total Leads': v.t, 'Won Leads': v.w, 'Won Value': v.wv }))
    .sort((a, b) => (b['Total Leads'] as number) - (a['Total Leads'] as number));
}

export function distinct(leads: LeadRow[], key: keyof LeadRow): string[] {
  return [...new Set(leads.map((l) => String(l[key])))].sort();
}

// ---- data access ---------------------------------------------------------
// Translytical read: historical leads come from the materialized MetricLead table
// (governed, static), and LIVE leads come straight from the operational Lead table
// the board writes to, so a lead added on the board shows up here on the next read.
const STAGE_CAP: Record<string, string> = { new: 'New', consult: 'Consult', quote: 'Quote', won: 'Won', lost: 'Lost' };
const STAGE_ORD: Record<string, number> = { new: 1, consult: 2, quote: 3, won: 4, lost: 5 };

interface LiveLead {
  customerName: string;
  projectType?: string;
  estimatedValue?: number;
  stage: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  rep_id: string;
  leadSource_id: string;
}

function liveToLeadRow(
  l: LiveLead,
  reps: Map<string, { name: string; showroom: string }>,
  sources: Map<string, string>,
): LeadRow {
  const stageName = STAGE_CAP[l.stage] ?? 'New';
  const stageOrder = STAGE_ORD[l.stage] ?? 1;
  const created = new Date(l.createdAt);
  const updated = new Date(l.updatedAt);
  const isOpen = stageOrder <= 3 ? 1 : 0;
  const daysIdle = Math.max(0, Math.floor((Date.now() - updated.getTime()) / 86_400_000));
  const rep = reps.get(l.rep_id);
  return {
    customerName: l.customerName,
    repName: rep?.name ?? 'Unknown',
    showroom: rep?.showroom ?? 'unknown',
    sourceName: sources.get(l.leadSource_id) ?? 'Unknown',
    projectType: l.projectType ?? 'Unknown',
    stageName,
    stageOrder,
    reachedMask: 1 << stageOrder, // current-stage funnel does not use this
    estimatedValue: l.estimatedValue ?? 0,
    createdDateKey: created.getFullYear() * 10000 + (created.getMonth() + 1) * 100 + created.getDate(),
    yearMonth: `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`,
    isWon: l.stage === 'won' ? 1 : 0,
    isLost: l.stage === 'lost' ? 1 : 0,
    isOpen,
    isStalled: isOpen && daysIdle > 14 ? 1 : 0,
    daysIdle,
  };
}

export async function getLeads(): Promise<LeadRow[]> {
  if (isLocalBackend()) return LOCAL_LEADS;
  const c = getRayfinClient();
  const [histRows, liveLeads, reps, sources] = await Promise.all([
    c.data.MetricLead
      .select([
        'customerName', 'repName', 'showroom', 'sourceName', 'projectType', 'stageName',
        'stageOrder', 'reachedMask', 'estimatedValue', 'createdDateKey', 'yearMonth',
        'isWon', 'isLost', 'isOpen', 'isStalled', 'daysIdle',
      ])
      .first(5000)
      .execute(),
    c.data.Lead
      .select(['customerName', 'projectType', 'estimatedValue', 'stage', 'createdAt', 'updatedAt', 'rep_id', 'leadSource_id'])
      .first(5000)
      .execute(),
    c.data.Rep.select(['id', 'name', 'showroom']).execute(),
    c.data.LeadSource.select(['id', 'name']).execute(),
  ]);
  const repMap = new Map(
    (reps as Array<{ id: string; name: string; showroom: string }>).map((r) => [r.id, { name: r.name, showroom: r.showroom }]),
  );
  const srcMap = new Map((sources as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]));
  const hist = histRows as unknown as LeadRow[];
  const live = (liveLeads as unknown as LiveLead[]).map((l) => liveToLeadRow(l, repMap, srcMap));
  return [...hist, ...live];
}

// Deterministic local sample so `npm run dev` shows the interactions offline.
const LOCAL_LEADS: LeadRow[] = (() => {
  const reps: Array<[string, string]> = [
    ['Maria Lopez', 'austin'], ['Devon Carter', 'la'], ['Priya Shah', 'online'], ['Sam Okafor', 'dallas'],
  ];
  const sources = ['Houzz', 'Google Ads', 'Referral Past Client', 'Showroom Walk-in', 'Instagram'];
  const projects: Array<[string, number]> = [
    ['Walk-in closet', 13000], ['Garage storage', 7000], ['Pantry', 3000], ['Home office', 6500],
    ['Mudroom', 5200], ['Reach-in closet', 2600], ['Laundry room', 4200],
  ];
  const months = ['2024-08', '2024-10', '2024-12', '2025-02', '2025-04', '2025-06', '2025-08', '2025-10', '2025-12', '2026-02', '2026-04'];
  const masks: Record<string, [number, number]> = {
    new: [1, 0b000010], consult: [2, 0b000110], quote: [3, 0b001110], won: [4, 0b011110], lost: [5, 0b101110],
  };
  const plan = [
    ...Array(34).fill('won'), ...Array(26).fill('lost'), ...Array(16).fill('quote'),
    ...Array(14).fill('consult'), ...Array(12).fill('new'),
  ];
  let s = 987654321;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const out: LeadRow[] = [];
  for (let i = 0; i < plan.length; i++) {
    const stage = plan[i] as keyof typeof masks;
    const [rep, showroom] = pick(reps);
    const [projectType, base] = pick(projects);
    const ym = pick(months);
    const [order, mask] = masks[stage];
    const value = Math.round((base * (0.7 + rnd() * 0.6)) / 100) * 100;
    const daysIdle = Math.floor(rnd() * 45);
    const isOpen = order <= 3 ? 1 : 0;
    out.push({
      customerName: `${cap(pick(['anderson', 'bennett', 'carlsson', 'delgado', 'emerson', 'harper', 'novak', 'quinn', 'sharma', 'whitaker']))} ${cap(pick(['family', 'residence', 'home', 'loft']))}`,
      repName: rep, showroom, sourceName: pick(sources), projectType,
      stageName: cap(stage), stageOrder: order, reachedMask: mask, estimatedValue: value,
      createdDateKey: Number(ym.replace('-', '') + '15'), yearMonth: ym,
      isWon: stage === 'won' ? 1 : 0, isLost: stage === 'lost' ? 1 : 0, isOpen,
      isStalled: isOpen && daysIdle > 14 ? 1 : 0, daysIdle,
    });
  }
  return out;
})();
