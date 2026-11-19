import { describe, expect, it } from 'vitest';
import { assignableDirectoryRoles } from './directoryRoles';

describe('assignableDirectoryRoles', () => {
  it('never includes admin', () => {
    const roles = assignableDirectoryRoles('admin', { includeClient: true });
    expect(roles.map((r) => r.id)).not.toContain('admin');
  });

  it('hides operations from non-admins and client unless requested', () => {
    const hr = assignableDirectoryRoles('hr');
    expect(hr.map((r) => r.id)).toEqual(['team_member', 'team_lead']);
    const admin = assignableDirectoryRoles('admin', { includeClient: true });
    expect(admin.map((r) => r.id)).toContain('operations');
    expect(admin.map((r) => r.id)).toContain('client');
  });

  it('HR can only assign Team member, Team lead, and Client', () => {
    const hr = assignableDirectoryRoles('hr', { includeClient: true }).map((r) => r.id);
    expect(hr).toEqual(['team_member', 'team_lead', 'client']);
    expect(hr).not.toContain('hr');
    expect(hr).not.toContain('operations');
    expect(hr).not.toContain('admin');
  });

  it('Admin keeps HR and Operations but never Admin', () => {
    const admin = assignableDirectoryRoles('admin').map((r) => r.id);
    expect(admin).toEqual(['team_member', 'team_lead', 'hr', 'operations']);
  });
});
