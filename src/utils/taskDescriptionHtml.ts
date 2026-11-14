const ALLOWED_TAGS = new Set(['B', 'STRONG', 'UL', 'OL', 'LI', 'P', 'BR', 'DIV']);

function unwrapElement(el: Element): void {
  const parent = el.parentNode;
  if (!parent) {
    el.remove();
    return;
  }
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

function scrub(node: Element): void {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.parentNode?.removeChild(child);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    if (!ALLOWED_TAGS.has(el.tagName)) {
      unwrapElement(el);
      scrub(node);
      return;
    }
    Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name));
    scrub(el);
  });
}

export function sanitizeTaskHtml(html: string): string {
  const raw = String(html || '');
  if (!raw.trim()) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${raw}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  scrub(root);
  return root.innerHTML.trim();
}

export function htmlToPlainText(html: string): string {
  const sanitized = sanitizeTaskHtml(html);
  if (!sanitized) {
    return String(html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const holder = document.createElement('div');
  holder.innerHTML = sanitized;
  return (holder.textContent || '').replace(/\s+/g, ' ').trim();
}

export function isTaskDescriptionEmpty(html: string): boolean {
  return !htmlToPlainText(html);
}

export const TASK_DESC_HTML_CLASS =
  'task-desc-html [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 [&_b]:font-semibold [&_strong]:font-semibold [&_p]:m-0 [&_p+p]:mt-1';
