import { Linking } from 'react-native';

function toSafeWhatsAppUrl(raw: string | null | undefined): string | null {
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
  } catch {
    return null;
  }
  return null;
}

/** Open WhatsApp with optional prefilled message. Prefer API wa_url when present. */
export async function openWhatsApp(opts: {
  phoneE164: string;
  waUrl?: string | null;
  text?: string | null;
}): Promise<void> {
  const cleanPhone = opts.phoneE164.replace(/\D/g, '');
  if (!cleanPhone) {
    throw new Error('Invalid phone number');
  }

  const text = (opts.text || '').trim();
  const encoded = text ? encodeURIComponent(text) : '';
  const nativeUrl = encoded
    ? `whatsapp://send?phone=${cleanPhone}&text=${encoded}`
    : `whatsapp://send?phone=${cleanPhone}`;
  const webUrl =
    toSafeWhatsAppUrl(opts.waUrl) ||
    (encoded ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/${cleanPhone}`);

  const canOpen = await Linking.canOpenURL(nativeUrl).catch(() => false);
  if (canOpen) {
    await Linking.openURL(nativeUrl);
  } else {
    await Linking.openURL(webUrl);
  }
}
