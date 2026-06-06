import { entity, role, uuid, text, int } from '@microsoft/rayfin-core';

// Funnel rows: distinct leads reaching each stage, in funnel order. Refreshed from
// the model's [Leads Reaching Stage] measure.
@entity()
@role('authenticated', ['read'])
export class MetricFunnel {
  @uuid() id!: string;
  @text({ max: 40 }) stageName!: string;
  @int() stageOrder!: number;
  @int() leads!: number;
}
