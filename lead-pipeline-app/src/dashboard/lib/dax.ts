// Replace the {{FILTERS}} placeholder in a DAX template.
//
// `filters` is either "" (no filter) or a leading-comma list of CALCULATETABLE
// filter arguments injected from the dashboard's current selection, for example:
//   ", 'DimDate'[Year] = 2025, 'DimRep'[Showroom] = \"austin\""
//
// Keeping the query in a separate .dax file means a human (or Tabular Editor)
// can review and optimize it before it ever runs.
export function applyFilters(daxTemplate: string, filters = ''): string {
  return daxTemplate.replace(/\{\{FILTERS\}\}/g, filters ?? '');
}
