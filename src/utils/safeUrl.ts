/** Check if a given string is a valid web URL with a proper domain / host. */
export function isValidWebUrl(raw: string | null | undefined): boolean {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return true;
  if (/\s/.test(trimmed)) return false;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname;
    if (!host) return false;
    if (host === 'localhost') return true;
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(host)) return true;
    const parts = host.split('.');
    if (parts.length < 2) return false;
    if (parts.some((p) => !p || !/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(p))) return false;
    const tld = parts[parts.length - 1];
    if (!/^[a-zA-Z]{2,}$/.test(tld)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Allow only https URLs for user-controlled links (meet join, websites, deliverables). */
export function toSafeHttpsUrl(raw: string | null | undefined): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed || !isValidWebUrl(trimmed)) return null;
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
