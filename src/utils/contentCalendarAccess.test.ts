import { canAccessContentCalendar } from './contentCalendarAccess';
import { canCreateCampaign } from './contentCalendarWorkflow';
import { getRoleLabel } from './badgeStyles';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function withCal(role: string, level: string, extra?: Record<string, unknown>) {
  return {
    role,
    ...extra,
    permissions: {
      summary: { content_calendar: level },
      modules: { content_calendar: { Content: level } },
    },
  };
}

assert(canAccessContentCalendar({ role: 'admin', department: 'All' }), 'Admin must have access');
assert(canAccessContentCalendar(withCal('team_lead', 'manage')), 'Content team lead must have access');
assert(canAccessContentCalendar(withCal('team_member', 'own_stages')), 'Content member must have access');
assert(canAccessContentCalendar(withCal('operations', 'view')), 'Operations view must have access');

assert(!canAccessContentCalendar(withCal('team_lead', 'none')), 'Sales team lead must be denied');
assert(!canAccessContentCalendar({ role: 'hr', permissions: { summary: { content_calendar: 'none' } } }), 'HR must be denied');
assert(!canAccessContentCalendar({ role: 'client', permissions: { summary: { content_calendar: 'none' } } }), 'Client must be denied');
assert(
  !canAccessContentCalendar(withCal('team_lead', 'manage', { is_active: false })),
  'Inactive content team lead must be denied',
);
assert(!canAccessContentCalendar(null), 'Null user must be denied');

assert(!canCreateCampaign(withCal('operations', 'view')), 'Operations must not create campaigns');
assert(getRoleLabel('operations') === 'Operations', 'Operations label must not say Lead');
assert(getRoleLabel('operations_lead') === 'Operations', 'Alias must display as Operations');
assert(getRoleLabel('admin') === 'Admin', 'Admin label is Admin');

console.log('All contentCalendarAccess tests passed successfully!');
