/** Display helper for invoice dates. DB values stay ISO (YYYY-MM-DD). */
export function formatInvoiceDate(value?: string | null): string {
  if (!value) return '—';
  const raw = String(value).trim();
  const iso = raw.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return raw;
  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}
