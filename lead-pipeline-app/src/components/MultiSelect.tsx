import { useEffect, useRef, useState } from 'react';

// Compact slicer control: a button that opens a checkbox list. Empty selection
// means "no filter on this field".
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  const count = selected.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
          count
            ? 'border-accent/40 bg-accent-soft text-accent-strong'
            : 'border-line bg-panel text-muted hover:bg-rail'
        }`}
      >
        <span className="font-medium">{label}</span>
        {count > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
            {count}
          </span>
        )}
        <svg className="h-3 w-3 text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 max-h-64 w-56 overflow-auto rounded-lg border border-line bg-panel p-1 shadow-lg">
          {options.length === 0 && <p className="px-2 py-1.5 text-xs text-faint">No values</p>}
          {options.map((o) => (
            <label
              key={o}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink hover:bg-rail"
            >
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={() => toggle(o)}
                className="h-3.5 w-3.5 accent-accent"
              />
              <span className="truncate">{o}</span>
            </label>
          ))}
          {count > 0 && (
            <button
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-faint hover:bg-rail hover:text-ink"
            >
              Clear {label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
