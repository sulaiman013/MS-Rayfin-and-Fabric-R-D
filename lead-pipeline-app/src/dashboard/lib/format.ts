export const money = (n: number | null | undefined): string =>
  n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString('en-US');
export const pct = (n: number | null | undefined): string =>
  n == null ? '—' : (Number(n) * 100).toFixed(1) + '%';
export const num = (n: number | null | undefined): string =>
  n == null ? '—' : Math.round(Number(n)).toLocaleString('en-US');
