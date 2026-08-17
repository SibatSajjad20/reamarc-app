import React from 'react';
import {
  Users,
  Briefcase,
  BellRing,
  Settings2,
  Shield,
  ChevronRight,
  ChevronLeft,
  FolderKanban,
} from 'lucide-react';

export type AdminSectionType = 'directory' | 'compliance' | 'workspaces' | 'ad_accounts' | 'settings';

interface AdminSidebarNavProps {
  activeSection: AdminSectionType;
  onSelectSection: (sec: AdminSectionType) => void;
  memberCount: number;
  workspaceCount: number;
  adAccountCount: number;
  missingLogsCount: number;
  isAdmin: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const AdminSidebarNav: React.FC<AdminSidebarNavProps> = ({
  activeSection,
  onSelectSection,
  memberCount,
  workspaceCount,
  adAccountCount,
  missingLogsCount,
  isAdmin,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const sections = [
    {
      id: 'directory' as AdminSectionType,
      label: 'Team Directory',
      description: 'Manage users, roles & depts',
      icon: Users,
      badge: memberCount > 0 ? String(memberCount) : null,
      badgeColor: 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
    },
    {
      id: 'compliance' as AdminSectionType,
      label: 'Log Compliance & Reminders',
      description: 'Track missing workdays & reminders',
      icon: BellRing,
      badge: missingLogsCount > 0 ? `${missingLogsCount} pending` : null,
      badgeColor:
        missingLogsCount > 0
          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    },
    ...(isAdmin
      ? [
          {
            id: 'workspaces' as AdminSectionType,
            label: 'Workspaces',
            description: 'Client & brand workspaces',
            icon: FolderKanban,
            badge: workspaceCount > 0 ? String(workspaceCount) : null,
            badgeColor: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30',
          },
          {
            id: 'ad_accounts' as AdminSectionType,
            label: 'Ad Accounts',
            description: 'Meta, Google & ad networks',
            icon: Briefcase,
            badge: adAccountCount > 0 ? String(adAccountCount) : null,
            badgeColor: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30',
          },
          {
            id: 'settings' as AdminSectionType,
            label: 'System & Schema Settings',
            description: 'Departments & dynamic role scopes',
            icon: Settings2,
            badge: null,
            badgeColor: '',
          },
        ]
      : []),
  ];

  return (
    <div
      className={`${
        isCollapsed ? 'w-16' : 'w-full md:w-72'
      } bg-white dark:bg-[#10121a] border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col shrink-0 transition-all duration-200`}
    >
      {/* Sub-nav Top Header */}
      <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider truncate">
                Admin Operations
              </h2>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">Modular Workspace Hub</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Shield className="w-4 h-4" />
          </div>
        )}

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer hidden md:flex items-center justify-center shrink-0"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Navigation Item Buttons */}
      <div className="p-2 space-y-1.5 flex-1 overflow-y-auto">
        {sections.map((item) => {
          const isSelected = activeSection === item.id;
          const Icon = item.icon;

          if (isCollapsed) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                title={`${item.label} - ${item.description}`}
                className={`relative w-full flex items-center justify-center p-2.5 rounded-xl transition-all cursor-pointer select-none group ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/30'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.badge && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-[#10121a]" />
                )}
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left cursor-pointer select-none group ${
                isSelected
                  ? 'bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-500/30 text-indigo-900 dark:text-indigo-100 shadow-2xs'
                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60 border border-transparent text-zinc-700 dark:text-zinc-300'
              }`}
            >
              <div
                className={`p-2 rounded-lg mt-0.5 shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/30'
                    : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1.5">
                  <span
                    className={`text-xs font-bold truncate ${
                      isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-900 dark:text-zinc-100'
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.badge && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{item.description}</p>
              </div>

              <ChevronRight
                className={`w-3.5 h-3.5 mt-2 transition-transform shrink-0 ${
                  isSelected
                    ? 'text-indigo-600 dark:text-indigo-400 translate-x-0.5'
                    : 'text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
