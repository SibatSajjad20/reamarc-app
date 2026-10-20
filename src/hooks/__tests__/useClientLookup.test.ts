import { describe, expect, it } from 'vitest';
import { buildClientLookup } from '../useClientLookup';
import type { Workspace } from '../../types';

function ws(partial: Partial<Workspace> & { id: string; name: string }): Workspace {
  return {
    initials: 'XX',
    brandColor: '#4f46e5',
    status: 'active',
    ...partial,
  } as Workspace;
}

describe('buildClientLookup', () => {
  const resolve = buildClientLookup([
    ws({ id: 'ws-1', name: 'Sample Client A', logo_url: 'https://res.cloudinary.com/demo/image/upload/a.png' }),
    ws({ id: 'ws-2', name: 'Apex Transfers LLC' }),
  ]);

  it('matches by workspace id', () => {
    expect(resolve({ workspace_id: 'ws-1', client_name: 'other' })?.id).toBe('ws-1');
  });

  it('falls back to a case-insensitive trimmed client name', () => {
    expect(resolve({ client_name: '  apex transfers llc  ' })?.id).toBe('ws-2');
  });
});
