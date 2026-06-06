import { entity, role, uuid, text, int } from '@microsoft/rayfin-core';

// Monthly trend: total vs won leads per calendar month, from the model.
@entity()
@role('authenticated', ['read'])
export class MetricTrend {
  @uuid() id!: string;
  @text({ max: 10 }) yearMonth!: string; // e.g. "2025-03"
  @int() totalLeads!: number;
  @int() wonLeads!: number;
}
