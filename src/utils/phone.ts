const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export function looksLikeEmail(value?: string | null): boolean {
  return EMAIL_RE.test(String(value || '').trim());
}

export function pickPhoneValue(...candidates: Array<string | null | undefined>): string {
  for (const raw of candidates) {
    const value = String(raw || '').trim();
    if (!value || looksLikeEmail(value)) continue;
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 7) return value;
  }
  return '';
}

function formatDigits(digits: string, hadPlus: boolean): string {
  if (digits.length === 12 && digits.startsWith('92') && digits[2] === '3') {
    return `+92 ${digits.slice(2, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 11 && digits.startsWith('03')) {
    return `+92 ${digits.slice(1, 4)} ${digits.slice(4)}`;
  }
  if (digits.length === 10 && digits.startsWith('3')) {
    return `+92 ${digits.slice(0, 3)} ${digits.slice(3)}`;
  }
  if (digits.length >= 8) {
    return `+${digits}`;
  }
  if (hadPlus && digits) return `+${digits}`;
  return digits;
}

export function formatPhoneDisplay(value?: string | null): string {
  const source = pickPhoneValue(value);
  if (!source) return '—';
  const digits = source.replace(/\D/g, '');
  return formatDigits(digits, source.trim().startsWith('+')) || source;
}

export function phoneForInput(value?: string | null): string {
  const formatted = formatPhoneDisplay(value);
  return formatted === '—' ? '' : formatted;
}

export function normalizePhoneForSave(value?: string | null): string {
  return phoneForInput(value);
}
