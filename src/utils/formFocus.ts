export function focusFirstError(container?: HTMLElement | null): HTMLElement | null {
  const root = container || document;
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const selector = [
    '[aria-invalid="true"]',
    '[data-invalid="true"]',
    '.border-danger-dot',
    'input:invalid',
    'select:invalid',
    'textarea:invalid',
  ].join(',');

  const candidates = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return true;
    }
  );

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  const target = candidates[0];
  target.scrollIntoView({
    block: 'center',
    behavior: reduced ? 'auto' : 'smooth',
  });

  if (typeof target.focus === 'function') {
    target.focus({ preventScroll: true });
  } else {
    const focusable = target.querySelector<HTMLElement>('input, button, textarea, select, [tabindex="0"]');
    focusable?.focus({ preventScroll: true });
  }

  return target;
}
