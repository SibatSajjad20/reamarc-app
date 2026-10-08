export function safeHttpUrl(value?: string | null): string | undefined {
  const text = (value || '').trim();
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function excelSafeCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  const trimmed = text.trimStart();
  if (
    trimmed.startsWith('=') ||
    trimmed.startsWith('+') ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('@') ||
    trimmed.startsWith('\t') ||
    trimmed.startsWith('\r')
  ) {
    return `'${text}`;
  }
  return text;
}
