import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { htmlToPlainText, parseTaskHtml } from './taskHtml.ts';

describe('task html rendering', () => {
  it('strips tags and decodes nbsp from web bold titles', () => {
    const html = '<b>Content calendar:&nbsp;</b>share plan';
    assert.equal(htmlToPlainText(html), 'Content calendar: share plan');
    const blocks = parseTaskHtml(html);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, 'p');
    if (blocks[0].type === 'p') {
      assert.equal(blocks[0].inlines[0].bold, true);
      assert.equal(blocks[0].inlines[0].text.trim(), 'Content calendar:');
      assert.equal(blocks[0].inlines[1].bold, false);
    }
  });

  it('keeps numbered and bullet lists as readable text', () => {
    const html = '<ol><li><b>Daily log:</b> remaining hours</li><li>Second point</li></ol>';
    assert.equal(htmlToPlainText(html), '1. Daily log: remaining hours\n2. Second point');
    const bullets = htmlToPlainText('<ul><li>One</li><li>Two</li></ul>');
    assert.equal(bullets, '• One\n• Two');
  });
});
