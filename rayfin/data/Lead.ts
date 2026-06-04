import { entity, role, uuid, text, email, decimal, date, set, one, many } from '@microsoft/rayfin-core';
import { Rep } from './Rep.js';
import { LeadSource } from './LeadSource.js';
import { StageEvent } from './StageEvent.js';
import { Quote } from './Quote.js';

// The opportunity. `stage` holds the current funnel position; the full history
// lives in StageEvent so we can compute time-in-stage and funnel conversion.
@entity()
@role('authenticated', ['create', 'read', 'update', 'delete'])
// To scope each rep to only their own leads later, replace the line above with a policy, e.g.:
// @role('authenticated', ['create', 'read', 'update', 'delete'], { policy: (claims, item) => claims.sub.eq(item.rep_id) })
export class Lead {
  @uuid() id!: string;
  @text({ max: 160 }) customerName!: string;
  @email({ optional: true }) customerEmail?: string;
  @text({ optional: true, max: 40 }) customerPhone?: string;
  @text({ optional: true, max: 120 }) projectType?: string; // "Walk-in closet", "Garage", "Pantry"
  @decimal({ optional: true }) estimatedValue?: number;
  @set('new', 'consult', 'quote', 'won', 'lost') stage!: 'new' | 'consult' | 'quote' | 'won' | 'lost';
  @date() createdAt!: Date;
  @date() updatedAt!: Date;

  // Foreign keys (convention: {navigationProperty}_id)
  @text() rep_id!: string;
  @one(() => Rep) rep?: Rep;

  @text() leadSource_id!: string;
  @one(() => LeadSource) leadSource?: LeadSource;

  @many(() => StageEvent) stageEvents?: StageEvent[];
  @many(() => Quote) quotes?: Quote[];
}
