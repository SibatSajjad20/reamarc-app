import React, { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBreadcrumb } from '@/components/layout/BreadcrumbContext';
import { PageHeader } from '@/components/ui/PageHeader';
import type { SettingsSectionSlug } from '@/types/settings';
import type { ThemePreference } from '@/types';
import {
  isSettingsSectionAllowed,
  getSettingsSection,
} from '@/utils/settingsAccess';

// Account Sections
import { AccountProfileSection } from './sections/AccountProfileSection';
import { AccountSecuritySection } from './sections/AccountSecuritySection';
import { AccountNotificationsSection } from './sections/AccountNotificationsSection';
import { AccountAppearanceSection } from './sections/AccountAppearanceSection';

// Organization Sections
import { AttendancePoliciesSection } from '@/components/admin/sections/AttendancePoliciesSection';
import { DailyLogFieldsSection } from './sections/DailyLogFieldsSection';
import { MobileOpsSection } from '@/components/admin/sections/MobileOpsSection';

// CRM Sections
import { CrmSettingsIngest } from '@/components/crm/settings/CrmSettingsIngest';
import { CrmSettingsTemplates } from '@/components/crm/settings/CrmSettingsTemplates';
import { CrmSettingsRules } from '@/components/crm/settings/CrmSettingsRules';

// Content Calendar Sections
import { ContentCalendarDisplaySection } from './sections/ContentCalendarDisplaySection';
import { ContentCalendarFieldsSection } from './sections/ContentCalendarFieldsSection';

// Performance Marketing Section
import { AdAccountsSettingsSection } from './sections/AdAccountsSettingsSection';

interface SettingsViewProps {
  currentSection: SettingsSectionSlug;
  onSelectSection: (section: SettingsSectionSlug) => void;
  themePreference?: ThemePreference;
  onSelectThemePreference?: (preference: ThemePreference) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentSection,
  onSelectSection,
  themePreference = 'system',
  onSelectThemePreference,
}) => {
  const { user } = useAuth();
  const { setTrail } = useBreadcrumb();

  // Role validation: if slug not allowed or unknown, redirect to profile
  useEffect(() => {
    if (!isSettingsSectionAllowed(currentSection, user)) {
      try {
        window.history.replaceState(null, '', '/settings/profile');
      } catch {}
      onSelectSection('profile');
    }
  }, [currentSection, user, onSelectSection]);

  const sectionMeta = getSettingsSection(currentSection) || getSettingsSection('profile')!;

  // Update breadcrumb trail: Settings › <Group> › <Section>
  useEffect(() => {
    setTrail([
      { label: 'Settings' },
      { label: sectionMeta.groupLabel },
      { label: sectionMeta.label },
    ]);
    return () => setTrail(null);
  }, [setTrail, sectionMeta]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto bg-canvas">
      <div className="max-w-[1000px] w-full mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
        <PageHeader
          title={sectionMeta.label}
          description={sectionMeta.description}
        />

        <div className="min-w-0">
          {currentSection === 'profile' && <AccountProfileSection />}
          {currentSection === 'security' && <AccountSecuritySection />}
          {currentSection === 'notifications' && <AccountNotificationsSection />}
          {currentSection === 'appearance' && (
            <AccountAppearanceSection
              themePreference={themePreference}
              onSelectThemePreference={onSelectThemePreference}
            />
          )}

          {currentSection === 'attendance-shifts' && (
            <AttendancePoliciesSection fixedTab="shifts" />
          )}
          {currentSection === 'holidays' && (
            <AttendancePoliciesSection fixedTab="calendar" />
          )}
          {currentSection === 'leave-quotas' && (
            <AttendancePoliciesSection fixedTab="leaves" />
          )}
          {currentSection === 'daily-log-fields' && <DailyLogFieldsSection />}
          {currentSection === 'mobile-alerts' && <MobileOpsSection />}

          {currentSection === 'lead-sources' && (
            <CrmSettingsIngest fixedPart="lead-sources" />
          )}
          {currentSection === 'booking-scheduler' && (
            <CrmSettingsIngest fixedPart="booking-scheduler" />
          )}
          {currentSection === 'message-templates' && <CrmSettingsTemplates />}
          {currentSection === 'lead-routing' && <CrmSettingsRules />}

          {currentSection === 'content-calendar-display' && (
            <ContentCalendarDisplaySection />
          )}
          {currentSection === 'content-calendar-fields' && (
            <ContentCalendarFieldsSection />
          )}

          {currentSection === 'ad-accounts' && <AdAccountsSettingsSection />}
        </div>
      </div>
    </div>
  );
};
