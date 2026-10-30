export function publicInvoicePath(shareToken: string): string {
  return `/invoice/${encodeURIComponent(shareToken)}`;
}

/** Human-facing public invoice page on the current frontend origin. */
export function publicInvoiceUrl(shareToken: string, origin = window.location.origin): string {
  return `${origin}${publicInvoicePath(shareToken)}`;
}

export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall through to execCommand for non-secure contexts and denied permissions.
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error('Could not copy link');
  }
}

export function toWhatsAppNumber(phone?: string | null): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `92${digits.slice(1)}`;
  return digits;
}

export function whatsAppShareUrl(message: string, phone?: string | null): string {
  const text = encodeURIComponent(message);
  const number = toWhatsAppNumber(phone);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function invoiceEditBlockedMessage(
  status?: string | null,
  isAdmin = false,
): string | null {
  if (isAdmin) return null;
  if (status === 'paid') return 'This invoice is fully paid and cannot be edited.';
  if (status === 'void') return 'This invoice is on hold and cannot be edited.';
  if (status === 'deleted') return 'This invoice is deleted and cannot be edited.';
  return null;
}
