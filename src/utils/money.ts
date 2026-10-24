const SYMBOLS: Record<string, string> = {
  USD: '$',
  PKR: '₨',
  GBP: '£',
};

export function getCurrencySymbol(currency?: string | null): string {
  const code = (currency || 'PKR').trim().toUpperCase() || 'PKR';
  return SYMBOLS[code] || code;
}

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

/**
 * Minor unit converters and formatters (paisa / cents).
 * Standard: 100 minor units = 1 major unit.
 */
export function minorToMajor(minor: number | null | undefined): number {
  if (minor === null || minor === undefined || isNaN(minor)) return 0;
  return minor / 100;
}

export function majorToMinor(major: number | null | undefined): number {
  if (major === null || major === undefined || isNaN(major)) return 0;
  return Math.round(major * 100);
}

export function formatMinorMoney(
  minorUnits: number | null | undefined,
  currency?: string | null,
  showCode = true,
): string {
  const val = minorToMajor(minorUnits);
  const code = (currency || 'PKR').trim().toUpperCase() || 'PKR';
  const formatted = val.toLocaleString(undefined, {
    minimumFractionDigits: val % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  if (showCode) {
    return `${code} ${formatted}`;
  }
  const symbol = SYMBOLS[code] || '';
  return `${symbol}${formatted}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens} ${ones}` : tens;
}

function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(twoDigitsToWords(rest));
  return parts.join(' ');
}

export function numberToWordsPakistani(num: number): string {
  if (num === 0) return 'Zero';
  let n = Math.floor(num);
  const parts: string[] = [];

  const crores = Math.floor(n / 10000000);
  n %= 10000000;
  const lakhs = Math.floor(n / 100000);
  n %= 100000;
  const thousands = Math.floor(n / 1000);
  n %= 1000;
  const hundreds = n;

  if (crores) parts.push(`${threeDigitsToWords(crores)} Crore`);
  if (lakhs) parts.push(`${twoDigitsToWords(lakhs)} Lakh`);
  if (thousands) parts.push(`${twoDigitsToWords(thousands)} Thousand`);
  if (hundreds) parts.push(threeDigitsToWords(hundreds));

  return parts.join(' ');
}

export function numberToWordsWestern(num: number): string {
  if (num === 0) return 'Zero';
  let n = Math.floor(num);
  const parts: string[] = [];

  const billions = Math.floor(n / 1000000000);
  n %= 1000000000;
  const millions = Math.floor(n / 1000000);
  n %= 1000000;
  const thousands = Math.floor(n / 1000);
  n %= 1000;
  const hundreds = n;

  if (billions) parts.push(`${threeDigitsToWords(billions)} Billion`);
  if (millions) parts.push(`${threeDigitsToWords(millions)} Million`);
  if (thousands) parts.push(`${twoDigitsToWords(thousands)} Thousand`);
  if (hundreds) parts.push(threeDigitsToWords(hundreds));

  return parts.join(' ');
}

export function amountInWords(minorUnits: number | null | undefined, currency = 'PKR'): string {
  const minor = Math.max(0, minorUnits || 0);
  const major = Math.floor(minor / 100);
  const sub = minor % 100;
  const code = (currency || 'PKR').trim().toUpperCase();

  let words = '';
  let currLabel = '';
  let subLabel = '';

  if (code === 'PKR') {
    words = numberToWordsPakistani(major);
    currLabel = 'Rupees';
    subLabel = 'Paisa';
  } else if (code === 'USD') {
    words = numberToWordsWestern(major);
    currLabel = 'US Dollars';
    subLabel = 'Cents';
  } else if (code === 'GBP') {
    words = numberToWordsWestern(major);
    currLabel = 'British Pounds';
    subLabel = 'Pence';
  } else {
    words = numberToWordsWestern(major);
    currLabel = code;
    subLabel = 'Cents';
  }

  if (sub > 0) {
    const subWords = twoDigitsToWords(sub);
    return `${currLabel} ${words} and ${subWords} ${subLabel} Only`;
  }
  return `${currLabel} ${words} Only`;
}
