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
// Multi-department tests:
assert(
  canAccessContentCalendar({ role: 'team_lead', department: 'Creative, Content' }),
  'Creative + Content team lead via comma string must have access',
);
assert(
  canAccessContentCalendar({ role: 'team_lead', departments: ['Creative', 'Content'] }),
  'Creative + Content team lead via array must have access',
);
assert(
  canAccessContentCalendar({ role: 'team_member', department: 'Sales, Social Media' }),
  'Sales + Social Media member must have access via Social Media department',
);

console.log('All contentCalendarAccess tests passed successfully!');
