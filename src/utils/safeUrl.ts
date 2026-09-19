/** Allow only https URLs for user-controlled links (meet join, websites, deliverables). */
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

/** Allow only WhatsApp web/native schemes produced by the CRM phone helper. */
export function toSafeWhatsAppUrl(raw: string | null | undefined): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('whatsapp:')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (host === 'wa.me' || host === 'api.whatsapp.com' || host === 'web.whatsapp.com') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}
