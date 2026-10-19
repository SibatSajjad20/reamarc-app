import assert from 'node:assert/strict';
import test from 'node:test';
import { emitInvalidation, subscribeInvalidation } from './cacheBus';

test('invalidation source is passed through for CRM self-skip', () => {
  const seen: Array<{ key: string; source?: string }> = [];
  const unsub = subscribeInvalidation(['crm', 'crm.counts'], (key, meta) => {
    seen.push({ key, source: meta?.source });
  });
  emitInvalidation(['crm', 'crm.counts'], { source: 'crm-view' });
  unsub();
  assert.equal(seen.length, 2);
  assert.ok(seen.every((row) => row.source === 'crm-view'));
});
