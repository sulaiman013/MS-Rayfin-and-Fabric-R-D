// Chart visual registry: pairs each DAX query with its Vega-Lite spec.
import type { VisualDef } from './renderVisual';
import funnelDax from '../visuals/funnel.dax?raw';
import funnelSpec from '../visuals/funnel.vl.json';
import trendDax from '../visuals/leadsTrend.dax?raw';
import trendSpec from '../visuals/leadsTrend.vl.json';
import repDax from '../visuals/winRateByRep.dax?raw';
import repSpec from '../visuals/winRateByRep.vl.json';
import sourceDax from '../visuals/bySource.dax?raw';
import sourceSpec from '../visuals/bySource.vl.json';

export interface Chart extends VisualDef {
  title: string;
}

export const charts: Chart[] = [
  { name: 'funnel', title: 'Leads by stage', dax: funnelDax, spec: funnelSpec as Record<string, unknown> },
  { name: 'trend', title: 'Leads by month', dax: trendDax, spec: trendSpec as Record<string, unknown> },
  { name: 'winRateByRep', title: 'Win rate by rep', dax: repDax, spec: repSpec as Record<string, unknown> },
  { name: 'bySource', title: 'Leads by source', dax: sourceDax, spec: sourceSpec as Record<string, unknown> },
];
