import { entity, role, uuid, text, int, decimal } from '@microsoft/rayfin-core';

// Per-source volume and value, from the model.
@entity()
@role('authenticated', ['read'])
export class MetricSource {
  @uuid() id!: string;
  @text({ max: 120 }) sourceName!: string;
  @int() totalLeads!: number;
  @int() wonLeads!: number;
  @decimal() wonValue!: number;
}
