import { describe, it } from 'vitest';
import { getCompanyInitials } from '../components/owner/CompanyMark';
import { deriveSlug } from '../components/owner/CreateCompanyDialog';
import {
  generateStrongPassword,
  calculatePasswordStrength,
} from '../components/owner/StartingPasswordField';
import {
  formatAuditSentence,
  formatAuditWhen,
} from '../components/owner/OwnerActivityTab';
import type { Company, OwnerAuditEvent, OwnerMember } from '../services/ownerService';

describe('ownerConsole', () => {
  it('runs ownerConsole test suite', () => {

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running Owner Console unit tests...');

// 1. Test getCompanyInitials
assert(getCompanyInitials('Reamarc') === 'R', 'Single word company should have first letter');
assert(getCompanyInitials('Acme Corp') === 'AC', 'Two word company should have first and last initials');
assert(getCompanyInitials('Sample Company A') === 'SA', 'Multi-word company should have first and last initials');
assert(getCompanyInitials('Sample Company A', true) === 'A', 'Single letter mode with single-char suffix should return suffix');
assert(getCompanyInitials('Company B', true) === 'B', 'Single letter mode with suffix "B" should return "B"');
assert(getCompanyInitials('Acme Corp', true) === 'A', 'Single letter mode for regular multi-word returns first char');
assert(getCompanyInitials('Sample Admin A') === 'SA', 'Sample Admin A initials');
assert(getCompanyInitials('Sample Member') === 'SM', 'Sample Member initials');
assert(getCompanyInitials('') === 'C', 'Empty name defaults to C');
assert(getCompanyInitials(null) === 'C', 'Null name defaults to C');

// 2. Test deriveSlug
assert(deriveSlug('Acme Corp.') === 'acme-corp', 'Punctuation stripped and lowercased');
assert(deriveSlug('  Sample Company A  ') === 'sample-company-a', 'Whitespace trimmed and replaced with dash');
assert(deriveSlug('---Special & Characters---') === 'special-characters', 'Leading and trailing hyphens stripped');

// 3. Test generateStrongPassword & calculatePasswordStrength
for (let i = 0; i < 20; i++) {
  const p = generateStrongPassword();
  assert(p.length === 16, 'Generated password must be 16 characters long');
  assert(!/[0OIl1]/.test(p), 'Generated password must not contain ambiguous chars (0, O, I, l, 1)');
  assert(/[A-Z]/.test(p), 'Must contain uppercase');
  assert(/[a-z]/.test(p), 'Must contain lowercase');
  assert(/[0-9]/.test(p), 'Must contain digits');
  assert(/[^A-Za-z0-9]/.test(p), 'Must contain symbols');
  assert(calculatePasswordStrength(p) === 4, '16-char strong password must score 4/4');
}

assert(calculatePasswordStrength('') === 0, 'Empty password scores 0');
assert(calculatePasswordStrength('abc') === 0, 'Short simple password scores 0');
assert(calculatePasswordStrength('Short1!') === 2, 'Under 10 char mixed password scores 2');
assert(calculatePasswordStrength('ValidLength123') === 3, '14-char alphanumeric scores 3');

// 4. Test formatAuditSentence
const mockCompanies = new Map<string, Company>([
  [
    'comp_1',
    {
      id: 'comp_1',
      name: 'Sample Company A',
      slug: 'sample-company-a',
      plan: 'pro',
      status: 'active',
      timezone: 'UTC',
      accent_color: '#6847E0',
      limits: { max_users: 50 },
    },
  ],
]);

const mockMembers = new Map<string, OwnerMember>([
  [
    'usr_1',
    {
      id: 'usr_1',
      email: 'admin@sample-a.test',
      name: 'Sample Admin A',
      full_name: 'Sample Admin A',
      is_active: true,
      is_super_admin: false,
      memberships: [],
    },
  ],
]);

// create_company
const createEv: OwnerAuditEvent = {
  id: 'ev_1',
  created_at: new Date().toISOString(),
  hash: 'mock_hash',
  prev_hash: 'mock_prev_hash',
  actor_user_id: 'owner_1',
  action: 'create_company',
  target_company_id: 'comp_1',
  details: { admin_email: 'admin@sample-a.test' },
};
const createSentence = formatAuditSentence(createEv, mockCompanies, mockMembers);
assert(createSentence.sentence === 'Created Sample Company A', 'create_company sentence');
assert(createSentence.secondary === 'First admin: admin@sample-a.test', 'create_company secondary');

// update_company -> suspended
const suspendEv: OwnerAuditEvent = {
  id: 'ev_2',
  created_at: new Date().toISOString(),
  hash: 'mock_hash',
  prev_hash: 'mock_prev_hash',
  actor_user_id: 'owner_1',
  action: 'update_company',
  target_company_id: 'comp_1',
  details: { status: 'suspended' },
};
const suspendSentence = formatAuditSentence(suspendEv, mockCompanies, mockMembers);
assert(suspendSentence.sentence === 'Paused Sample Company A', 'update_company suspended sentence');

// update_company -> active
const resumeEv: OwnerAuditEvent = {
  id: 'ev_3',
  created_at: new Date().toISOString(),
  hash: 'mock_hash',
  prev_hash: 'mock_prev_hash',
  actor_user_id: 'owner_1',
  action: 'update_company',
  target_company_id: 'comp_1',
  details: { status: 'active' },
};
const resumeSentence = formatAuditSentence(resumeEv, mockCompanies, mockMembers);
assert(resumeSentence.sentence === 'Resumed Sample Company A', 'update_company resumed sentence');

// enter_company
const enterEv: OwnerAuditEvent = {
  id: 'ev_4',
  created_at: new Date().toISOString(),
  hash: 'mock_hash',
  prev_hash: 'mock_prev_hash',
  actor_user_id: 'owner_1',
  action: 'enter_company',
  target_company_id: 'comp_1',
};
const enterSentence = formatAuditSentence(enterEv, mockCompanies, mockMembers);
assert(enterSentence.sentence === 'Opened Sample Company A as owner (read-only)', 'enter_company sentence');

// reset_token_version
const resetEv: OwnerAuditEvent = {
  id: 'ev_5',
  created_at: new Date().toISOString(),
  hash: 'mock_hash',
  prev_hash: 'mock_prev_hash',
  actor_user_id: 'owner_1',
  action: 'reset_token_version',
  target_company_id: 'comp_1',
};
const resetSentence = formatAuditSentence(resetEv, mockCompanies, mockMembers);
assert(resetSentence.sentence === 'Signed everyone out of Sample Company A', 'reset_token_version sentence');

// provision_member
const provEv: OwnerAuditEvent = {
  id: 'ev_6',
  created_at: new Date().toISOString(),
  hash: 'mock_hash',
  prev_hash: 'mock_prev_hash',
  actor_user_id: 'owner_1',
  action: 'provision_member',
  target_company_id: 'comp_1',
  details: { target_user_id: 'usr_1' },
};
const provSentence = formatAuditSentence(provEv, mockCompanies, mockMembers);
assert(provSentence.sentence === 'Added Sample Admin A to Sample Company A', 'provision_member sentence');

// grant_company_access
const grantEv: OwnerAuditEvent = {
  id: 'ev_7',
  created_at: new Date().toISOString(),
  hash: 'mock_hash',
  prev_hash: 'mock_prev_hash',
  actor_user_id: 'owner_1',
  action: 'grant_company_access',
  target_company_id: 'comp_1',
  details: { target_user_id: 'usr_1' },
};
const grantSentence = formatAuditSentence(grantEv, mockCompanies, mockMembers);
assert(grantSentence.sentence === 'Gave Sample Admin A access to Sample Company A', 'grant_company_access sentence');

// remove_company_access
const removeEv: OwnerAuditEvent = {
  id: 'ev_8',
  created_at: new Date().toISOString(),
  hash: 'mock_hash',
  prev_hash: 'mock_prev_hash',
  actor_user_id: 'owner_1',
  action: 'remove_company_access',
  target_company_id: 'comp_1',
  details: { target_user_id: 'usr_1' },
};
const removeSentence = formatAuditSentence(removeEv, mockCompanies, mockMembers);
assert(removeSentence.sentence === "Removed Sample Admin A's access to Sample Company A", 'remove_company_access sentence');

// set_starting_password
const pwdEv: OwnerAuditEvent = {
  id: 'ev_9',
  created_at: new Date().toISOString(),
  hash: 'mock_hash',
  prev_hash: 'mock_prev_hash',
  actor_user_id: 'owner_1',
  action: 'set_starting_password',
  details: { target_user_id: 'usr_1' },
};
const pwdSentence = formatAuditSentence(pwdEv, mockCompanies, mockMembers);
assert(pwdSentence.sentence === 'Set a new starting password for Sample Admin A', 'set_starting_password sentence');

// branding events
const brandEv: OwnerAuditEvent = {
  id: 'ev_10',
  created_at: new Date().toISOString(),
  hash: 'mock_hash',
  prev_hash: 'mock_prev_hash',
  actor_user_id: 'owner_1',
  action: 'company_branding_updated',
  target_company_id: 'comp_1',
};
assert(formatAuditSentence(brandEv, mockCompanies, mockMembers).sentence === 'Updated branding for Sample Company A', 'branding sentence');

const logoEv: OwnerAuditEvent = {
  id: 'ev_11',
  created_at: new Date().toISOString(),
  hash: 'mock_hash',
  prev_hash: 'mock_prev_hash',
  actor_user_id: 'owner_1',
  action: 'company_logo_uploaded',
  target_company_id: 'comp_1',
};
assert(formatAuditSentence(logoEv, mockCompanies, mockMembers).sentence === 'Uploaded a logo for Sample Company A', 'logo sentence');

// 5. Test formatAuditWhen
const nowStr = new Date().toISOString();
const formattedTime = formatAuditWhen(nowStr);
assert(formattedTime.startsWith('Today, '), 'Today timestamps start with Today, ');

console.log('✓ All Owner Console unit tests passed successfully!');
  });
});
