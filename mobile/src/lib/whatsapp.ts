import { Linking } from 'react-native';

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
    opts.waUrl ||
    (encoded ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/${cleanPhone}`);

  const canOpen = await Linking.canOpenURL(nativeUrl).catch(() => false);
  if (canOpen) {
    await Linking.openURL(nativeUrl);
  } else {
    await Linking.openURL(webUrl);
  }
}
