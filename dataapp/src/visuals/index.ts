// Visual registry: pairs each DAX query with its Vega-Lite spec.
// .vl.json files import as JSON; .dax files import as raw text.
// The ?raw and JSON import syntax below is Vite convention (the data app
// template runs on Vite, served at localhost:5173).
import funnelSpec from './funnel.vl.json';
import leadsTrendSpec from './leadsTrend.vl.json';
import winRateByRepSpec from './winRateByRep.vl.json';
import bySourceSpec from './bySource.vl.json';

import funnelDax from './funnel.dax?raw';
import leadsTrendDax from './leadsTrend.dax?raw';
import winRateByRepDax from './winRateByRep.dax?raw';
import bySourceDax from './bySource.dax?raw';

import type { VisualDef } from '../lib/renderVisual.js';

export const visuals: VisualDef[] = [
  { name: 'funnel', dax: funnelDax, spec: funnelSpec as Record<string, unknown> },
  { name: 'leadsTrend', dax: leadsTrendDax, spec: leadsTrendSpec as Record<string, unknown> },
  { name: 'winRateByRep', dax: winRateByRepDax, spec: winRateByRepSpec as Record<string, unknown> },
  { name: 'bySource', dax: bySourceDax, spec: bySourceSpec as Record<string, unknown> },
];

// KPI cards use ./kpis.dax (a single-row query). Bind each returned column to a
// single-value card component from the data app template.
