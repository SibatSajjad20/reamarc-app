import React from 'react';
import { Users, Briefcase, BellRing, FolderKanban, Clock, Smartphone } from 'lucide-react';

export type AdminSectionType =
  | 'directory'
  | 'compliance'
  | 'attendance_policies'
  | 'mobile_ops'
  | 'workspaces'
  | 'ad_accounts';

interface AdminSidebarNavProps {
  activeSection: AdminSectionType;
  onSelectSection: (sec: AdminSectionType) => void;
  memberCount: number;
  workspaceCount: number;
  adAccountCount: number;
  missingLogsCount: number;
  isAdmin: boolean;
  userRole?: string;
}

export const AdminSidebarNav: React.FC<AdminSidebarNavProps> = ({
  activeSection,
  onSelectSection,
  memberCount,
  workspaceCount,
  adAccountCount,
  missingLogsCount,
  isAdmin,
  userRole = 'admin',
}) => {
  const isHR = userRole === 'hr';
  const isOperations = userRole === 'operations';

  const headerTitle = isAdmin
    ? 'Admin Operations'
    : isHR
    ? 'HR Panel'
    : 'Operations Command';

  const tabs = [
    {
      id: 'directory' as AdminSectionType,
      label: 'Team Directory',
      icon: Users,
      count: memberCount > 0 ? String(memberCount) : null,
      visible: true,
    },
    {
      id: 'compliance' as AdminSectionType,
      label: 'Log Compliance',
      icon: BellRing,
      count: missingLogsCount > 0 ? String(missingLogsCount) : null,
      visible: isAdmin,
    },
    {
      id: 'attendance_policies' as AdminSectionType,
      label: 'Attendance Policies',
      icon: Clock,
      count: null,
      visible: isAdmin || isHR,
    },
    {
      id: 'mobile_ops' as AdminSectionType,
      label: 'Mobile & Alerts',
      icon: Smartphone,
      count: null,
      visible: isAdmin || isHR,
    },
    {
      id: 'workspaces' as AdminSectionType,
      label: 'Workspaces',
      icon: FolderKanban,
      count: workspaceCount > 0 ? String(workspaceCount) : null,
      visible: isAdmin || isOperations,
    },
    {
      id: 'ad_accounts' as AdminSectionType,
      label: 'Ad Accounts',
      icon: Briefcase,
      count: adAccountCount > 0 ? String(adAccountCount) : null,
      visible: isAdmin,
    },
  ].filter((tab) => tab.visible);

  return (
    <nav
      aria-label="Admin Navigation"
      className="w-[220px] shrink-0 bg-surface border-r border-border p-3 flex flex-col gap-1 hidden md:flex select-none"
    >
      <div className="px-2.5 py-1 text-caption text-fg-muted font-medium uppercase tracking-wider">
        {headerTitle}
      </div>

      <div className="flex flex-col gap-0.5 mt-1">
        {tabs.map((tab) => {
          const isSelected = activeSection === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectSection(tab.id)}
              className={`flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium transition-colors cursor-pointer text-left ${
                isSelected
                  ? 'bg-accent-soft text-accent-text font-semibold'
                  : 'text-fg-muted hover:text-fg hover:bg-hover'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
              {tab.count && (
                <span
                  className={`ml-auto text-xs font-medium tabular-nums px-1.5 py-0.5 rounded-full ${
                    isSelected
                      ? 'bg-accent-soft text-accent-text'
                      : 'bg-subtle text-fg-muted'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

