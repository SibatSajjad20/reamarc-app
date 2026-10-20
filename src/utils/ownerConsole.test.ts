import { describe, it, expect } from 'vitest';
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

describe('Owner Console Unit Tests', () => {
  describe('getCompanyInitials', () => {
    it('handles single word company name', () => {
      expect(getCompanyInitials('Reamarc')).toBe('R');
    });

    it('handles two word company name', () => {
      expect(getCompanyInitials('Acme Corp')).toBe('AC');
    });

    it('handles multi-word company name', () => {
      expect(getCompanyInitials('Sample Company A')).toBe('SA');
    });

    it('handles single letter mode with single-char suffix', () => {
      expect(getCompanyInitials('Sample Company A', true)).toBe('A');
      expect(getCompanyInitials('Company B', true)).toBe('B');
    });

    it('handles single letter mode for regular multi-word', () => {
      expect(getCompanyInitials('Acme Corp', true)).toBe('A');
    });

    it('handles person names', () => {
      expect(getCompanyInitials('Sample Admin A')).toBe('SA');
      expect(getCompanyInitials('Sample Member')).toBe('SM');
    });

    it('defaults to C for empty or null', () => {
      expect(getCompanyInitials('')).toBe('C');
      expect(getCompanyInitials(null)).toBe('C');
    });

    it('skips tokens that do not start with a letter', () => {
      expect(getCompanyInitials('Sample Company C (paused)')).toBe('SC');
      expect(getCompanyInitials('Sample Company C (paused)', true)).toBe('C');
    });
  });

  describe('deriveSlug', () => {
    it('strips punctuation and lowercases', () => {
      expect(deriveSlug('Acme Corp.')).toBe('acme-corp');
    });

    it('trims whitespace and replaces with dash', () => {
      expect(deriveSlug('  Sample Company A  ')).toBe('sample-company-a');
    });

    it('strips leading and trailing hyphens and special characters', () => {
      expect(deriveSlug('---Special & Characters---')).toBe('special-characters');
    });
  });

  describe('generateStrongPassword and calculatePasswordStrength', () => {
    it('generates compliant 16-character passwords without ambiguous chars', () => {
      for (let i = 0; i < 20; i++) {
        const p = generateStrongPassword();
        expect(p).toHaveLength(16);
        expect(/[0OIl1]/.test(p)).toBe(false);
        expect(/[A-Z]/.test(p)).toBe(true);
        expect(/[a-z]/.test(p)).toBe(true);
        expect(/[0-9]/.test(p)).toBe(true);
        expect(/[^A-Za-z0-9]/.test(p)).toBe(true);
        expect(calculatePasswordStrength(p)).toBe(4);
      }
    });

    it('evaluates password strength correctly', () => {
      expect(calculatePasswordStrength('')).toBe(0);
      expect(calculatePasswordStrength('abc')).toBe(0);
      expect(calculatePasswordStrength('Short1!')).toBe(2);
      expect(calculatePasswordStrength('ValidLength123')).toBe(3);
    });
  });

  describe('formatAuditSentence', () => {
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

    it('formats create_company', () => {
      const ev: OwnerAuditEvent = {
        id: 'ev_1',
        created_at: new Date().toISOString(),
        hash: 'mock_hash',
        prev_hash: 'mock_prev_hash',
        actor_user_id: 'owner_1',
        action: 'create_company',
        target_company_id: 'comp_1',
        details: { admin_email: 'admin@sample-a.test' },
      };
      const result = formatAuditSentence(ev, mockCompanies, mockMembers);
      expect(result.sentence).toBe('Created Sample Company A');
      expect(result.secondary).toBe('First admin: admin@sample-a.test');
    });

    it('formats update_company for suspended and active', () => {
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
      expect(formatAuditSentence(suspendEv, mockCompanies, mockMembers).sentence).toBe('Paused Sample Company A');

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
      expect(formatAuditSentence(resumeEv, mockCompanies, mockMembers).sentence).toBe('Resumed Sample Company A');
    });

    it('formats enter_company', () => {
      const ev: OwnerAuditEvent = {
        id: 'ev_4',
        created_at: new Date().toISOString(),
        hash: 'mock_hash',
        prev_hash: 'mock_prev_hash',
        actor_user_id: 'owner_1',
        action: 'enter_company',
        target_company_id: 'comp_1',
      };
      expect(formatAuditSentence(ev, mockCompanies, mockMembers).sentence).toBe('Opened Sample Company A as owner (read-only)');
    });

    it('formats reset_token_version', () => {
      const ev: OwnerAuditEvent = {
        id: 'ev_5',
        created_at: new Date().toISOString(),
        hash: 'mock_hash',
        prev_hash: 'mock_prev_hash',
        actor_user_id: 'owner_1',
        action: 'reset_token_version',
        target_company_id: 'comp_1',
      };
      expect(formatAuditSentence(ev, mockCompanies, mockMembers).sentence).toBe('Signed everyone out of Sample Company A');
    });

    it('formats member actions', () => {
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
      expect(formatAuditSentence(provEv, mockCompanies, mockMembers).sentence).toBe('Added Sample Admin A to Sample Company A');

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
      expect(formatAuditSentence(grantEv, mockCompanies, mockMembers).sentence).toBe('Gave Sample Admin A access to Sample Company A');

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
      expect(formatAuditSentence(removeEv, mockCompanies, mockMembers).sentence).toBe("Removed Sample Admin A's access to Sample Company A");

      const pwdEv: OwnerAuditEvent = {
        id: 'ev_9',
        created_at: new Date().toISOString(),
        hash: 'mock_hash',
        prev_hash: 'mock_prev_hash',
        actor_user_id: 'owner_1',
        action: 'set_starting_password',
        details: { target_user_id: 'usr_1' },
      };
      expect(formatAuditSentence(pwdEv, mockCompanies, mockMembers).sentence).toBe('Set a new starting password for Sample Admin A');
    });

    it('formats branding events', () => {
      const brandEv: OwnerAuditEvent = {
        id: 'ev_10',
        created_at: new Date().toISOString(),
        hash: 'mock_hash',
        prev_hash: 'mock_prev_hash',
        actor_user_id: 'owner_1',
        action: 'company_branding_updated',
        target_company_id: 'comp_1',
      };
      expect(formatAuditSentence(brandEv, mockCompanies, mockMembers).sentence).toBe('Updated branding for Sample Company A');

      const logoEv: OwnerAuditEvent = {
        id: 'ev_11',
        created_at: new Date().toISOString(),
        hash: 'mock_hash',
        prev_hash: 'mock_prev_hash',
        actor_user_id: 'owner_1',
        action: 'company_logo_uploaded',
        target_company_id: 'comp_1',
      };
      expect(formatAuditSentence(logoEv, mockCompanies, mockMembers).sentence).toBe('Uploaded a logo for Sample Company A');
    });

    it('formats unknown company as "a deleted company"', () => {
      const ev: OwnerAuditEvent = {
        id: 'ev_12',
        created_at: new Date().toISOString(),
        hash: 'mock_hash',
        prev_hash: 'mock_prev_hash',
        actor_user_id: 'owner_1',
        action: 'update_company',
        target_company_id: 'comp_deleted',
        details: { status: 'suspended' },
      };
      expect(formatAuditSentence(ev, mockCompanies, mockMembers).sentence).toBe('Paused a deleted company');
    });
  });

  describe('formatAuditWhen', () => {
    it('formats current timestamps with Today, prefix', () => {
      const nowStr = new Date().toISOString();
      expect(formatAuditWhen(nowStr).startsWith('Today, ')).toBe(true);
    });
  });
});
