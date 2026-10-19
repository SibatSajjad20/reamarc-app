import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('JSON content-type is omitted unless the request has a body', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'apiClient.ts'), 'utf8');
  assert.match(src, /skipContentType \|\| !hasBody/);
  assert.match(src, /max_age=7200|hasBody/);
});
