import { getRayfinClient, isLocalBackend } from './rayfinClient';

export type Stage = 'new' | 'consult' | 'quote' | 'won' | 'lost';
export const STAGES: Stage[] = ['new', 'consult', 'quote', 'won', 'lost'];
export const OPEN_STAGES: Stage[] = ['new', 'consult', 'quote'];

export interface Rep {
  id: string;
  name: string;
  email: string;
  showroom: string;
  active: boolean;
}

export interface LeadSource {
  id: string;
  name: string;
  channel: string;
}

export interface Lead {
  id: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  projectType?: string;
  estimatedValue?: number;
  stage: Stage;
  createdAt: Date;
  updatedAt: Date;
  rep_id: string;
  leadSource_id: string;
}

export interface NewLeadInput {
  customerName: string;
  projectType?: string;
  estimatedValue?: number;
  rep_id: string;
  leadSource_id: string;
}

/** The stage a lead advances into next. Returns null when it cannot advance. */
export function nextStage(stage: Stage): Stage | null {
  if (stage === 'quote') return 'won';
  const i = OPEN_STAGES.indexOf(stage);
  return i === -1 ? null : OPEN_STAGES[i + 1] ?? null;
}

// Local-dev seed (mirrors seed/seed_sample_data.sql) so `npm run dev` shows a
// populated board with no backend configured.
const uid = () => crypto.randomUUID();
const repId = { a: uid(), b: uid(), c: uid() };
const srcId = { web: uid(), houzz: uid(), ref: uid(), show: uid() };

let memReps: Rep[] = [
  { id: repId.a, name: 'Maria Lopez', email: 'maria@example.com', showroom: 'austin', active: true },
  { id: repId.b, name: 'Devon Carter', email: 'devon@example.com', showroom: 'la', active: true },
  { id: repId.c, name: 'Priya Shah', email: 'priya@example.com', showroom: 'online', active: true },
];

let memSources: LeadSource[] = [
  { id: srcId.web, name: 'Google Ads', channel: 'ad' },
  { id: srcId.houzz, name: 'Houzz', channel: 'web' },
  { id: srcId.ref, name: 'Referral - Past Client', channel: 'referral' },
  { id: srcId.show, name: 'Showroom Walk-in', channel: 'showroom' },
];

function seed(
  customerName: string, projectType: string, estimatedValue: number,
  stage: Stage, rep_id: string, leadSource_id: string, created: string,
): Lead {
  const d = new Date(created);
  return { id: uid(), customerName, projectType, estimatedValue, stage, rep_id, leadSource_id, createdAt: d, updatedAt: d };
}

let memLeads: Lead[] = [
  seed('Anderson Family', 'Walk-in closet', 12500, 'won', repId.a, srcId.ref, '2025-02-03'),
  seed('B. Nguyen', 'Garage', 8200, 'quote', repId.b, srcId.houzz, '2025-02-10'),
  seed('C. Patel', 'Pantry', 3100, 'lost', repId.a, srcId.web, '2025-02-12'),
  seed('Dawson LLC', 'Walk-in closet', 15800, 'won', repId.b, srcId.show, '2025-02-15'),
  seed('E. Romano', 'Home office', 6400, 'consult', repId.c, srcId.houzz, '2025-03-01'),
  seed('F. Khan', 'Garage', 7000, 'new', repId.c, srcId.web, '2025-03-10'),
  seed('Gupta Home', 'Walk-in closet', 13900, 'won', repId.a, srcId.ref, '2025-03-04'),
  seed('H. Mueller', 'Pantry', 2900, 'lost', repId.b, srcId.web, '2025-03-06'),
];

export async function getReps(): Promise<Rep[]> {
  if (isLocalBackend()) return [...memReps];
  const rows = await getRayfinClient()
    .data.Rep.select(['id', 'name', 'email', 'showroom', 'active'])
    .execute();
  return rows as Rep[];
}

export async function getLeadSources(): Promise<LeadSource[]> {
  if (isLocalBackend()) return [...memSources];
  const rows = await getRayfinClient()
    .data.LeadSource.select(['id', 'name', 'channel'])
    .execute();
  return rows as LeadSource[];
}

export async function getLeads(): Promise<Lead[]> {
  if (isLocalBackend()) {
    return [...memLeads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const rows = await getRayfinClient()
    .data.Lead.select([
      'id', 'customerName', 'customerEmail', 'customerPhone', 'projectType',
      'estimatedValue', 'stage', 'createdAt', 'updatedAt', 'rep_id', 'leadSource_id',
    ])
    .orderBy({ createdAt: 'desc' })
    .execute();
  return (rows as Lead[]).map((l) => ({
    ...l,
    createdAt: new Date(l.createdAt),
    updatedAt: new Date(l.updatedAt),
  }));
}

export async function createLead(input: NewLeadInput): Promise<Lead> {
  const now = new Date();
  if (isLocalBackend()) {
    const lead: Lead = { id: uid(), stage: 'new', createdAt: now, updatedAt: now, ...input };
    memLeads.push(lead);
    return lead;
  }
  const client = getRayfinClient();
  const lead = (await client.data.Lead.create({
    customerName: input.customerName,
    projectType: input.projectType,
    estimatedValue: input.estimatedValue,
    stage: 'new',
    createdAt: now,
    updatedAt: now,
    rep_id: input.rep_id,
    leadSource_id: input.leadSource_id,
  })) as Lead;
  await client.data.StageEvent.create({ lead_id: lead.id, stage: 'new', enteredAt: now });
  return lead;
}

/** Advance an open lead to its next stage, recording a StageEvent for the funnel. */
export async function advanceLead(lead: Lead): Promise<Stage | null> {
  const next = nextStage(lead.stage);
  if (!next) return null;
  await moveLead(lead, next);
  return next;
}

export async function markLost(lead: Lead): Promise<void> {
  await moveLead(lead, 'lost');
}

async function moveLead(lead: Lead, stage: Stage): Promise<void> {
  const now = new Date();
  if (isLocalBackend()) {
    const l = memLeads.find((x) => x.id === lead.id);
    if (l) {
      l.stage = stage;
      l.updatedAt = now;
    }
    return;
  }
  const client = getRayfinClient();
  await client.data.Lead.update({ id: lead.id }, { stage, updatedAt: now });
  await client.data.StageEvent.create({ lead_id: lead.id, stage, enteredAt: now });
}
