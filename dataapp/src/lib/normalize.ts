// The Execute Queries REST API returns rows whose keys carry the table and
// measure qualifiers, for example "DimStage[StageName]" or "[Leads]".
// Vega-Lite specs are easier to read against clean field names, so we strip the
// qualifier down to the column or measure name: "StageName", "Leads".
//
// This is defensive: if a key has no brackets (some clients pre-clean them),
// it is passed through unchanged.

export function normalizeKey(key: string): string {
  const m = key.match(/\[([^\]]+)\]\s*$/);
  return m ? m[1] : key;
}

export function normalizeRows(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[normalizeKey(k)] = v;
    }
    return out;
  });
}
