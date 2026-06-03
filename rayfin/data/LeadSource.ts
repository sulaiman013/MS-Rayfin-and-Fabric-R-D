import { entity, role, uuid, text, set, date, many } from '@microsoft/rayfin-core';
import type { Lead } from './Lead.js';

// Where a lead came from. Name is the specific source, channel is the category.
@entity()
@role('authenticated', ['create', 'read', 'update', 'delete'])
export class LeadSource {
  @uuid() id!: string;
  @text({ max: 120, unique: true }) name!: string; // e.g. "Google Ads", "Houzz", "Referral - Past Client"
  @set('web', 'referral', 'showroom', 'event', 'ad', 'partner') channel!:
    | 'web' | 'referral' | 'showroom' | 'event' | 'ad' | 'partner';
  @date() createdAt!: Date;

  @many(() => Lead) leads?: Lead[];
}
