import { canAccessCrm, canAssignCrmLeads } from './crmAccess';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function withSales(role: string, sales: string, extra?: { crm_enabled?: boolean }) {
  return {
    role,
    crm_enabled: extra?.crm_enabled,
    permissions: {
      summary: { sales },
      modules: { sales: { Sales: sales } },
    },
  };
}

function withNoSales(role: string, extraSummary?: Record<string, string>) {
  return {
    role,
    permissions: {
      summary: { sales: 'none', ...extraSummary },
      modules: { sales: { Sales: 'none' } },
    },
  };
}

// 1. Admin access
const adminUser = { role: 'admin', permissions: { summary: { sales: 'all' } } };
assert(canAccessCrm(adminUser), 'Admin must have CRM access');
assert(canAssignCrmLeads(adminUser), 'Admin must be able to assign leads');

const opsViewer = withSales('operations', 'all');
assert(canAccessCrm(opsViewer), 'Operations with sales view must have CRM access');
assert(!canAssignCrmLeads(opsViewer), 'Operations must NOT be able to assign leads');

const opsUser = withNoSales('operations');
assert(!canAccessCrm(opsUser), 'Operations must NOT have CRM access without sales permission');
assert(!canAssignCrmLeads(opsUser), 'Operations must NOT be able to assign leads');

// 3. Sales Team Lead access
const salesLead = withSales('team_lead', 'department');
assert(canAccessCrm(salesLead), 'Sales Team Lead must have CRM access');
assert(canAssignCrmLeads(salesLead), 'Sales Team Lead must be able to assign leads');

const salesLeadAll = withSales('team_lead', 'all');
assert(canAccessCrm(salesLeadAll), 'Sales Team Lead (all) must have CRM access');
assert(canAssignCrmLeads(salesLeadAll), 'Sales Team Lead (all) must be able to assign leads');

// 4. Sales Team Member access
const salesMember = withSales('team_member', 'own');
assert(canAccessCrm(salesMember), 'Sales Team Member must have CRM access');
assert(!canAssignCrmLeads(salesMember), 'Sales Team Member must NOT be able to assign leads');

const salesMemberAlias = withSales('member', 'own');
assert(canAccessCrm(salesMemberAlias), 'Sales Member alias must have CRM access');
assert(!canAssignCrmLeads(salesMemberAlias), 'Sales Member alias must NOT be able to assign leads');

// 5. Explicitly disabled user
const disabledSalesLead = withSales('team_lead', 'department', { crm_enabled: false });
assert(!canAccessCrm(disabledSalesLead), 'crm_enabled=false must block CRM access');
assert(!canAssignCrmLeads(disabledSalesLead), 'crm_enabled=false must block lead assignment');

// 6. Performance Marketing denied (no sales permission)
const pmLead = withNoSales('team_lead', { ads: 'manage' });
assert(!canAccessCrm(pmLead), 'Performance Marketing Team Lead must NOT have CRM access');
assert(!canAssignCrmLeads(pmLead), 'Performance Marketing Team Lead must NOT be able to assign CRM leads');

const pmMember = withNoSales('team_member', { ads: 'view' });
assert(!canAccessCrm(pmMember), 'Performance Marketing Member must NOT have CRM access');

// 7. Other modules denied without sales permission
const otherModules = ['website', 'content_calendar', 'attendance', 'daily_log'] as const;
for (const module of otherModules) {
  const lead = withNoSales('team_lead', { [module]: 'manage' });
  const member = withNoSales('team_member', { [module]: 'own' });
  assert(!canAccessCrm(lead), `${module} Team Lead must NOT have CRM access`);
  assert(!canAssignCrmLeads(lead), `${module} Team Lead must NOT be able to assign leads`);
  assert(!canAccessCrm(member), `${module} Member must NOT have CRM access`);
}

// 8. Operations or content user without sales permission is denied
assert(!canAccessCrm(withNoSales('operations')), 'Operations without sales permission must NOT have CRM access');
assert(
  !canAccessCrm(withNoSales('team_member', { content_calendar: 'own_stages' })),
  'Content user without sales permission must NOT have CRM access',
);
assert(!canAccessCrm({ role: 'client', crm_enabled: true, permissions: { summary: { sales: 'none' } } }), 'Client must NOT have CRM access');
assert(!canAccessCrm({ role: 'hr', permissions: { summary: { sales: 'none' } } }), 'HR must NOT have CRM access');

// 9. Null/empty user
assert(!canAccessCrm(null), 'Null user must NOT have CRM access');
assert(!canAccessCrm(undefined), 'Undefined user must NOT have CRM access');
assert(!canAccessCrm({}), 'Empty user must NOT have CRM access');

console.log('All crmAccess tests passed successfully!');
