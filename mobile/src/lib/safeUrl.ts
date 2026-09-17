/** Allow only https URLs for user-controlled CRM links (meet join, websites). */
export function toSafeHttpsUrl(raw: string | null | undefined): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
