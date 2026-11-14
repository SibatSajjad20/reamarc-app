import { describe, expect, it } from 'vitest';
import { assignableDirectoryRoles } from './directoryRoles';

describe('assignableDirectoryRoles', () => {
  it('never includes admin', () => {
    const roles = assignableDirectoryRoles('admin', { includeClient: true });
    expect(roles.map((r) => r.id)).not.toContain('admin');
  });

  it('hides operations from non-admins and client unless requested', () => {
    const hr = assignableDirectoryRoles('hr');
    expect(hr.map((r) => r.id)).toEqual(['team_member', 'team_lead', 'hr']);
    const admin = assignableDirectoryRoles('admin', { includeClient: true });
    expect(admin.map((r) => r.id)).toContain('operations');
    expect(admin.map((r) => r.id)).toContain('client');
  });
});
