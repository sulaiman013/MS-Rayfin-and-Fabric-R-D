import { entity, role, uuid, int, decimal, date } from '@microsoft/rayfin-core';

// Materialized KPI snapshot. One row, refreshed server-side from the Direct Lake
// semantic model's governed measures (Execute DAX), so the dashboard reads numbers
// through the normal data API with no per-user Power BI sign-in. Win rate is derived
// in the UI from wonLeads / (wonLeads + lostLeads) to keep it exact.
@entity()
@role('authenticated', ['read'])
export class MetricKpi {
  @uuid() id!: string;
  @int() totalLeads!: number;
  @int() wonLeads!: number;
  @int() lostLeads!: number;
  @int() openLeads!: number;
  @decimal() pipelineValue!: number;
  @decimal() wonValue!: number;
  @int() stalledLeads!: number;
  @date() refreshedAt!: Date;
}
