import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAccessAds,
  canAccessAttendance,
  canAccessContentCalendar,
  canAccessCrm,
  canAccessDailyLog,
  canAccessFinance,
  canAccessTasks,
  canAccessWebsiteProjects,
  canApproveWonDeals,
  canBroadcast,
  canManageFinance,
  canReviewRequests,
  isAttendanceTracked,
  isCompanyModuleEnabled,
  isDailyLogTracked,
  isHomeReviewer,
  shouldShowHomeTab,
} from './roles.ts';
import { isMobileRouteAllowed, resolveTabs } from './tabResolver.ts';

const DATAVIZ = ['sales', 'active_clients'] as const;

const ROLES = ['admin', 'operations', 'hr', 'team_lead', 'team_member', 'client'] as const;

function snapshot(user: any) {
  return {
    tabs: resolveTabs(user).tabs.map((t) => t.id),
    sidebar: resolveTabs(user).sidebar.map((t) => t.id),
    landing: resolveTabs(user).landingHref,
    crm: canAccessCrm(user),
    won: canApproveWonDeals(user),
    finance: canAccessFinance(user),
    manageFinance: canManageFinance(user),
    attendance: canAccessAttendance(user),
    dailyLog: canAccessDailyLog(user),
    content: canAccessContentCalendar(user),
    website: canAccessWebsiteProjects(user),
    ads: canAccessAds(user),
    tasks: canAccessTasks(user),
    trackedAtt: isAttendanceTracked(user),
    trackedLog: isDailyLogTracked(user),
    home: shouldShowHomeTab(user),
    homeReviewer: isHomeReviewer(user),
    review: canReviewRequests(user),
    broadcast: canBroadcast(user),
  };
}

describe('company modules', () => {
  it('null allow-list keeps every helper on for a Reamarc admin', () => {
    const user = { role: 'admin', company_modules: null };
    const snap = snapshot(user);
    assert.equal(isCompanyModuleEnabled(user, 'tasks'), true);
    assert.equal(snap.home, true);
    assert.equal(snap.crm, true);
    assert.equal(snap.tasks, true);
    assert.equal(snap.finance, true);
    assert.deepEqual(snap.tabs[0], 'home');
    assert.ok(snap.sidebar.includes('tasks'));
  });

  it('empty array disables keys on the client (same as web includes())', () => {
    const user = { role: 'admin', company_modules: [] };
    assert.equal(isCompanyModuleEnabled(user, 'sales'), false);
    assert.equal(shouldShowHomeTab(user), false);
    assert.equal(canAccessCrm(user), false);
  });

  it('DataViz allow-list is Sales, Alerts, Profile, plus won-deals for approvers', () => {
    for (const role of ROLES) {
      if (role === 'client') continue;
      const user = {
        role,
        company_modules: [...DATAVIZ],
        permissions: {
          capabilities: { approve_won_deal: role === 'operations' || role === 'admin' },
          modules: { sales: true },
          summary: { sales: 'all' },
        },
      };
      const layout = resolveTabs(user);
      const tabIds = layout.tabs.map((t) => t.id);
      const sideIds = layout.sidebar.map((t) => t.id);
      assert.ok(tabIds.includes('sales') || role === 'hr', `sales tab for ${role}: ${tabIds}`);
      if (role !== 'hr') {
        assert.equal(layout.landingHref, '/(tabs)/pipeline');
      }
      assert.equal(tabIds.includes('home'), false);
      assert.equal(tabIds.includes('daily_log'), false);
      assert.equal(tabIds.includes('tasks'), false);
      assert.equal(tabIds.includes('finance'), false);
      assert.equal(tabIds.includes('requests'), false);
      assert.ok(sideIds.includes('alerts'));
      assert.ok(sideIds.includes('profile'));
      if (role === 'operations' || role === 'admin') {
        assert.equal(canApproveWonDeals(user), role === 'operations' || Boolean(user.permissions.capabilities.approve_won_deal));
      }
      if (role === 'operations') {
        assert.ok(sideIds.includes('won_deals'));
        assert.equal(canApproveWonDeals(user), true);
      }
    }
  });

  it('DataViz HR has no sales tab and lands on alerts or profile', () => {
    const user = { role: 'hr', company_modules: [...DATAVIZ] };
    const layout = resolveTabs(user);
    assert.equal(layout.tabs.some((t) => t.id === 'sales'), false);
    assert.equal(layout.showHome, false);
    assert.ok(['/alerts', '/profile', '/(tabs)/alerts', '/(tabs)/profile'].includes(layout.landingHref));
  });

  it('deep links to disabled modules are rejected for DataViz', () => {
    const user = { role: 'admin', company_modules: [...DATAVIZ] };
    assert.equal(isMobileRouteAllowed(user, ['daily-log']), false);
    assert.equal(isMobileRouteAllowed(user, ['tasks']), false);
    assert.equal(isMobileRouteAllowed(user, ['(tabs)', 'requests']), false);
    assert.equal(isMobileRouteAllowed(user, ['(tabs)', 'pipeline']), true);
    assert.equal(isMobileRouteAllowed(user, ['(tabs)', 'alerts']), true);
  });

  it('removing the home gate would show Home for DataViz admin (breakage proof)', () => {
    const user = { role: 'admin', company_modules: [...DATAVIZ] };
    assert.equal(shouldShowHomeTab(user), false);
    assert.equal(isCompanyModuleEnabled(user, 'attendance'), false);
  });
});
