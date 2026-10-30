import { describe, it, expect } from 'vitest';
import {
  canAccessWebsitePipeline,
  canCreateWebsiteProject,
  canManageWebsiteProject,
  canEditWebsiteTask,
  websitePermissionLevel,
} from './websiteProjectAccess';

function websiteLeadAuthMeShape() {
  // Current /auth/me: modules are boolean switches; levels/summary hold the level string.
  return {
    id: 'wl',
    role: 'team_lead',
    department: 'Website',
    is_active: true,
    permissions: {
      modules: {
        website: true,
        attendance: true,
        daily_log: true,
        sales: false,
        content_calendar: false,
        ads: false,
      },
      levels: {
        website: 'manage',
        attendance: 'department',
        daily_log: 'department',
        sales: 'none',
        content_calendar: 'none',
        ads: 'none',
      },
      summary: {
        website: 'manage',
        attendance: 'department',
        daily_log: 'department',
        sales: 'none',
        content_calendar: 'none',
        ads: 'none',
      },
      view_only: false,
    },
  };
}

function websiteMemberAuthMeShape() {
  return {
    id: 'wm',
    role: 'team_member',
    department: 'Website',
    is_active: true,
    permissions: {
      modules: { website: true },
      levels: { website: 'assigned' },
      summary: { website: 'assigned' },
      view_only: false,
    },
  };
}

describe('websiteProjectAccess', () => {
  it('reads manage from levels/summary when modules.website is a boolean', () => {
    const lead = websiteLeadAuthMeShape();
    expect(websitePermissionLevel(lead)).toBe('manage');
    expect(canAccessWebsitePipeline(lead)).toBe(true);
    expect(canManageWebsiteProject(lead)).toBe(true);
    expect(canCreateWebsiteProject(lead)).toBe(true);
  });

  it('allows website team leads to create projects (regression for missing New Project button)', () => {
    expect(canCreateWebsiteProject(websiteLeadAuthMeShape())).toBe(true);
  });

  it('does not let website members create projects', () => {
    const member = websiteMemberAuthMeShape();
    expect(canAccessWebsitePipeline(member)).toBe(true);
    expect(canManageWebsiteProject(member)).toBe(false);
    expect(canCreateWebsiteProject(member)).toBe(false);
  });

  it('still supports legacy per-department modules.website maps', () => {
    const legacyLead = {
      id: 'wl',
      role: 'team_lead',
      permissions: {
        modules: { website: { Website: 'manage' } },
      },
    };
    expect(websitePermissionLevel(legacyLead)).toBe('manage');
    expect(canManageWebsiteProject(legacyLead)).toBe(true);
    expect(canCreateWebsiteProject(legacyLead)).toBe(true);
  });

  it('lets assigned project managers manage that project', () => {
    const member = websiteMemberAuthMeShape();
    const project = { id: 'p1', manager_id: 'wm' } as any;
    expect(canManageWebsiteProject(member, project)).toBe(true);
    expect(canCreateWebsiteProject(member)).toBe(false);
  });

  it('lets task assignees edit their tasks', () => {
    const member = websiteMemberAuthMeShape();
    const project = { id: 'p1', manager_id: 'other' } as any;
    const task = { id: 't1', assignee_id: 'wm' } as any;
    expect(canEditWebsiteTask(member, project, task)).toBe(true);
  });

  it('blocks operations from manage/create', () => {
    const ops = {
      id: 'ops',
      role: 'operations',
      permissions: {
        modules: { website: true },
        levels: { website: 'view' },
        summary: { website: 'view' },
        view_only: true,
      },
    };
    expect(canAccessWebsitePipeline(ops)).toBe(true);
    expect(canManageWebsiteProject(ops)).toBe(false);
    expect(canCreateWebsiteProject(ops)).toBe(false);
  });

  it('blocks sales team leads from website manage/create', () => {
    const salesLead = {
      id: 'sl',
      role: 'team_lead',
      permissions: {
        modules: { website: false, sales: true },
        levels: { website: 'none', sales: 'all' },
        summary: { website: 'none', sales: 'all' },
      },
    };
    expect(canAccessWebsitePipeline(salesLead)).toBe(false);
    expect(canCreateWebsiteProject(salesLead)).toBe(false);
  });
});
