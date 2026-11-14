import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canEditWebsiteTask, canManageWebsiteProject } from './websiteAccess.ts';

describe('website task permissions', () => {
  it('lets admins manage; blocks operations view-only and clients', () => {
    assert.equal(canManageWebsiteProject({ id: '1', role: 'admin' }), true);
    assert.equal(canManageWebsiteProject({ id: '2', role: 'operations' }), false);
    assert.equal(canManageWebsiteProject({ id: '3', role: 'client' }), false);
    assert.equal(
      canManageWebsiteProject({ id: '4', role: 'team_lead', permissions: { view_only: true } }),
      false,
    );
  });

  it('lets a project manager and an assignee edit, but not a random member', () => {
    const project = { id: 'p1', manager_id: 'pm1' };
    const task = { assignee_id: 'dev1' };
    assert.equal(canManageWebsiteProject({ id: 'pm1', role: 'employee' }, project), true);
    assert.equal(canEditWebsiteTask({ id: 'dev1', role: 'employee' }, project, task), true);
    assert.equal(canEditWebsiteTask({ id: 'other', role: 'employee' }, project, task), false);
  });
});
