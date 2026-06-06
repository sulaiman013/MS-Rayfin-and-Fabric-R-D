// The dashboard's data layer. Reads the materialized Metric* tables through the
// normal Rayfin data API (same auth as the Board). Those tables are refreshed
// server-side from the Direct Lake semantic model's governed measures, so the
// browser never signs in to Power BI. Win rate is derived here from the model's
// won / (won + lost) counts to match the [Win Rate] measure exactly.
import { getRayfinClient, isLocalBackend } from '@/services/rayfinClient';

export interface DashboardKpis {
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  openLeads: number;
  pipelineValue: number;
  wonValue: number;
  stalledLeads: number;
  refreshedAt?: string | Date;
}

type Row = Record<string, unknown>;

export interface DashboardData {
  kpis: DashboardKpis | null;
  funnel: Row[]; //   { StageName, StageOrder, Leads }
  trend: Row[]; //    { YearMonth, 'Total Leads', 'Won Leads' }
  byRep: Row[]; //    { RepName, 'Win Rate', 'Won Leads', 'Total Leads' }
  bySource: Row[]; // { LeadSourceName, 'Total Leads', 'Won Leads', 'Won Value' }
}

const rate = (won: number, closed: number) => (closed > 0 ? won / closed : 0);

// Local-dev/preview data (npm run dev) mirrors the validated model numbers.
const LOCAL: DashboardData = {
  kpis: { totalLeads: 401, wonLeads: 201, lostLeads: 174, openLeads: 26, pipelineValue: 221550, wonValue: 1578350, stalledLeads: 22 },
  funnel: [
    { StageName: 'New', StageOrder: 1, Leads: 401 },
    { StageName: 'Consult', StageOrder: 2, Leads: 398 },
    { StageName: 'Quote', StageOrder: 3, Leads: 387 },
    { StageName: 'Won', StageOrder: 4, Leads: 201 },
    { StageName: 'Lost', StageOrder: 5, Leads: 174 },
  ],
  trend: ['2024-07', '2024-09', '2024-11', '2025-01', '2025-03', '2025-06', '2025-09', '2025-12', '2026-02', '2026-04'].map(
    (m, i) => ({ YearMonth: m, 'Total Leads': 14 + i * 3, 'Won Leads': 7 + Math.round(i * 1.4) }),
  ),
  byRep: [
    { RepName: 'Maria Lopez', 'Win Rate': 0.58, 'Won Leads': 74, 'Total Leads': 128 },
    { RepName: 'Priya Shah', 'Win Rate': 0.55, 'Won Leads': 39, 'Total Leads': 71 },
    { RepName: 'Devon Carter', 'Win Rate': 0.52, 'Won Leads': 58, 'Total Leads': 112 },
    { RepName: 'Sam Okafor', 'Win Rate': 0.49, 'Won Leads': 43, 'Total Leads': 88 },
  ],
  bySource: [
    { LeadSourceName: 'Houzz', 'Total Leads': 96, 'Won Leads': 49, 'Won Value': 392000 },
    { LeadSourceName: 'Google Ads', 'Total Leads': 92, 'Won Leads': 41, 'Won Value': 318000 },
    { LeadSourceName: 'Referral Past Client', 'Total Leads': 80, 'Won Leads': 50, 'Won Value': 430000 },
    { LeadSourceName: 'Showroom Walk-in', 'Total Leads': 64, 'Won Leads': 34, 'Won Value': 250000 },
    { LeadSourceName: 'Instagram', 'Total Leads': 48, 'Won Leads': 21, 'Won Value': 150000 },
  ],
};

export async function getDashboardData(): Promise<DashboardData> {
  if (isLocalBackend()) return LOCAL;
  const c = getRayfinClient();
  const [kpiRows, funnelRows, trendRows, repRows, sourceRows] = await Promise.all([
    c.data.MetricKpi
      .select(['totalLeads', 'wonLeads', 'lostLeads', 'openLeads', 'pipelineValue', 'wonValue', 'stalledLeads', 'refreshedAt'])
      .orderBy({ refreshedAt: 'desc' })
      .execute(),
    c.data.MetricFunnel.select(['stageName', 'stageOrder', 'leads']).orderBy({ stageOrder: 'asc' }).execute(),
    c.data.MetricTrend.select(['yearMonth', 'totalLeads', 'wonLeads']).orderBy({ yearMonth: 'asc' }).execute(),
    c.data.MetricRep.select(['repName', 'wonLeads', 'closedLeads', 'totalLeads']).execute(),
    c.data.MetricSource.select(['sourceName', 'totalLeads', 'wonLeads', 'wonValue']).orderBy({ totalLeads: 'desc' }).execute(),
  ]);

  return {
    kpis: (kpiRows[0] as DashboardKpis | undefined) ?? null,
    funnel: funnelRows.map((x) => ({ StageName: x.stageName, StageOrder: x.stageOrder, Leads: x.leads })),
    trend: trendRows.map((x) => ({ YearMonth: x.yearMonth, 'Total Leads': x.totalLeads, 'Won Leads': x.wonLeads })),
    byRep: repRows
      .map((x) => ({
        RepName: x.repName,
        'Win Rate': rate(x.wonLeads, x.closedLeads),
        'Won Leads': x.wonLeads,
        'Total Leads': x.totalLeads,
      }))
      .sort((a, b) => (b['Win Rate'] as number) - (a['Win Rate'] as number)),
    bySource: sourceRows.map((x) => ({
      LeadSourceName: x.sourceName,
      'Total Leads': x.totalLeads,
      'Won Leads': x.wonLeads,
      'Won Value': x.wonValue,
    })),
  };
}
