import { entity, role, uuid, text, date, set, one } from '@microsoft/rayfin-core';
import { Lead } from './Lead.js';

// One row per funnel transition. Write a new StageEvent whenever a lead moves
// stage. This is what powers time-in-stage and funnel conversion analytics.
@entity()
@role('authenticated', ['create', 'read', 'update', 'delete'])
export class StageEvent {
  @uuid() id!: string;

  @uuid() lead_id!: string;
  @one(() => Lead) lead?: Lead;

  @set('new', 'consult', 'quote', 'won', 'lost') stage!: 'new' | 'consult' | 'quote' | 'won' | 'lost';
  @date() enteredAt!: Date;
  @text({ optional: true, max: 500 }) note?: string;
}
