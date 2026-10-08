import React, { useState, useEffect } from 'react';
import type { ViewType, ThemePreference } from '@/types';
import type { CrmSubSection } from '@/types/crm';
import type { AttendanceSubSection } from '@/types/attendance';
import type { AdminSectionType } from '@/components/admin/AdminSidebarNav';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard,
  Building2,
  Contact,
  TrendingUp,
  CalendarDays,
  Globe,
  Clock,
  NotebookPen,
  Inbox,
  Shield,
  CircleCheck,
  Settings,
  Sun,
  Moon,
  Monitor,
  PanelLeftClose,
  PanelLeft,
  Keyboard,
  LogOut,
  SearchX,
} from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  onSelectCrmSection?: (section: CrmSubSection) => void;
  onSelectAttendanceSection?: (section: AttendanceSubSection) => void;
  onSelectAdminSection?: (section: AdminSectionType) => void;
  onSelectWebsiteSection?: (section: 'board' | 'tasks' | 'table') => void;
  onSelectPortalTab?: (tab: 'content' | 'website') => void;
  themePreference: ThemePreference;
  onSelectThemePreference: (pref: ThemePreference) => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenShortcuts: () => void;
  onSignOut: () => void;
  canSeeActiveClients: boolean;
  canSeeCrm: boolean;
  canSeeMarketing: boolean;
  canSeeContentCalendar: boolean;
  canSeeWebsitePipeline: boolean;
  canSeeAttendance: boolean;
  canSeeDailyLog: boolean;
  canSeeExceptions: boolean;
  canSeeAdmin: boolean;
  adminLabel: string;
  isManagementRole: boolean;
  canAssignCrm: boolean;
  isClient: boolean;
  isAdmin: boolean;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  currentView,
  onSelectView,
  onSelectCrmSection,
  onSelectAttendanceSection,
  onSelectAdminSection,
  onSelectWebsiteSection,
  onSelectPortalTab,
  onSelectThemePreference,
  isSidebarCollapsed,
  onToggleSidebar,
  onOpenShortcuts,
  onSignOut,
  canSeeActiveClients,
  canSeeCrm,
  canSeeMarketing,
  canSeeContentCalendar,
  canSeeWebsitePipeline,
  canSeeAttendance,
  canSeeDailyLog,
  canSeeExceptions,
  canSeeAdmin,
  adminLabel,
  isManagementRole,
  canAssignCrm,
  isClient,
  isAdmin,
}) => {
  const [recents, setRecents] = useState<ViewType[]>([currentView]);

  useEffect(() => {
    setRecents((prev) => {
      const next = [currentView, ...prev.filter((v) => v !== currentView)];
      return next.slice(0, 5);
    });
  }, [currentView]);

  const handleSelectPage = (view: ViewType) => {
    onSelectView(view);
    onOpenChange(false);
  };

  const pagesMap: Record<ViewType, { label: string; icon: React.ComponentType<{ className?: string; size?: number }> }> = {
    dashboard: { label: 'Dashboard', icon: LayoutDashboard },
    'active-clients': { label: 'Active clients', icon: Building2 },
    crm: { label: 'Sales pipeline', icon: Contact },
    marketing: { label: 'Performance marketing', icon: TrendingUp },
    'content-calendar': { label: 'Content calendar', icon: CalendarDays },
    'website-pipeline': { label: 'Website pipeline', icon: Globe },
    attendance: { label: 'Attendance', icon: Clock },
    'daily-log': { label: 'Daily log', icon: NotebookPen },
    exceptions: { label: 'Exceptions', icon: Inbox },
    admin: { label: adminLabel, icon: Shield },
    portal: { label: 'Client portal', icon: CircleCheck },
    profile: { label: 'Profile & settings', icon: Settings },
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="relative">
        <CommandInput placeholder="Search pages and actions…" />
        <kbd className="absolute right-3.5 top-3.5 font-mono text-xs leading-[18px] border border-border rounded px-1.5 py-0.5 text-fg-muted bg-surface select-none shadow-xs pointer-events-none">
          Esc
        </kbd>
      </div>

      <CommandList className="max-h-[400px]">
        <CommandEmpty>
          <div className="flex flex-col items-center justify-center py-6 gap-2 text-fg-muted">
            <SearchX size={24} className="text-fg-faint" />
            <p className="text-[13px]">No matches found.</p>
          </div>
        </CommandEmpty>

        {/* Recent Pages */}
        {recents.length > 0 && (
          <CommandGroup heading="Recent">
            {recents.map((viewId) => {
              const meta = pagesMap[viewId];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <CommandItem
                  key={`recent-${viewId}`}
                  onSelect={() => handleSelectPage(viewId)}
                  className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                >
                  <Icon size={16} className="text-fg-muted shrink-0" />
                  <span>{meta.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* All Accessible Pages */}
        <CommandGroup heading="Pages">
          {!isAdmin && !isClient && (
            <CommandItem
              onSelect={() => handleSelectPage('dashboard')}
              className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
            >
              <LayoutDashboard size={16} className="text-fg-muted shrink-0" />
              <span>Dashboard</span>
            </CommandItem>
          )}
          {canSeeActiveClients && (
            <CommandItem
              onSelect={() => handleSelectPage('active-clients')}
              className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
            >
              <Building2 size={16} className="text-fg-muted shrink-0" />
              <span>Active clients</span>
            </CommandItem>
          )}
          {canSeeCrm && (
            <CommandItem
              onSelect={() => handleSelectPage('crm')}
              className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
            >
              <Contact size={16} className="text-fg-muted shrink-0" />
              <span>Sales pipeline</span>
            </CommandItem>
          )}
          {canSeeMarketing && (
            <CommandItem
              onSelect={() => handleSelectPage('marketing')}
              className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
            >
              <TrendingUp size={16} className="text-fg-muted shrink-0" />
              <span>Performance marketing</span>
            </CommandItem>
          )}
          {canSeeContentCalendar && (
            <CommandItem
              onSelect={() => handleSelectPage('content-calendar')}
              className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
            >
              <CalendarDays size={16} className="text-fg-muted shrink-0" />
              <span>Content calendar</span>
            </CommandItem>
          )}
          {canSeeWebsitePipeline && (
            <CommandItem
              onSelect={() => handleSelectPage('website-pipeline')}
              className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
            >
              <Globe size={16} className="text-fg-muted shrink-0" />
              <span>Website pipeline</span>
            </CommandItem>
          )}
          {canSeeAttendance && (
            <CommandItem
              onSelect={() => handleSelectPage('attendance')}
              className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
            >
              <Clock size={16} className="text-fg-muted shrink-0" />
              <span>Attendance</span>
            </CommandItem>
          )}
          {canSeeDailyLog && (
            <CommandItem
              onSelect={() => handleSelectPage('daily-log')}
              className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
            >
              <NotebookPen size={16} className="text-fg-muted shrink-0" />
              <span>Daily log</span>
            </CommandItem>
          )}
          {canSeeExceptions && (
            <CommandItem
              onSelect={() => handleSelectPage('exceptions')}
              className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
            >
              <Inbox size={16} className="text-fg-muted shrink-0" />
              <span>Exceptions</span>
            </CommandItem>
          )}
          {canSeeAdmin && (
            <CommandItem
              onSelect={() => handleSelectPage('admin')}
              className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
            >
              <Shield size={16} className="text-fg-muted shrink-0" />
              <span>{adminLabel}</span>
            </CommandItem>
          )}
          {isClient && (
            <CommandItem
              onSelect={() => handleSelectPage('portal')}
              className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
            >
              <CircleCheck size={16} className="text-fg-muted shrink-0" />
              <span>Client portal</span>
            </CommandItem>
          )}
          <CommandItem
            onSelect={() => handleSelectPage('profile')}
            className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
          >
            <Settings size={16} className="text-fg-muted shrink-0" />
            <span>Profile & settings</span>
          </CommandItem>
        </CommandGroup>

        {/* Sections */}
        {(canSeeCrm || canSeeAttendance || canSeeAdmin || canSeeWebsitePipeline || isClient) && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Sections">
              {canSeeCrm && (
                <>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('crm');
                      onSelectCrmSection?.('board');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Contact size={16} className="text-fg-muted shrink-0" />
                    <span>Sales pipeline: Leads board</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('crm');
                      onSelectCrmSection?.('deals');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Contact size={16} className="text-fg-muted shrink-0" />
                    <span>Sales pipeline: Deals</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('crm');
                      onSelectCrmSection?.('list');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Contact size={16} className="text-fg-muted shrink-0" />
                    <span>Sales pipeline: All leads</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('crm');
                      onSelectCrmSection?.('followup');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Contact size={16} className="text-fg-muted shrink-0" />
                    <span>Sales pipeline: Follow-ups</span>
                  </CommandItem>
                  {canAssignCrm && (
                    <CommandItem
                      onSelect={() => {
                        onSelectView('crm');
                        onSelectCrmSection?.('settings');
                        onOpenChange(false);
                      }}
                      className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                    >
                      <Contact size={16} className="text-fg-muted shrink-0" />
                      <span>Sales pipeline: Pipeline settings</span>
                    </CommandItem>
                  )}
                </>
              )}

              {canSeeAttendance && isManagementRole && (
                <>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('attendance');
                      onSelectAttendanceSection?.('daily-matrix');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Clock size={16} className="text-fg-muted shrink-0" />
                    <span>Attendance: Daily attendance</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('attendance');
                      onSelectAttendanceSection?.('punctuality-hub');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Clock size={16} className="text-fg-muted shrink-0" />
                    <span>Attendance: Punctuality reports</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('attendance');
                      onSelectAttendanceSection?.('employee-timesheets');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Clock size={16} className="text-fg-muted shrink-0" />
                    <span>Attendance: Timesheets</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('attendance');
                      onSelectAttendanceSection?.('approvals');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Clock size={16} className="text-fg-muted shrink-0" />
                    <span>Attendance: Approvals</span>
                  </CommandItem>
                </>
              )}

              {canSeeAttendance && !isManagementRole && (
                <>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('attendance');
                      onSelectAttendanceSection?.('timesheet');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Clock size={16} className="text-fg-muted shrink-0" />
                    <span>Attendance: My timesheet</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('attendance');
                      onSelectAttendanceSection?.('requests');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Clock size={16} className="text-fg-muted shrink-0" />
                    <span>Attendance: My requests</span>
                  </CommandItem>
                </>
              )}

              {canSeeAdmin && (
                <>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('admin');
                      onSelectAdminSection?.('directory');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Shield size={16} className="text-fg-muted shrink-0" />
                    <span>Admin: Team directory</span>
                  </CommandItem>
                  {isAdmin && (
                    <CommandItem
                      onSelect={() => {
                        onSelectView('admin');
                        onSelectAdminSection?.('compliance');
                        onOpenChange(false);
                      }}
                      className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                    >
                      <Shield size={16} className="text-fg-muted shrink-0" />
                      <span>Admin: Log compliance</span>
                    </CommandItem>
                  )}
                  <CommandItem
                    onSelect={() => {
                      onSelectView('admin');
                      onSelectAdminSection?.('attendance_policies');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Shield size={16} className="text-fg-muted shrink-0" />
                    <span>Admin: Attendance policies</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('admin');
                      onSelectAdminSection?.('mobile_ops');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Shield size={16} className="text-fg-muted shrink-0" />
                    <span>Admin: Mobile & alerts</span>
                  </CommandItem>
                </>
              )}

              {canSeeWebsitePipeline && (
                <>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('website-pipeline');
                      onSelectWebsiteSection?.('board');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Globe size={16} className="text-fg-muted shrink-0" />
                    <span>Website pipeline: Websites pipeline</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('website-pipeline');
                      onSelectWebsiteSection?.('tasks');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <Globe size={16} className="text-fg-muted shrink-0" />
                    <span>Website pipeline: Tasks pipeline</span>
                  </CommandItem>
                </>
              )}

              {isClient && (
                <>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('portal');
                      onSelectPortalTab?.('content');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <CircleCheck size={16} className="text-fg-muted shrink-0" />
                    <span>Client portal: Content calendar</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      onSelectView('portal');
                      onSelectPortalTab?.('website');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
                  >
                    <CircleCheck size={16} className="text-fg-muted shrink-0" />
                    <span>Client portal: Website portal</span>
                  </CommandItem>
                </>
              )}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        {/* Actions */}
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              onSelectThemePreference('light');
              onOpenChange(false);
            }}
            className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
          >
            <Sun size={16} className="text-fg-muted shrink-0" />
            <span>Switch to light theme</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onSelectThemePreference('dark');
              onOpenChange(false);
            }}
            className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
          >
            <Moon size={16} className="text-fg-muted shrink-0" />
            <span>Switch to dark theme</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onSelectThemePreference('system');
              onOpenChange(false);
            }}
            className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
          >
            <Monitor size={16} className="text-fg-muted shrink-0" />
            <span>Switch to system theme</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onToggleSidebar();
              onOpenChange(false);
            }}
            className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
          >
            {isSidebarCollapsed ? (
              <PanelLeft size={16} className="text-fg-muted shrink-0" />
            ) : (
              <PanelLeftClose size={16} className="text-fg-muted shrink-0" />
            )}
            <span>{isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              onOpenShortcuts();
            }}
            className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
          >
            <Keyboard size={16} className="text-fg-muted shrink-0" />
            <span>Keyboard shortcuts</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              onSignOut();
            }}
            className="flex items-center gap-2.5 h-9 px-3 text-[13px] rounded-md cursor-pointer"
          >
            <LogOut size={16} className="text-fg-muted shrink-0" />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
