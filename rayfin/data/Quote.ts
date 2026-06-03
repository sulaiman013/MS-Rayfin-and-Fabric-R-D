import { entity, role, uuid, text, decimal, date, set, one } from '@microsoft/rayfin-core';
import type { Lead } from './Lead.js';

// A quote issued for a lead. respondedAt is null until the customer answers,
// which lets us measure quote response time and acceptance rate.
@entity()
@role('authenticated', ['create', 'read', 'update', 'delete'])
export class Quote {
  @uuid() id!: string;

  @text() lead_id!: string;
  @one(() => Lead) lead?: Lead;

  @decimal() amount!: number;
  @set('draft', 'sent', 'accepted', 'rejected') status!: 'draft' | 'sent' | 'accepted' | 'rejected';
  @date() issuedAt!: Date;
  @date({ optional: true }) respondedAt?: Date;
}
