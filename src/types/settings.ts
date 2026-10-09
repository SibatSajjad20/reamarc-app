export type SettingsSectionSlug =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'appearance'
  | 'attendance-shifts'
  | 'holidays'
  | 'leave-quotas'
  | 'daily-log-fields'
  | 'mobile-alerts'
  | 'lead-sources'
  | 'booking-scheduler'
  | 'message-templates'
  | 'lead-routing'
  | 'content-calendar-display'
  | 'content-calendar-fields'
  | 'ad-accounts';

export type SettingsGroupKey =
  | 'account'
  | 'organization'
  | 'crm'
  | 'content-calendar'
  | 'marketing';

export interface SettingsSectionMetadata {
  slug: SettingsSectionSlug;
  group: SettingsGroupKey;
  groupLabel: string;
  label: string;
  description: string;
}
