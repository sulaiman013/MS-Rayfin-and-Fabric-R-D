// Offline mock results for the dashboard (preview mode, or before the Power BI
// Entra app + dataset are configured). Values mirror the validated gold numbers so
// the preview looks real. Rows are already in normalized (bracket-stripped) form.
type Row = Record<string, unknown>;

export function mockDax(dax: string): Row[] {
  if (dax.includes('Stalled Leads') && dax.includes('ROW')) {
    return [{
      'Total Leads': 401, 'Win Rate': 0.536, 'Pipeline Value': 221550,
      'Won Value': 1578350, 'Stalled Leads': 22,
    }];
  }
  if (dax.includes('Leads Reaching Stage')) {
    return [
      { StageName: 'New', StageOrder: 1, Leads: 401 },
      { StageName: 'Consult', StageOrder: 2, Leads: 398 },
      { StageName: 'Quote', StageOrder: 3, Leads: 387 },
      { StageName: 'Won', StageOrder: 4, Leads: 201 },
      { StageName: 'Lost', StageOrder: 5, Leads: 174 },
    ];
  }
  if (dax.includes('YearMonth')) {
    const months = ['2024-07', '2024-09', '2024-11', '2025-01', '2025-03', '2025-06', '2025-09', '2025-12', '2026-02', '2026-04'];
    return months.map((m, i) => ({ YearMonth: m, 'Total Leads': 14 + i * 3, 'Won Leads': 7 + Math.round(i * 1.4) }));
  }
  if (dax.includes('RepName')) {
    return [
      { RepName: 'Maria Lopez', 'Win Rate': 0.58, 'Total Leads': 128 },
      { RepName: 'Devon Carter', 'Win Rate': 0.52, 'Total Leads': 112 },
      { RepName: 'Sam Okafor', 'Win Rate': 0.49, 'Total Leads': 88 },
      { RepName: 'Priya Shah', 'Win Rate': 0.55, 'Total Leads': 71 },
    ];
  }
  if (dax.includes('LeadSourceName')) {
    return [
      { LeadSourceName: 'Houzz', 'Total Leads': 96, 'Won Leads': 49, 'Won Value': 392000 },
      { LeadSourceName: 'Google Ads', 'Total Leads': 92, 'Won Leads': 41, 'Won Value': 318000 },
      { LeadSourceName: 'Referral Past Client', 'Total Leads': 80, 'Won Leads': 50, 'Won Value': 430000 },
      { LeadSourceName: 'Showroom Walk-in', 'Total Leads': 64, 'Won Leads': 34, 'Won Value': 250000 },
      { LeadSourceName: 'Instagram', 'Total Leads': 48, 'Won Leads': 21, 'Won Value': 150000 },
    ];
  }
  return [];
}
