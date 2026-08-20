import React from 'react';
import { Users, Briefcase, BellRing, Shield, FolderKanban, Clock } from 'lucide-react';

export type AdminSectionType =
  | 'directory'
  | 'compliance'
  | 'attendance_policies'
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
  const isOps = userRole === 'operations';

  const headerTitle = isAdmin
    ? 'Admin Operations'
    : isHR
    ? 'HR Operations Hub'
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
      visible: true,
    },
    {
      id: 'attendance_policies' as AdminSectionType,
      label: 'Attendance Policies',
      icon: Clock,
      count: null,
      visible: true,
    },
    {
      id: 'workspaces' as AdminSectionType,
      label: 'Workspaces',
      icon: FolderKanban,
      count: workspaceCount > 0 ? String(workspaceCount) : null,
      visible: true,
    },
    {
      id: 'ad_accounts' as AdminSectionType,
      label: 'Ad Accounts',
      icon: Briefcase,
      count: adAccountCount > 0 ? String(adAccountCount) : null,
      visible: true,
    },
  ].filter((tab) => tab.visible);

  return (
    <div className="shrink-0 bg-white dark:bg-[#0f1117] border-b border-zinc-200 dark:border-zinc-800">
      <div className="px-6 pt-5 pb-3 flex items-center gap-3">
        <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
          <Shield className="w-4 h-4" />
        </div>
        <div>
          <h1 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">{headerTitle}</h1>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Modular management hub</p>
        </div>
      </div>

      <div className="px-6 flex items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isSelected = activeSection === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectSection(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                isSelected
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.count && (
                <span
                  className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
