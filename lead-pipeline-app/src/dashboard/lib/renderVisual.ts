// Renders a Vega-Lite spec from already-aggregated rows. The dashboard computes the
// rows client-side (so it can re-aggregate on every slicer / click), then calls this.
// onClick wires the visual into the cross-filter; highlight dims the non-selected marks.
import embed from 'vega-embed';

export interface VisualDef {
  name: string;
  dax: string; // retained for the registry shape; not used here
  spec: Record<string, unknown>;
}

export interface RenderOpts {
  onClick?: (datum: Record<string, unknown>) => void;
  onContextMenu?: (datum: Record<string, unknown>) => void;
  highlightField?: string;
  highlightValue?: string | number | null;
}

export async function renderVisual(
  el: HTMLElement,
  visual: VisualDef,
  rows: Array<Record<string, unknown>>,
  opts: RenderOpts = {},
): Promise<void> {
  // App theme (hex approximations of the OKLCH tokens; Inter font).
  const themeConfig: Record<string, unknown> = {
    font: 'Inter, ui-sans-serif, system-ui, sans-serif',
    background: 'transparent',
    axis: {
      labelColor: '#52576b', titleColor: '#52576b', gridColor: '#eef0f6',
      domainColor: '#e4e6ee', tickColor: '#e4e6ee', labelFontSize: 11, titleFontSize: 11,
      titleFontWeight: 500,
    },
    view: { stroke: 'transparent' },
    range: { category: ['#059669', '#4f46e5', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899'] },
    bar: { color: '#059669', cornerRadiusEnd: 5 },
    line: { color: '#4f46e5' },
    point: { filled: true, size: 60 },
    legend: { labelColor: '#52576b', titleColor: '#52576b', labelFontSize: 11, titleFontSize: 11 },
  };
  if (opts.onClick) themeConfig.mark = { cursor: 'pointer' };

  const base = visual.spec as { config?: Record<string, unknown>; encoding?: Record<string, unknown> };
  const specConfig = base.config ?? {};
  let encoding = base.encoding ?? {};
  if (opts.highlightField && opts.highlightValue != null) {
    encoding = {
      ...encoding,
      opacity: {
        condition: {
          test: `datum[${JSON.stringify(opts.highlightField)}] === ${JSON.stringify(opts.highlightValue)}`,
          value: 1,
        },
        value: 0.28,
      },
    };
  }

  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 240,
    autosize: { type: 'fit', contains: 'padding' },
    ...visual.spec,
    encoding,
    config: { ...themeConfig, ...specConfig },
    datasets: { table: rows },
  };

  const result = await embed(el, spec as never, { actions: false, renderer: 'svg' });
  if (opts.onClick) {
    result.view.addEventListener('click', (_event, item) => {
      const datum = item && (item as { datum?: Record<string, unknown> }).datum;
      if (datum) opts.onClick!(datum);
    });
  }
  if (opts.onContextMenu) {
    result.view.addEventListener('contextmenu', (event, item) => {
      const datum = item && (item as { datum?: Record<string, unknown> }).datum;
      if (datum) {
        (event as Event).preventDefault();
        opts.onContextMenu!(datum);
      }
    });
  }
}
