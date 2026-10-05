import { canAccessContentCalendar } from './contentCalendarAccess';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(canAccessContentCalendar({ role: 'admin', department: 'All' }), 'Admin must have access');
assert(
  canAccessContentCalendar({ role: 'team_lead', department: 'Performance Marketing' }),
  'Performance Marketing team lead must have access',
);
assert(
  canAccessContentCalendar({ role: 'team_member', department: 'performance marketing' }),
  'Performance Marketing member must have access',
);
assert(
  canAccessContentCalendar({ role: 'team_lead', department: 'Content' }),
  'Content team lead must have access',
);
assert(
  canAccessContentCalendar({ role: 'member', department: 'creative' }),
  'Creative member alias must have access',
);
assert(
  canAccessContentCalendar({ role: 'team_lead', department: 'Content and Creative' }),
  'Combined Content and Creative team lead must have access',
);

assert(
  canAccessContentCalendar({ role: 'team_member', department: 'Social Media' }),
  'Social Media member must have access',
);

assert(!canAccessContentCalendar({ role: 'team_lead', department: 'Sales' }), 'Sales team lead must be denied');
assert(!canAccessContentCalendar({ role: 'team_member', department: 'SEO' }), 'SEO member must be denied');
assert(!canAccessContentCalendar({ role: 'operations', department: 'operations' }), 'Operations must be denied');
assert(!canAccessContentCalendar({ role: 'hr', department: 'Content' }), 'HR must be denied');
assert(!canAccessContentCalendar({ role: 'client', department: 'Creative' }), 'Client must be denied');
assert(
  !canAccessContentCalendar({ role: 'team_lead', department: 'Content', is_active: false }),
  'Inactive content team lead must be denied',
);
assert(!canAccessContentCalendar(null), 'Null user must be denied');
assert(!canAccessContentCalendar(undefined), 'Undefined user must be denied');
assert(!canAccessContentCalendar({}), 'Empty user must be denied');

console.log('All contentCalendarAccess tests passed successfully!');
