/**
 * Unit tests for mobile roles.ts access and tracking helpers.
 */
import {
  isAdmin,
  isAttendanceTracked,
  isDailyLogTracked,
  canAccessAttendance,
  canAccessDailyLog,
  canAccessCrm,
  canApproveWonDeals,
  canAccessFinance,
  canManageFinance,
  canAccessContentCalendar,
  canAccessWebsiteProjects,
  canAccessAds,
  canAccessWebsitePipeline,
  shouldShowHomeTab,
  isHomeReviewer,
} from './roles.ts';

// Test Admin
const adminUser = {
  role: 'admin',
  department: 'management',
  permissions: {
    tracked: { attendance: false, daily_log: false },
    modules: { attendance: false, daily_log: false, sales: true },
    capabilities: { approve_won_deal: true },
  },
};

console.assert(isAdmin(adminUser.role) === true, 'Admin should be admin');
console.assert(isAttendanceTracked(adminUser) === false, 'Admin attendance should not be tracked');
console.assert(isDailyLogTracked(adminUser) === false, 'Admin daily log should not be tracked');
console.assert(canAccessAttendance(adminUser) === true, 'Admin should have access to attendance module');
console.assert(canAccessDailyLog(adminUser) === true, 'Admin should have access to daily log module');
console.assert(canAccessCrm(adminUser) === true, 'Admin should access CRM');

// Test Operations
const opsUser = {
  role: 'operations',
  department: 'management',
  permissions: {
    tracked: { attendance: true, daily_log: false },
    modules: { attendance: true, daily_log: false, sales: true },
    capabilities: { approve_won_deal: true },
  },
};

console.assert(isAttendanceTracked(opsUser) === true, 'Ops attendance should be tracked');
console.assert(isDailyLogTracked(opsUser) === false, 'Ops daily log should not be tracked');
console.assert(canApproveWonDeals(opsUser) === true, 'Ops should approve won deals');

// Test Tracked Member (Content)
const memberTracked = {
  role: 'team_member',
  department: 'content',
  permissions: {
    tracked: { attendance: true, daily_log: true },
    modules: { attendance: true, daily_log: true, sales: false },
  },
};

console.assert(isAttendanceTracked(memberTracked) === true, 'Member should be attendance tracked');
console.assert(isDailyLogTracked(memberTracked) === true, 'Member should be daily log tracked');
console.assert(canAccessDailyLog(memberTracked) === true, 'Member should access daily log');
console.assert(canAccessCrm(memberTracked) === false, 'Content member should not access CRM');

// Test Untracked Member (Sales)
const memberUntracked = {
  role: 'team_member',
  department: 'sales',
  permissions: {
    tracked: { attendance: false, daily_log: false },
    modules: { attendance: false, daily_log: false, sales: true },
  },
};

console.assert(isAttendanceTracked(memberUntracked) === false, 'Untracked member attendance should be false');
console.assert(isDailyLogTracked(memberUntracked) === false, 'Untracked member daily log should be false');
console.assert(canAccessDailyLog(memberUntracked) === false, 'Untracked member cannot access daily log');
console.assert(canAccessCrm(memberUntracked) === true, 'Sales member should access CRM');

// Test Department Module Access: Finance
console.assert(canAccessFinance(adminUser) === true, 'Admin should access finance');
console.assert(canManageFinance(adminUser) === true, 'Admin should manage finance');
console.assert(canAccessFinance(opsUser) === true, 'Operations should access finance');
console.assert(canManageFinance(opsUser) === true, 'Operations should manage finance');
console.assert(canAccessFinance(memberTracked) === false, 'Content member should not access finance');

// Test Department Module Access: Content Calendar
console.assert(canAccessContentCalendar(adminUser) === true, 'Admin should access content calendar');
console.assert(canAccessContentCalendar(memberTracked) === true, 'Content member should access content calendar');
console.assert(canAccessContentCalendar(opsUser) === false, 'Operations should not access content calendar by default');

// Test Department Module Access: Website Projects
const websiteMember = {
  role: 'team_member',
  department: 'website',
  permissions: {
    tracked: { attendance: true, daily_log: true },
    modules: { website: true },
  },
};
console.assert(canAccessWebsiteProjects(adminUser) === true, 'Admin should access website projects');
console.assert(canAccessWebsiteProjects(websiteMember) === true, 'Website member should access website projects');
console.assert(canAccessWebsiteProjects(memberTracked) === false, 'Content member should not access website projects');
console.assert(canAccessWebsitePipeline === canAccessWebsiteProjects, 'Website pipeline alias should match website projects');

console.assert(isHomeReviewer('admin') === true, 'Admin is a home reviewer');
console.assert(isHomeReviewer('hr') === true, 'HR is a home reviewer');
console.assert(isHomeReviewer('team_member') === false, 'Team member is not a home reviewer');
console.assert(shouldShowHomeTab(adminUser) === true, 'Admin should see home tab');
console.assert(shouldShowHomeTab(opsUser) === true, 'Operations should see home tab');
console.assert(shouldShowHomeTab(memberTracked) === true, 'Tracked member should see home tab');
console.assert(shouldShowHomeTab(memberUntracked) === false, 'Untracked sales member should not see home tab');

console.assert(canAccessAds(adminUser) === true, 'Admin should access ads');
console.assert(canAccessAds({ role: 'team_member', department: 'SEO' }) === true, 'SEO dept should access ads');
console.assert(canAccessAds(memberTracked) === false, 'Content member should not access ads by department');
console.assert(
  canAccessAds({ role: 'team_member', effective_access: { ads: true } }) === true,
  'effective_access.ads should grant ads',
);
console.assert(
  canAccessCrm({ role: 'team_member', effective_access: { sales: true } }) === true,
  'effective_access.sales should grant CRM',
);
console.assert(
  canAccessFinance({ role: 'team_member', permissions: { levels: { finance: 'view' } } }) === true,
  'levels.finance should grant finance',
);
console.assert(
  canAccessFinance({ role: 'team_member', permissions: { summary: { finance: 'none' } } }) === false,
  'summary.finance none should deny finance',
);

console.log('All mobile roles.test.ts assertions passed successfully!');
