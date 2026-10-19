import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('dashboard overdue alerts do not list the full content calendar', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'DashboardView.tsx'), 'utf8');
  const fn = src.slice(src.indexOf('const loadOverdueAlerts'), src.indexOf('// 1. Initial Mount Load'));
  assert.match(fn, /getOverdueSummary/);
  assert.doesNotMatch(fn, /contentCalendarService\.getItems\(/);
  assert.doesNotMatch(fn, /\/content-calendar\?/);
});
