const SYMBOLS: Record<string, string> = {
  USD: '$',
  PKR: '₨',
};

export function formatDealMoney(value: number | null | undefined, currency?: string | null): string {
  const code = (currency || 'PKR').trim().toUpperCase() || 'PKR';
  const amount = Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const symbol = SYMBOLS[code];
  if (symbol) return `${symbol}${amount}`;
  return `${code} ${amount}`;
}

type MoneyDeal = {
  value?: number | null;
  currency?: string | null;
  status?: string | null;
};

export function formatOpenDealTotals(deals: MoneyDeal[]): string {
  const totals = new Map<string, number>();
  for (const deal of deals) {
    if ((deal.status || 'open') !== 'open') continue;
    const code = (deal.currency || 'PKR').trim().toUpperCase() || 'PKR';
    totals.set(code, (totals.get(code) || 0) + (Number(deal.value) || 0));
  }
  return [...totals.entries()]
    .filter(([, sum]) => sum > 0)
    .map(([code, sum]) => formatDealMoney(sum, code))
    .join(' · ');
}

export function formatLeadOpenValue(lead: {
  deals?: MoneyDeal[] | null;
  total_deal_value?: number | null;
}): string | null {
  if (lead.deals && lead.deals.length > 0) {
    return formatOpenDealTotals(lead.deals) || null;
  }
  if (!lead.total_deal_value) return null;
  return formatDealMoney(lead.total_deal_value, 'PKR');
}
