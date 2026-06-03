// Register every entity here so the Rayfin client can generate type-safe GraphQL proxies.
// Update this whenever you add or remove an entity.
import type { Rep } from './Rep.js';
import type { LeadSource } from './LeadSource.js';
import type { Lead } from './Lead.js';
import type { StageEvent } from './StageEvent.js';
import type { Quote } from './Quote.js';

export type LeadPipelineSchema = {
  Rep: Rep;
  LeadSource: LeadSource;
  Lead: Lead;
  StageEvent: StageEvent;
  Quote: Quote;
};
