// Portable reference renderer: turns a Vega-Lite spec plus a DAX result into a
// chart. Install peer deps in the data app project:  bun add vega vega-lite vega-embed
//
// In the Fabric data app template you can instead pass `spec` and the normalized
// rows to the template's built-in chart components. This file is the portable
// fallback so the spec pack runs anywhere.
import embed from 'vega-embed';
import { normalizeRows } from './normalize.js';
import { applyFilters } from './dax.js';

export interface VisualDef {
  name: string;
  dax: string; // DAX template text containing {{FILTERS}}
  spec: Record<string, unknown>; // Vega-Lite spec; its data.name must be "table"
}

// runDax is the ONE seam you bind to the host. The data app template injects an
// authenticated Execute Queries client, so wrap it here. It takes a DAX string
// and resolves to the API's result rows (array of objects).
export type RunDax = (dax: string) => Promise<Array<Record<string, unknown>>>;

export async function renderVisual(
  el: HTMLElement,
  visual: VisualDef,
  runDax: RunDax,
  filters = '',
): Promise<void> {
  const query = applyFilters(visual.dax, filters);
  const rows = await runDax(query);
  const values = normalizeRows(rows);

  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 260,
    autosize: { type: 'fit', contains: 'padding' },
    ...visual.spec,
    datasets: { table: values },
  };

  await embed(el, spec as never, { actions: false, renderer: 'svg' });
}
