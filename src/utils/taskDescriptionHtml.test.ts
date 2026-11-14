import { describe, expect, it } from 'vitest';
import {
  htmlToPlainText,
  isTaskDescriptionEmpty,
  sanitizeTaskHtml,
} from './taskDescriptionHtml';

describe('taskDescriptionHtml', () => {
  it('keeps bold and lists, strips scripts and attributes', () => {
    const dirty =
      '<p onclick="alert(1)"><b>Done</b></p><ul><li>One</li></ul><script>alert(1)</script><img src=x onerror=alert(1)>';
    const clean = sanitizeTaskHtml(dirty);
    expect(clean).toContain('<b>Done</b>');
    expect(clean).toContain('<ul>');
    expect(clean).toContain('<li>One</li>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('img');
  });

  it('treats empty tags as empty description', () => {
    expect(isTaskDescriptionEmpty('')).toBe(true);
    expect(isTaskDescriptionEmpty('<p><br></p>')).toBe(true);
    expect(isTaskDescriptionEmpty('<b>  </b>')).toBe(true);
    expect(isTaskDescriptionEmpty('<b>Shipped</b>')).toBe(false);
  });

  it('plain-texts HTML for export and titles', () => {
    expect(htmlToPlainText('<b>Hello</b> world')).toBe('Hello world');
  });
});
