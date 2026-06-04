// Generates the lead-pipeline star schema as CSVs for fab table load.
import { writeFileSync, mkdirSync } from 'fs';

const OUT = 'C:/Users/Lenovo/Desktop/portfolio/Rayfin Lead Pipeline POC/fabric_build/seed';
mkdirSync(OUT, { recursive: true });

const w = (name, header, rows) => {
  const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n';
  writeFileSync(`${OUT}/${name}`, csv);
  return rows.length;
};

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (dt) => dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
const start = new Date(Date.UTC(2025, 0, 1));
const end = new Date(Date.UTC(2025, 5, 30));
const addDays = (dt, n) => {
  const x = new Date(dt);
  x.setUTCDate(x.getUTCDate() + n);
  return x > end ? end : x;
};

// ---- Dimensions ----
const reps = [
  [1, 'Maria Lopez', 'austin'],
  [2, 'Devon Carter', 'la'],
  [3, 'Priya Shah', 'online'],
  [4, 'Sam Okafor', 'dallas'],
];
const sources = [
  [1, 'Google Ads', 'ad'],
  [2, 'Houzz', 'web'],
  [3, 'Referral Past Client', 'referral'],
  [4, 'Showroom Walk-in', 'showroom'],
  [5, 'Instagram', 'ad'],
];
const stages = [
  [1, 'New', 1],
  [2, 'Consult', 2],
  [3, 'Quote', 3],
  [4, 'Won', 4],
  [5, 'Lost', 5],
];
const months = ['January', 'February', 'March', 'April', 'May', 'June'];
const dimDate = [];
for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  dimDate.push([y * 10000 + m * 100 + day, `${y}-${pad(m)}-${pad(day)}`, y, m, months[m - 1], `${y}-${pad(m)}`]);
}

const cR = w('DimRep.csv', ['RepKey', 'RepName', 'Showroom'], reps);
const cS = w('DimLeadSource.csv', ['LeadSourceKey', 'LeadSourceName', 'Channel'], sources);
const cG = w('DimStage.csv', ['StageKey', 'StageName', 'StageOrder'], stages);
const cD = w('DimDate.csv', ['DateKey', 'Date', 'Year', 'MonthNo', 'MonthName', 'YearMonth'], dimDate);

// ---- Facts ----
const projectTypes = [
  ['Walk-in closet', 12000, 4000],
  ['Garage', 6000, 3000],
  ['Pantry', 2500, 1500],
  ['Home office', 5000, 3000],
];
const stageKey = { New: 1, Consult: 2, Quote: 3, Won: 4, Lost: 5 };
const dayByStage = { New: 0, Consult: 5, Quote: 12, Won: 20, Lost: 20 };
const N = 50;
const facts = [];
const events = [];
let evKey = 1;
for (let i = 0; i < N; i++) {
  const leadKey = i + 1;
  const repKey = (i % 4) + 1;
  const srcKey = (i % 5) + 1;
  const [, base, rng] = projectTypes[i % 4];
  const value = base + ((i * 137) % rng);
  const created = addDays(start, Math.floor((i / N) * 170));
  const createdKey = keyOf(created);
  const bucket = i % 10;
  let curStage, isWon = 0, isLost = 0, isOpen = 0, path;
  if (bucket <= 3) { curStage = 4; isWon = 1; path = ['New', 'Consult', 'Quote', 'Won']; }
  else if (bucket <= 5) { curStage = 5; isLost = 1; path = ['New', 'Consult', 'Quote', 'Lost']; }
  else if (bucket === 6) { curStage = 1; isOpen = 1; path = ['New']; }
  else if (bucket === 7 || bucket === 9) { curStage = 2; isOpen = 1; path = ['New', 'Consult']; }
  else { curStage = 3; isOpen = 1; path = ['New', 'Consult', 'Quote']; }
  facts.push([leadKey, `Customer ${pad(leadKey)}`, repKey, srcKey, curStage, createdKey, value, isWon, isLost, isOpen]);
  for (const s of path) events.push([evKey++, leadKey, stageKey[s], keyOf(addDays(created, dayByStage[s]))]);
}
const cF = w('FactLead.csv', ['LeadKey', 'CustomerName', 'RepKey', 'LeadSourceKey', 'CurrentStageKey', 'CreatedDateKey', 'EstimatedValue', 'IsWon', 'IsLost', 'IsOpen'], facts);
const cE = w('FactStageEvent.csv', ['StageEventKey', 'LeadKey', 'StageKey', 'EnteredDateKey'], events);

console.log(`DimRep=${cR} DimLeadSource=${cS} DimStage=${cG} DimDate=${cD} FactLead=${cF} FactStageEvent=${cE}`);
console.log('Output: ' + OUT);