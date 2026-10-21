import { describe, it } from 'vitest';
import { canAccessContentCalendar } from './contentCalendarAccess';
import { canCreateCampaign } from './contentCalendarWorkflow';
import { getRoleLabel } from './badgeStyles';
import { userCan } from '../hooks/usePermissions';

describe('contentCalendarAccess', () => {
  it('runs contentCalendarAccess test suite', () => {

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
assert(canAccessContentCalendar({ role: 'operations' }), 'Operations must see calendar without permissions payload');
assert(userCan({ role: 'operations' }, 'sales', 'own'), 'Operations must see sales without permissions payload');
assert(userCan({ role: 'operations' }, 'website', 'view'), 'Operations must see website without permissions payload');
assert(userCan({ role: 'operations' }, 'active_clients', 'view'), 'Operations must see active clients');
assert(userCan({ role: 'hr' }, 'active_clients', 'view'), 'HR must see active clients');
assert(userCan({ role: 'team_member' }, 'active_clients', 'view'), 'Team members must see active clients');
assert(userCan({ role: 'team_lead' }, 'active_clients', 'view'), 'Team leads must see active clients');
assert(!userCan({ role: 'client' }, 'active_clients', 'view'), 'Clients must not see active clients');
assert(!userCan({ role: 'team_member' }, 'active_clients', 'manage'), 'Team members must not manage active clients');
assert(userCan({ role: 'operations' }, 'exceptions', 'department'), 'Operations must see exceptions');
assert(userCan({ role: 'operations' }, 'ads', 'view'), 'Operations must see performance marketing');
assert(!userCan({ role: 'operations' }, 'content_calendar', 'manage'), 'Operations must not manage calendar');
assert(!userCan({ role: 'hr' }, 'sales', 'own'), 'HR must not see sales');

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
  });
});
