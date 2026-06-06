// Generates a deliberately MESSY historical "legacy CRM export" of custom-closets
// sales leads as a single wide flat CSV. This is the bronze source for the medallion
// pipeline. ~400 true leads are generated cleanly (deterministic), then emitted with
// real-world data-quality issues, plus ~25 duplicates and ~5 corrupted/shifted rows.
//
// The CLEAN truth is computed in code and printed as ground-truth aggregates so the
// gold layer, the semantic model, and the dashboard can be verified against exact numbers.
//
// Run: node gen_historical_csv.mjs   ->   seed/historical_leads_export.csv
import { writeFileSync, mkdirSync } from 'fs';

const OUT = 'C:/Users/Lenovo/Desktop/portfolio/Rayfin Lead Pipeline POC/fabric_build/seed';
mkdirSync(OUT, { recursive: true });

// ---------- deterministic PRNG (mulberry32) ----------
let _s = 0x9e3779b9 ^ 1234567; // fixed seed -> stable reruns
function rnd() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
function weighted(pairs) { // [[value, weight], ...]
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = rnd() * total;
  for (const [v, wt] of pairs) { if ((r -= wt) <= 0) return v; }
  return pairs[pairs.length - 1][0];
}

// ---------- canonical (clean target) members ----------
const REPS = ['Maria Lopez', 'Devon Carter', 'Priya Shah', 'Sam Okafor'];
const REP_SHOWROOM = { 'Maria Lopez': 'austin', 'Devon Carter': 'la', 'Priya Shah': 'online', 'Sam Okafor': 'dallas' };
const SOURCES = ['Google Ads', 'Houzz', 'Referral Past Client', 'Showroom Walk-in', 'Instagram'];
const SOURCE_CHANNEL = { 'Google Ads': 'ad', 'Houzz': 'web', 'Referral Past Client': 'referral', 'Showroom Walk-in': 'showroom', 'Instagram': 'ad' };
const PROJECTS = ['Walk-in closet', 'Garage', 'Pantry', 'Home office'];
const PROJ_VALUE = { 'Walk-in closet': [12500, 3500], 'Garage': [6500, 2500], 'Pantry': [2800, 1200], 'Home office': [5000, 2200] };

// ---------- dirty variant maps (raw -> canonical via these lists) ----------
const SOURCE_VARIANTS = {
  'Google Ads': ['Google Ads', 'google ads', 'GoogleAds', 'Adwords', 'Google'],
  'Houzz': ['Houzz', 'houz', 'HOUZZ', 'houzz.com', 'Houzz.com '],
  'Referral Past Client': ['Referral', 'referral - past client', 'Past Client Referral', 'Referral Past Client', 'REFERRAL'],
  'Showroom Walk-in': ['Showroom', 'Showroom Walk-in', 'walk in', 'Walk-in', 'showroom'],
  'Instagram': ['Instagram', 'IG', 'insta', 'instagram', 'Insta'],
};
const STAGE_VARIANTS = {
  new: ['New', 'new', 'Lead', 'Inbound', 'NEW'],
  consult: ['Consult', 'Consultation', 'Design Consult', 'consult'],
  quote: ['Quote', 'Quoted', 'Proposal', 'quote', 'Q'],
  won: ['Won', 'Closed Won', 'won', 'WON', 'W', 'Win'],
  lost: ['Lost', 'Closed Lost', 'lost', 'L', 'Dead'],
};
const REP_VARIANTS = {
  'Maria Lopez': ['Maria Lopez', 'maria lopez', 'Maria  Lopez', 'M. Lopez', 'Maria Lopz'],
  'Devon Carter': ['Devon Carter', 'devon carter', 'D Carter', 'Devon  Carter'],
  'Priya Shah': ['Priya Shah', 'priya shah', 'Pria Shah', 'P. Shah'],
  'Sam Okafor': ['Sam Okafor', 'sam okafor', 'S. Okafor', 'Sam Okafr'],
};
const PROJ_VARIANTS = {
  'Walk-in closet': ['Walk-in closet', 'Walk in Closet', 'walkin', 'WIC', 'Reach-in closet'],
  'Garage': ['Garage', 'garage system', 'Garage Storage', 'garage'],
  'Pantry': ['Pantry', 'pantry', 'Kitchen Pantry'],
  'Home office': ['Home office', 'Office', 'Home Office', 'home office'],
};
const SHOWROOM_VARIANTS = {
  austin: ['austin', 'Austin', 'ATX'], la: ['la', 'LA', 'Los Angeles'],
  dallas: ['dallas', 'Dallas', 'DFW'], online: ['online', 'Online', 'web'],
};

// ---------- people ----------
const FIRST = ['Mike', 'Sarah', 'John', 'Emily', 'David', 'Jessica', 'Chris', 'Ashley', 'Brian', 'Amanda', 'Kevin', 'Nicole', 'Raj', 'Mei', 'Carlos', 'Fatima', 'Tom', 'Linda', 'Omar', 'Grace', 'Derek', 'Hannah', 'Wei', 'Sofia'];
const LAST = ['Anderson', 'Nguyen', 'Patel', 'Romano', 'Khan', 'Mueller', 'Johnson', 'Garcia', 'Smith', 'Lee', 'Brown', 'Williams', 'Okafor', 'Dawson', 'Gupta', 'Carter', 'Flores', 'Reed', 'Park', 'Cohen', 'Walsh', 'Ahmed', 'Torres', 'Hughes'];

// ---------- date / money formatting ----------
const DAY = 86400000;
const TODAY = Date.UTC(2026, 5, 5);            // 2026-06-05 reference for "stalled"
const HIST_START = Date.UTC(2024, 5, 1);       // 2024-06-01
const HIST_END = Date.UTC(2026, 4, 20);        // 2026-05-20 (just before app go-live)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const addDays = (ts, n) => ts + n * DAY;
function fmtDate(ts, allowBlank = true) {
  if (ts == null) return '';
  const d = new Date(ts); const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  return weighted([
    [`${y}-${pad(m + 1)}-${pad(day)}`, 30],            // ISO
    [`${pad(m + 1)}/${pad(day)}/${y}`, 38],            // US MM/DD/YYYY
    [`${MONTHS[m]} ${day} ${y}`, 9],                   // Mar 3 2024
    [`${MONTHS_FULL[m]} ${day}, ${y}`, 7],             // March 3, 2024
    [String(Math.round((ts - Date.UTC(1899, 11, 30)) / DAY)), 10], // Excel serial
    ['', allowBlank ? 6 : 0],                          // blank
  ]);
}
function thousands(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtMoney(n, allowNullish = false) {
  if (n == null) return weighted([['', 5], ['n/a', 3], ['TBD', 2], ['-', 2]]);
  return weighted([
    [`$${thousands(n)}`, 30],            // $12,500
    [`${n}.00`, 22],                     // 12500.00
    [thousands(n), 20],                  // 12,500
    [String(n), 16],                     // 12500
    [allowNullish ? '' : `$${thousands(n)}`, allowNullish ? 7 : 0],
    [allowNullish ? 'n/a' : String(n), allowNullish ? 5 : 0],
  ]);
}
function fmtPhone(area) {
  const a = area, b = ri(0, 9), rest = `555-${pad(ri(0, 99))}${ri(0, 9)}`;
  return weighted([
    [`${a}-555-0${pad(ri(0, 99))}${ri(0, 9)}`, 30],
    [`(${a}) 555-${pad(ri(0, 99))}${ri(0, 9)}`, 25],
    [`${a}555${ri(1000, 9999)}`, 20],
    [`(${a}) 555 ${pad(ri(0, 99))}${ri(0, 9)}`, 12],
    ['', 13],
  ]);
}
// random whitespace / casing noise on a text cell
function noise(s) {
  let v = s;
  const r = rnd();
  if (r < 0.12) v = '  ' + v;
  else if (r < 0.24) v = v + ' ';
  else if (r < 0.30) v = v.replace(' ', '  ');
  return v;
}
function dirtyName(clean) { // "Mike Anderson"
  const [f, l] = clean.split(' ');
  return weighted([
    [clean, 50], [`${l}, ${f}`, 18], [clean.toUpperCase(), 8],
    [clean.toLowerCase(), 8], [`${f}  ${l}`, 8], [` ${clean} `, 8],
  ]);
}

// ---------- generate ~400 TRUE leads ----------
const N = 400;
const AREA = { austin: '512', la: '213', dallas: '214', online: '737' };
const leads = [];
let legacy = 1000;
for (let i = 0; i < N; i++) {
  const rep = weighted([['Maria Lopez', 32], ['Devon Carter', 28], ['Sam Okafor', 22], ['Priya Shah', 18]]);
  const source = weighted([['Houzz', 24], ['Google Ads', 22], ['Referral Past Client', 20], ['Showroom Walk-in', 16], ['Instagram', 12], ['Google Ads', 6]]);
  const project = weighted([['Walk-in closet', 38], ['Garage', 26], ['Pantry', 20], ['Home office', 16]]);
  const [base, spread] = PROJ_VALUE[project];
  const value = Math.max(800, Math.round((base + (rnd() - 0.5) * spread) / 50) * 50);
  // created date, ramped toward recent
  const u = Math.pow(rnd(), 0.7); // skew toward 1 (recent)
  const created = HIST_START + Math.floor(u * (HIST_END - HIST_START));
  const ageDays = Math.floor((TODAY - created) / DAY);

  // outcome: old leads are decided; recent leads can still be open
  let stage, consultD = null, quoteD = null, wonD = null, lostD = null;
  const decideWon = () => rnd() < 0.56;
  if (ageDays > 75) {
    consultD = addDays(created, ri(3, 8));
    quoteD = addDays(created, ri(10, 16));
    if (decideWon()) { stage = 'won'; wonD = addDays(created, ri(18, 30)); }
    else { stage = 'lost'; lostD = addDays(created, ri(15, 35)); }
  } else {
    const roll = weighted([['won', 15], ['lost', 10], ['open', 75]]);
    if (roll === 'won') { stage = 'won'; consultD = addDays(created, ri(3, 8)); quoteD = addDays(created, ri(10, 16)); wonD = addDays(created, ri(18, 28)); }
    else if (roll === 'lost') { stage = 'lost'; consultD = addDays(created, ri(3, 8)); quoteD = addDays(created, ri(10, 16)); lostD = addDays(created, ri(12, 30)); }
    else {
      // open: choose how far it progressed based on its age
      const prog = ageDays < 7 ? weighted([['new', 70], ['consult', 30]])
        : ageDays < 21 ? weighted([['new', 25], ['consult', 45], ['quote', 30]])
          : weighted([['new', 10], ['consult', 35], ['quote', 55]]);
      stage = prog;
      if (prog !== 'new') consultD = addDays(created, ri(3, 8));
      if (prog === 'quote') quoteD = addDays(created, ri(10, 16));
    }
  }
  // last event date and idle/stall
  const lastEvent = wonD ?? lostD ?? quoteD ?? consultD ?? created;
  const isOpen = stage === 'new' || stage === 'consult' || stage === 'quote';
  const idleDays = Math.floor((TODAY - lastEvent) / DAY);
  const isStalled = isOpen && idleDays > 14;

  const [f, l] = [pick(FIRST), pick(LAST)];
  const showroom = REP_SHOWROOM[rep];
  leads.push({
    legacyId: `L-${legacy++}`, first: f, last: l, customer: `${f} ${l}`,
    email: rnd() < 0.10 ? null : `${f}.${l}@example.com`.toLowerCase(),
    phone: AREA[showroom], project, value, stage, rep, source, showroom,
    channel: SOURCE_CHANNEL[source], created, consultD, quoteD, wonD, lostD,
    lastEvent, isOpen, isStalled,
    // a handful of base leads intentionally lose their rep or source -> conform to Unknown
    repMissing: rnd() < 0.012, sourceMissing: rnd() < 0.012,
  });
}

// ---------- compute GROUND TRUTH from the clean leads ----------
const won = leads.filter((x) => x.stage === 'won');
const lost = leads.filter((x) => x.stage === 'lost');
const open = leads.filter((x) => x.isOpen);
const reached = { new: leads.length, consult: 0, quote: 0, won: won.length, lost: lost.length };
for (const x of leads) {
  if (x.consultD || x.stage === 'consult' || x.stage === 'quote' || x.stage === 'won' || x.stage === 'lost' || x.quoteD) reached.consult++;
}
for (const x of leads) {
  if (x.quoteD || x.stage === 'quote' || x.stage === 'won' || x.stage === 'lost') reached.quote++;
}
const wonValue = won.reduce((s, x) => s + x.value, 0);
const pipelineValue = open.reduce((s, x) => s + x.value, 0);
const stalled = leads.filter((x) => x.isStalled);
const distinctReps = new Set(leads.map((x) => (x.repMissing ? 'Unknown' : x.rep)));
const distinctSources = new Set(leads.map((x) => (x.sourceMissing ? 'Unknown' : x.source)));

// ---------- emit the messy CSV ----------
const HEADER = [
  'lead_id_legacy', 'Customer Name', 'customer_email', 'Phone', 'project type',
  'Estimated Value', 'Stage', 'created', 'last_updated', 'Rep', 'Source', 'Showroom',
  'channel', 'won_date', 'lost_reason', 'quote_amount', 'quote_status', 'consult_date',
  'notes', 'referrer', 'priority', 'zip', '__imported_by', 'row_hash',
];
const csvField = (s) => {
  s = s == null ? '' : String(s);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const LOST_REASONS = ['price', 'went with competitor', 'timing', 'no response', 'budget', ''];
function rowFor(x, isDupe = false) {
  const stageRaw = pick(STAGE_VARIANTS[x.stage]);
  const sourceRaw = x.sourceMissing ? weighted([['', 5], ['Facebook', 1], ['Yelp', 1], ['Angi', 1]]) : pick(SOURCE_VARIANTS[x.source]);
  const repRaw = x.repMissing ? '' : noise(pick(REP_VARIANTS[x.rep]));
  const projRaw = noise(pick(PROJ_VARIANTS[x.project]));
  // lost leads carry the dirty/edge-case money values (they do not feed Won/Pipeline)
  const valueOut = x.stage === 'lost'
    ? weighted([[fmtMoney(x.value), 6], [fmtMoney(null, true), 2], ['0', 1], [`$-${thousands(ri(200, 1500))}`, 1]])
    : fmtMoney(x.value, false);
  const wonDateOut = x.wonD ? (rnd() < 0.04 ? fmtDate(addDays(TODAY, ri(400, 900)), false) : fmtDate(x.wonD, false)) : ''; // ~4% future-dated won
  const quoteAmt = x.quoteD || x.stage === 'won' || x.stage === 'lost' ? fmtMoney(Math.round(x.value / 50) * 50, true) : '';
  const quoteStat = quoteAmt && quoteAmt !== '' ? weighted([['sent', 4], ['Sent', 2], ['accepted', 2], ['declined', 1], ['', 2]]) : '';
  const note = weighted([['called, left vm', 3], ['follow up next week', 3], ['customer comparing quotes', 2], ['', 6], ['ready to buy', 1]]);
  return [
    x.legacyId,
    dirtyName(x.customer),
    x.email == null ? weighted([['', 5], ['n/a', 2]]) : noise(rnd() < 0.15 ? x.email.toUpperCase() : x.email),
    fmtPhone(x.phone),
    projRaw,
    valueOut,
    stageRaw,
    fmtDate(x.created, false),
    fmtDate(x.lastEvent, false),
    repRaw,
    sourceRaw,
    rnd() < 0.08 ? '' : pick(SHOWROOM_VARIANTS[x.showroom]),
    rnd() < 0.45 ? x.channel : '', // channel often blank, derivable from source
    wonDateOut,
    x.stage === 'lost' ? pick(LOST_REASONS) : '',
    quoteAmt,
    quoteStat,
    fmtDate(x.consultD, false),
    note,
    '', // referrer (mostly blank)
    weighted([['', 6], ['High', 1], ['med', 1], ['3', 1]]),
    String(ri(73301, 78799)),
    'legacy_export_v3',
    '',
  ];
}

const rows = [];
for (const x of leads) rows.push(rowFor(x));

// ~25 duplicates: same lead + same created date (so silver dedup collapses them), reformatted
const dupeTargets = [];
for (let i = 0; i < 25; i++) dupeTargets.push(leads[ri(0, leads.length - 1)]);
for (const x of dupeTargets) rows.push(rowFor(x, true));

// ~5 corrupted / shifted rows: fields misaligned from `created` rightward -> silver quarantines
for (let i = 0; i < 5; i++) {
  const x = leads[ri(0, leads.length - 1)];
  rows.push([
    `L-${9000 + i}`, dirtyName(x.customer), '', AREA[x.showroom], pick(PROJ_VARIANTS[x.project]),
    fmtMoney(x.value), // value where it belongs...
    pick(REP_VARIANTS[x.rep]),                 // Stage column holds a REP name (shift signature)
    pick(REP_VARIANTS[x.rep]),                 // created column holds text, not a date
    pick(SOURCE_VARIANTS[x.source]),           // last_updated holds a source
    fmtDate(x.created, false),                 // Rep column holds a date
    pick(STAGE_VARIANTS[x.stage]),             // Source column holds a stage
    '', '', '', '', '', '', '', 'shifted/garbled export row', '', '', '', 'legacy_export_v3', 'xQ' + ri(100, 999),
  ]);
}

// shuffle (deterministic) so dupes/junk are interleaved
for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[rows[i], rows[j]] = [rows[j], rows[i]]; }

const csv = [HEADER.join(','), ...rows.map((r) => r.map(csvField).join(','))].join('\n') + '\n';
writeFileSync(`${OUT}/historical_leads_export.csv`, csv);

// ---------- print ground truth ----------
const fmt$ = (n) => '$' + thousands(n);
console.log('=== historical_leads_export.csv written ===');
console.log(`Raw rows in CSV : ${rows.length}  (= ${N} true + ${dupeTargets.length} duplicates + 5 shifted/junk)`);
console.log('');
console.log('=== GROUND TRUTH (what the cleaned GOLD layer must produce) ===');
console.log(`Total Leads      : ${leads.length}`);
console.log(`Won Leads        : ${won.length}`);
console.log(`Lost Leads       : ${lost.length}`);
console.log(`Open Leads       : ${open.length}`);
console.log(`Win Rate         : ${(won.length / (won.length + lost.length) * 100).toFixed(1)}%  (Won / (Won+Lost))`);
console.log(`Won Value        : ${fmt$(wonValue)}`);
console.log(`Pipeline Value   : ${fmt$(pipelineValue)}  (open leads)`);
console.log(`Avg Deal Size    : ${fmt$(Math.round(wonValue / won.length))}`);
console.log(`Stalled Leads    : ${stalled.length}  (open, idle > 14 days vs ${new Date(TODAY).toISOString().slice(0, 10)})`);
console.log('');
console.log('Funnel (Leads Reaching Stage):');
console.log(`  New ${reached.new}  Consult ${reached.consult}  Quote ${reached.quote}  Won ${reached.won}  Lost ${reached.lost}`);
console.log('');
console.log(`DimRep members      : ${[...distinctReps].sort().join(', ')}  (count ${distinctReps.size})`);
console.log(`DimLeadSource members: ${[...distinctSources].sort().join(', ')}  (count ${distinctSources.size})`);
console.log(`DimStage members    : New, Consult, Quote, Won, Lost  (count 5)`);
console.log(`DimProjectType      : ${PROJECTS.join(', ')}`);
console.log('Output: ' + OUT + '/historical_leads_export.csv');
