import { entity, role, uuid, text, int } from '@microsoft/rayfin-core';

// Per-rep performance. Win rate is derived in the UI from wonLeads / closedLeads
// (closed = won + lost), matching the model's [Win Rate] definition exactly.
@entity()
@role('authenticated', ['read'])
export class MetricRep {
  @uuid() id!: string;
  @text({ max: 120 }) repName!: string;
  @int() wonLeads!: number;
  @int() closedLeads!: number;
  @int() totalLeads!: number;
}
