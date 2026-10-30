/** INV-2026-0005 -> INV-26-0005. Two-digit years are left as-is. */
export function formatInvoiceNumber(number?: string | null): string {
  if (!number) return '';
  return String(number).replace(/-(?:19|20)(\d{2})-/, '-$1-');
}
