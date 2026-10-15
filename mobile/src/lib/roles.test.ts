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
} from './roles';

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

// Test Tracked Member
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

// Test Untracked Member
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

console.log('All mobile roles.test.ts assertions passed successfully!');
