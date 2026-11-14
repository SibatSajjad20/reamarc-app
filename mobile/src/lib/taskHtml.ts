export type HtmlInline = { text: string; bold: boolean };

export type HtmlBlock =
  | { type: 'p'; inlines: HtmlInline[] }
  | { type: 'li'; ordered: boolean; index: number; inlines: HtmlInline[] };

const TOKEN_RE = /<\/?(?:b|strong|i|em|p|div|br|ul|ol|li)(?:\s[^>]*)?\/?>/gi;

function decodeEntities(value: string): string {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function pushInline(inlines: HtmlInline[], text: string, bold: boolean) {
  const clean = decodeEntities(text).replace(/\s+/g, ' ');
  if (!clean) return;
  const last = inlines[inlines.length - 1];
  if (last && last.bold === bold) {
    last.text += clean;
    return;
  }
  inlines.push({ text: clean, bold });
}

function inlinesText(inlines: HtmlInline[]): string {
  return inlines.map((part) => part.text).join('').trim();
}

export function parseTaskHtml(html: string): HtmlBlock[] {
  const raw = decodeEntities(String(html || ''));
  if (!raw.trim()) return [];

  const blocks: HtmlBlock[] = [];
  let bold = false;
  let listKind: 'ul' | 'ol' | null = null;
  let listIndex = 0;
  let current: HtmlInline[] = [];

  const flushParagraph = () => {
    if (!inlinesText(current)) {
      current = [];
      return;
    }
    blocks.push({ type: 'p', inlines: current });
    current = [];
  };

  const flushListItem = () => {
    if (!inlinesText(current) && blocks.length) {
      current = [];
      return;
    }
    if (!inlinesText(current)) {
      current = [];
      return;
    }
    const ordered = listKind === 'ol';
    blocks.push({
      type: 'li',
      ordered,
      index: ordered ? listIndex : 0,
      inlines: current,
    });
    current = [];
  };

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(raw))) {
    if (match.index > lastIndex) {
      pushInline(current, raw.slice(lastIndex, match.index), bold);
    }
    const tag = match[0].toLowerCase();
    const name = tag.replace(/[<>/]/g, '').split(/\s/)[0];
    const closing = tag.startsWith('</');
    const selfClosing = tag.endsWith('/>') || name === 'br';

    if (name === 'b' || name === 'strong') {
      bold = !closing;
    } else if (name === 'br' || selfClosing && name === 'br') {
      flushParagraph();
    } else if (name === 'ul' || name === 'ol') {
      if (closing) {
        if (listKind) flushListItem();
        else flushParagraph();
        listKind = null;
        listIndex = 0;
      } else {
        flushParagraph();
        listKind = name;
        listIndex = 0;
      }
    } else if (name === 'li') {
      if (closing) {
        flushListItem();
      } else {
        if (listKind === 'ol') listIndex += 1;
        else if (inlinesText(current)) flushListItem();
      }
    } else if (name === 'p' || name === 'div') {
      if (closing) flushParagraph();
      else if (inlinesText(current)) flushParagraph();
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < raw.length) {
    pushInline(current, raw.slice(lastIndex), bold);
  }
  if (listKind) flushListItem();
  else flushParagraph();

  return blocks;
}

export function htmlToPlainText(html: string): string {
  const blocks = parseTaskHtml(html);
  if (!blocks.length) {
    return decodeEntities(String(html || ''))
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return blocks
    .map((block) => {
      const text = inlinesText(block.inlines);
      if (block.type === 'li') {
        return block.ordered ? `${block.index}. ${text}` : `• ${text}`;
      }
      return text;
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}
