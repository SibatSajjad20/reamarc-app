import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveTabs, routeForNotification, type TabId } from './tabResolver.ts';

function ids(user: Parameters<typeof resolveTabs>[0]): TabId[] {
  return resolveTabs(user).tabs.map((tab) => tab.id);
}

function shortcutIds(user: Parameters<typeof resolveTabs>[0]): TabId[] {
  return resolveTabs(user).shortcuts.map((tab) => tab.id);
}

function sidebarIds(user: Parameters<typeof resolveTabs>[0]): TabId[] {
  return resolveTabs(user).sidebar.map((tab) => tab.id);
}

describe('resolveTabs — mocked effective access, never names', () => {
  it('Admin quick bar: Home, Tasks, Sales, Requests, Finance; rest in sidebar', () => {
    const user = {
      role: 'admin',
      permissions: {
        tracked: { attendance: false, daily_log: false },
        modules: {
          attendance: false,
          daily_log: false,
          sales: true,
          content_calendar: true,
          website: true,
          ads: true,
        },
        levels: { finance: 'manage', sales: 'all' },
      },
    };
    const layout = resolveTabs(user);
    assert.deepEqual(ids(user), ['home', 'tasks', 'sales', 'requests', 'finance']);
    assert.equal(layout.alertsInHeader, true);
    assert.equal(layout.profileInHeader, true);
    assert.deepEqual(shortcutIds(user), ['content_calendar', 'website', 'ads']);
    assert.ok(sidebarIds(user).includes('content_calendar'));
    assert.ok(sidebarIds(user).includes('profile'));
    assert.equal(layout.tabs.length <= 5, true);
    assert.equal(layout.tabs.find((t) => t.id === 'finance')?.href, '/(tabs)/finance');
    assert.equal(layout.tabs.find((t) => t.id === 'tasks')?.href, '/(tabs)/tasks');
  });

  it('Operations quick bar: Home, Sales, Requests, Finance, Website', () => {
    const user = {
      role: 'operations',
      permissions: {
        tracked: { attendance: true, daily_log: false },
        modules: {
          attendance: true,
          daily_log: false,
          sales: true,
          content_calendar: true,
          website: true,
          ads: true,
        },
        levels: { finance: 'manage', sales: 'all' },
        capabilities: { approve_won_deal: true },
      },
    };
    const layout = resolveTabs(user);
    assert.deepEqual(ids(user), ['home', 'sales', 'requests', 'finance', 'website']);
    assert.equal(layout.alertsInHeader, true);
    assert.equal(layout.profileInHeader, true);
    assert.deepEqual(shortcutIds(user), ['content_calendar', 'ads']);
    assert.ok(sidebarIds(user).includes('won_deals'));
  });

  it('HR: Home, Daily Log, Requests, Alerts, Profile', () => {
    const user = {
      role: 'hr',
      permissions: {
        tracked: { attendance: true, daily_log: true },
        modules: {
          attendance: true,
          daily_log: true,
          sales: false,
          content_calendar: false,
          website: false,
          ads: false,
        },
        levels: { finance: 'none' },
      },
    };
    const layout = resolveTabs(user);
    assert.deepEqual(ids(user), ['home', 'daily_log', 'requests', 'alerts', 'profile']);
    assert.equal(layout.alertsInHeader, false);
    assert.equal(layout.profileInHeader, false);
    assert.deepEqual(shortcutIds(user), []);
    assert.equal(layout.tabs.find((t) => t.id === 'daily_log')?.href, '/(tabs)/daily-log');
    assert.equal(ids(user).includes('tasks'), false);
  });

  it('AI (attendance + daily log only): Home, Daily Log, Tasks, Requests, Alerts', () => {
    const user = {
      role: 'team_member',
      department: 'AI',
      permissions: {
        tracked: { attendance: true, daily_log: true },
        modules: {
          attendance: true,
          daily_log: true,
          sales: false,
          content_calendar: false,
          website: false,
          ads: false,
        },
        levels: { finance: 'none' },
      },
    };
    const layout = resolveTabs(user);
    assert.deepEqual(ids(user), ['home', 'daily_log', 'tasks', 'requests', 'alerts']);
    assert.equal(layout.profileInHeader, true);
    assert.equal(layout.landingHref, '/(tabs)');
  });

  it('Creative/Content/Social: Home, Daily Log, Tasks, Requests, Content', () => {
    for (const department of ['Creative', 'Content', 'Social']) {
      const user = {
        role: 'team_member',
        department,
        permissions: {
          tracked: { attendance: true, daily_log: true },
          modules: {
            attendance: true,
            daily_log: true,
            sales: false,
            content_calendar: true,
            website: false,
            ads: false,
          },
          levels: { finance: 'none' },
        },
      };
      const layout = resolveTabs(user);
      assert.deepEqual(ids(user), ['home', 'daily_log', 'tasks', 'requests', 'content_calendar']);
      assert.equal(layout.alertsInHeader, true);
      assert.equal(layout.profileInHeader, true);
    }
  });

  it('Website/Software Dev: Home, Daily Log, Tasks, Requests, Website', () => {
    for (const department of ['Website', 'Software Development']) {
      const user = {
        role: 'team_member',
        department,
        permissions: {
          tracked: { attendance: true, daily_log: true },
          modules: {
            attendance: true,
            daily_log: true,
            sales: false,
            content_calendar: false,
            website: true,
            ads: false,
          },
          levels: { finance: 'none' },
        },
      };
      const layout = resolveTabs(user);
      assert.deepEqual(ids(user), ['home', 'daily_log', 'tasks', 'requests', 'website']);
    }
  });

  it('SEO/Performance Marketing: Home, Daily Log, Tasks, Requests, Ads', () => {
    for (const department of ['SEO', 'Performance Marketing']) {
      const user = {
        role: 'team_member',
        department,
        permissions: {
          tracked: { attendance: true, daily_log: true },
          modules: {
            attendance: true,
            daily_log: true,
            sales: false,
            content_calendar: false,
            website: false,
            ads: true,
          },
          levels: { finance: 'none' },
        },
      };
      const layout = resolveTabs(user);
      assert.deepEqual(ids(user), ['home', 'daily_log', 'tasks', 'requests', 'ads']);
    }
  });

  it('Sales: Tasks, Sales Pipeline, Alerts, Profile (no Home, no Requests)', () => {
    const user = {
      role: 'team_member',
      department: 'Sales',
      permissions: {
        tracked: { attendance: false, daily_log: false },
        modules: {
          attendance: false,
          daily_log: false,
          sales: true,
          content_calendar: false,
          website: false,
          ads: false,
        },
        levels: { finance: 'none', sales: 'own' },
      },
    };
    const layout = resolveTabs(user);
    assert.deepEqual(ids(user), ['tasks', 'sales', 'alerts', 'profile']);
    assert.equal(layout.showHome, false);
    assert.equal(layout.landingHref, '/(tabs)/tasks');
  });

  it('never uses the user name to choose tabs', () => {
    const access = {
      role: 'admin' as const,
      permissions: {
        tracked: { attendance: false, daily_log: false },
        modules: { sales: true, content_calendar: true, website: true, ads: true },
        levels: { finance: 'manage' },
      },
    };
    const a = resolveTabs({ ...access, name: 'Ayesha' });
    const b = resolveTabs({ ...access, name: 'Zubair' });
    assert.deepEqual(
      a.tabs.map((t) => t.id),
      b.tabs.map((t) => t.id),
    );
  });

  it('includes Requests when attendance is on and never exceeds 5 tabs', () => {
    const cases = [
      { role: 'admin', permissions: { modules: { sales: true, content_calendar: true, website: true, ads: true }, levels: { finance: 'manage' }, tracked: { attendance: false, daily_log: false } } },
      { role: 'operations', permissions: { modules: { sales: true, content_calendar: true, website: true, ads: true }, levels: { finance: 'manage' }, tracked: { attendance: true, daily_log: false } } },
      { role: 'hr', permissions: { modules: { sales: false }, tracked: { attendance: true, daily_log: true } } },
    ];
    for (const user of cases) {
      const layout = resolveTabs(user);
      assert.equal(layout.tabs.some((t) => t.id === 'requests'), true);
      assert.ok(layout.tabs.length <= 5);
    }
  });

  it('routes attendance and task notification taps through allowed modules', () => {
    const dataviz = {
      role: 'admin',
      company_modules: ['sales', 'active_clients'],
      permissions: { capabilities: { approve_won_deal: true } },
    };
    assert.equal(routeForNotification(dataviz, { type: 'attendance_check_in' }), '/(tabs)/pipeline');
    assert.equal(routeForNotification(dataviz, { type: 'task_assigned', task_id: 't1' }), '/(tabs)/pipeline');
    assert.ok(routeForNotification(dataviz, { type: 'crm_lead', lead_id: 'abc' }).includes('abc'));
  });
});
