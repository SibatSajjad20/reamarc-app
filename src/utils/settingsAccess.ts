import type { SettingsGroupKey, SettingsSectionMetadata } from '@/types/settings';
import { canAssignCrmLeads } from './crmAccess';
import {
  isContentLead,
  isCreativeLead,
  isPerformance,
} from './contentCalendarWorkflow';
import { isCompanyModuleEnabled, type CompanyModuleKey } from './companyModules';

export interface SettingsSectionItem extends SettingsSectionMetadata {
  isAllowed: (user: any) => boolean;
}

export const SETTINGS_SECTIONS: SettingsSectionItem[] = [
  // Account
  {
    slug: 'profile',
    group: 'account',
    groupLabel: 'Account',
    label: 'Profile',
    description: 'Personal details and work assignment overview.',
    isAllowed: (user) => Boolean(user),
  },
  {
    slug: 'security',
    group: 'account',
    groupLabel: 'Account',
    label: 'Security',
    description: 'Password and credential management.',
    isAllowed: (user) => Boolean(user),
  },
  {
    slug: 'notifications',
    group: 'account',
    groupLabel: 'Account',
    label: 'Notifications',
    description: 'Desktop alerts and browser push preferences.',
    isAllowed: (user) => Boolean(user),
  },
  {
    slug: 'appearance',
    group: 'account',
    groupLabel: 'Account',
    label: 'Appearance',
    description: 'Interface theme and color preferences.',
    isAllowed: (user) => Boolean(user),
  },

  // Organization
  {
    slug: 'attendance-shifts',
    group: 'organization',
    groupLabel: 'Organization',
    label: 'Attendance & shifts',
    description: 'Work schedules, shift rules, and member assignments.',
    isAllowed: (user) => (user?.role === 'admin' || user?.role === 'hr') && isCompanyModuleEnabled(user, 'attendance'),
  },
  {
    slug: 'holidays',
    group: 'organization',
    groupLabel: 'Organization',
    label: 'Holidays & calendar',
    description: 'Official holidays and company non-working dates.',
    isAllowed: (user) => (user?.role === 'admin' || user?.role === 'hr') && isCompanyModuleEnabled(user, 'attendance'),
  },
  {
    slug: 'leave-quotas',
    group: 'organization',
    groupLabel: 'Organization',
    label: 'Leave quotas',
    description: 'Annual leave allocations and employee quota balances.',
    isAllowed: (user) => (user?.role === 'admin' || user?.role === 'hr') && isCompanyModuleEnabled(user, 'attendance'),
  },
  {
    slug: 'daily-log-fields',
    group: 'organization',
    groupLabel: 'Organization',
    label: 'Daily log fields',
    description: 'Column structure and custom attributes for daily logs.',
    isAllowed: (user) => user?.role === 'admin' && isCompanyModuleEnabled(user, 'daily_log'),
  },
  {
    slug: 'mobile-alerts',
    group: 'organization',
    groupLabel: 'Organization',
    label: 'Mobile & alerts',
    description: 'Authorized mobile devices and push alert broadcasts.',
    isAllowed: (user) => (user?.role === 'admin' || user?.role === 'hr') && isCompanyModuleEnabled(user, 'attendance'),
  },
  {
    slug: 'access',
    group: 'organization',
    groupLabel: 'Organization',
    label: 'Access',
    description: 'Turn modules on or off per person. Levels follow each person\'s role.',
    isAllowed: (user) => user?.role === 'admin',
  },

  // Sales pipeline
  {
    slug: 'lead-sources',
    group: 'crm',
    groupLabel: 'Sales pipeline',
    label: 'Lead sources',
    description: 'Inbound webhooks, Meta Lead Ads pages, and queue health.',
    isAllowed: (user) => canAssignCrmLeads(user) && isCompanyModuleEnabled(user, 'sales'),
  },
  {
    slug: 'booking-scheduler',
    group: 'crm',
    groupLabel: 'Sales pipeline',
    label: 'Booking scheduler',
    description: 'Consultation scheduling links and embed codes.',
    isAllowed: (user) => canAssignCrmLeads(user) && isCompanyModuleEnabled(user, 'sales'),
  },
  {
    slug: 'message-templates',
    group: 'crm',
    groupLabel: 'Sales pipeline',
    label: 'Message templates',
    description: 'Reusable WhatsApp outreach and follow-up templates.',
    isAllowed: (user) => canAssignCrmLeads(user) && isCompanyModuleEnabled(user, 'sales'),
  },
  {
    slug: 'lead-routing',
    group: 'crm',
    groupLabel: 'Sales pipeline',
    label: 'Lead routing',
    description: 'Automated assignment rules, pools, and fallback reps.',
    isAllowed: (user) => canAssignCrmLeads(user) && isCompanyModuleEnabled(user, 'sales'),
  },

  // Content calendar
  {
    slug: 'content-calendar-fields',
    group: 'content-calendar',
    groupLabel: 'Content calendar',
    label: 'Field values',
    description: 'Predefined creative deliverables, pillars, and review statuses.',
    isAllowed: (user) => canEditContentCalendarFields(user) && isCompanyModuleEnabled(user, 'content_calendar'),
  },

  // Performance marketing
  {
    slug: 'ad-accounts',
    group: 'marketing',
    groupLabel: 'Performance marketing',
    label: 'Ad accounts',
    description: 'Connected ad accounts and marketing platform credentials.',
    isAllowed: (user) => user?.role === 'admin' && isCompanyModuleEnabled(user, 'ads'),
  },
];

export function getVisibleSettingsSections(user: any): SettingsSectionItem[] {
  if (!user) return [];
  return SETTINGS_SECTIONS.filter((section) => section.isAllowed(user));
}

export function isSettingsSectionAllowed(slug: string, user: any): boolean {
  if (!user) return false;
  const section = SETTINGS_SECTIONS.find((s) => s.slug === slug);
  return section ? section.isAllowed(user) : false;
}

export function settingsSectionCompanyModule(slug: string): CompanyModuleKey | null {
  switch (slug) {
    case 'attendance-shifts':
    case 'holidays':
    case 'leave-quotas':
    case 'mobile-alerts':
      return 'attendance';
    case 'daily-log-fields':
      return 'daily_log';
    case 'lead-sources':
    case 'booking-scheduler':
    case 'message-templates':
    case 'lead-routing':
      return 'sales';
    case 'content-calendar-fields':
      return 'content_calendar';
    case 'ad-accounts':
      return 'ads';
    default:
      return null;
  }
}

export function getSettingsSection(slug: string): SettingsSectionItem | undefined {
  return SETTINGS_SECTIONS.find((s) => s.slug === slug);
}

export function canEditContentCalendarFields(user: any): boolean {
  if (!user) return false;
  if (user.role === 'operations' || user.permissions?.view_only) return false;
  if (user.role === 'admin') return true;
  return (isContentLead(user) || isCreativeLead(user)) && !isPerformance(user);
}

export interface SettingsGroupedSections {
  group: SettingsGroupKey;
  label: string;
  sections: SettingsSectionItem[];
}

export function getGroupedVisibleSettings(user: any): SettingsGroupedSections[] {
  const visible = getVisibleSettingsSections(user);
  const groups: SettingsGroupedSections[] = [];

  const groupKeys: { key: SettingsGroupKey; label: string }[] = [
    { key: 'account', label: 'Account' },
    { key: 'organization', label: 'Organization' },
    { key: 'crm', label: 'Sales pipeline' },
    { key: 'content-calendar', label: 'Content calendar' },
    { key: 'marketing', label: 'Performance marketing' },
  ];

  groupKeys.forEach(({ key, label }) => {
    const groupSections = visible.filter((s) => s.group === key);
    if (groupSections.length > 0) {
      groups.push({
        group: key,
        label,
        sections: groupSections,
      });
    }
  });

  return groups;
}
