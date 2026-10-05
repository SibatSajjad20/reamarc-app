export function safeHttpUrl(value?: string | null): string | null {
  const text = (value || '').trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function excelSafeCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  const trimmed = text.trimStart();
  if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return `'${text}`;
  }
  return text;
}
