import { canAccessCrm, canAssignCrmLeads } from './crmAccess';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// 1. Admin access
const adminUser = { role: 'admin', department: 'All' };
assert(canAccessCrm(adminUser), 'Admin must have CRM access');
assert(canAssignCrmLeads(adminUser), 'Admin must be able to assign leads');

// 2. Operations access
const opsUser = { role: 'operations', department: 'operations' };
assert(canAccessCrm(opsUser), 'Operations must have CRM access');
assert(canAssignCrmLeads(opsUser), 'Operations must be able to assign leads');

// 3. Sales Team Lead access
const salesLead = { role: 'team_lead', department: 'Sales' };
assert(canAccessCrm(salesLead), 'Sales Team Lead must have CRM access');
assert(canAssignCrmLeads(salesLead), 'Sales Team Lead must be able to assign leads');

const salesLeadLower = { role: 'team_lead', department: 'sales' };
assert(canAccessCrm(salesLeadLower), 'Sales Team Lead (lowercase) must have CRM access');
assert(canAssignCrmLeads(salesLeadLower), 'Sales Team Lead (lowercase) must be able to assign leads');

// 4. Sales Team Member access
const salesMember = { role: 'team_member', department: 'Sales' };
assert(canAccessCrm(salesMember), 'Sales Team Member must have CRM access');
assert(!canAssignCrmLeads(salesMember), 'Sales Team Member must NOT be able to assign leads');

const salesMemberAlias = { role: 'member', department: 'sales' };
assert(canAccessCrm(salesMemberAlias), 'Sales Member alias must have CRM access');
assert(!canAssignCrmLeads(salesMemberAlias), 'Sales Member alias must NOT be able to assign leads');

// 5. Explicitly disabled user
const disabledSalesLead = { role: 'team_lead', department: 'Sales', crm_enabled: false };
assert(!canAccessCrm(disabledSalesLead), 'crm_enabled=false must block CRM access');
assert(!canAssignCrmLeads(disabledSalesLead), 'crm_enabled=false must block lead assignment');

// 6. Performance Marketing denied
const pmLead = { role: 'team_lead', department: 'Performance Marketing' };
assert(!canAccessCrm(pmLead), 'Performance Marketing Team Lead must NOT have CRM access');
assert(!canAssignCrmLeads(pmLead), 'Performance Marketing Team Lead must NOT be able to assign CRM leads');

const pmMember = { role: 'team_member', department: 'Performance Marketing' };
assert(!canAccessCrm(pmMember), 'Performance Marketing Member must NOT have CRM access');

// 7. Other departments denied
const otherDepts = [
  'Website',
  'Creative',
  'Content',
  'SEO',
  'AI',
  'Software Development',
  'HR',
];
for (const dept of otherDepts) {
  const lead = { role: 'team_lead', department: dept };
  const member = { role: 'team_member', department: dept };
  assert(!canAccessCrm(lead), `${dept} Team Lead must NOT have CRM access`);
  assert(!canAssignCrmLeads(lead), `${dept} Team Lead must NOT be able to assign leads`);
  assert(!canAccessCrm(member), `${dept} Member must NOT have CRM access`);
}

// 8. Client and HR roles denied
assert(!canAccessCrm({ role: 'client', department: 'Sales' }), 'Client in Sales must NOT have CRM access');
assert(!canAccessCrm({ role: 'hr', department: 'Sales' }), 'HR in Sales must NOT have CRM access');

// 9. Null/empty user
assert(!canAccessCrm(null), 'Null user must NOT have CRM access');
assert(!canAccessCrm(undefined), 'Undefined user must NOT have CRM access');
assert(!canAccessCrm({}), 'Empty user must NOT have CRM access');

console.log('All crmAccess tests passed successfully!');
