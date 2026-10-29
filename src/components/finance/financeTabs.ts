import type { FinanceTab } from '../../types/finance';

export const FINANCE_TABS: readonly FinanceTab[] = [
  'overview', 'invoices', 'receivables', 'receipts', 'collections', 'reports', 'summary', 'accounts', 'wht', 'settings',
];

/** Old tab ids that now live under a new name. `/finance/trends` keeps working. */
const LEGACY_TAB_REDIRECTS: Record<string, FinanceTab> = { trends: 'reports' };

export function normalizeFinanceTab(tab: string | undefined | null): FinanceTab | undefined {
  if (!tab) return undefined;
  const key = tab.toLowerCase();
  if (key in LEGACY_TAB_REDIRECTS) return LEGACY_TAB_REDIRECTS[key];
  return (FINANCE_TABS as readonly string[]).includes(key) ? (key as FinanceTab) : undefined;
}
