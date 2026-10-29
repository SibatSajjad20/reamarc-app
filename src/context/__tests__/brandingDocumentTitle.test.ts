import { describe, expect, it } from 'vitest';
import { operationsHubDocumentTitle } from '../BrandingProvider';

describe('operationsHubDocumentTitle', () => {
  it('always reflects the active company name (vercel switch regression)', () => {
    expect(operationsHubDocumentTitle('Reamarc')).toBe('Reamarc · Operations Hub');
    expect(operationsHubDocumentTitle('DataViz Technologies')).toBe(
      'DataViz Technologies · Operations Hub',
    );
    expect(operationsHubDocumentTitle('Acme')).toBe('Acme · Operations Hub');
  });
});
