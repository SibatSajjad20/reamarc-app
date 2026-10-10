import React, { useState, useEffect, useCallback } from 'react';
import type { ViewType, ThemeMode, ThemePreference } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { dailyLogService } from '@/services/dailyLogService';
import { useCacheInvalidation } from '@/utils/cacheBus';
import { getRoleDisplayName } from '@/lib/roleLabel';
import { canAccessCrm } from '@/utils/crmAccess';
import { canAccessContentCalendar } from '@/utils/contentCalendarAccess';
import { canAccessWebsitePipeline } from '@/utils/websiteProjectAccess';
import type { CrmSubSection } from '@/types/crm';
import type { AttendanceSubSection } from '@/types/attendance';
import type { AdminSectionType } from '@/types/admin';
import { BrandMark } from '@/components/ui/BrandMark';
import { Avatar } from '@/components/ui/Avatar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
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
  ChevronRight,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  LogOut,
  Check,
  ArrowLeft,
  User,
  ShieldCheck,
  Bell,
  Palette,
  CalendarCheck,
  SlidersHorizontal,
  Smartphone,
  Flame,
  Calendar,
  MessageSquare,
  GitFork,
  Eye,
  Tags,
  Megaphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SettingsSectionSlug } from '@/types/settings';
import { getGroupedVisibleSettings } from '@/utils/settingsAccess';

const SETTINGS_ICONS: Record<SettingsSectionSlug, React.ComponentType<{ className?: string; size?: number }>> = {
  profile: User,
  security: ShieldCheck,
  notifications: Bell,
  appearance: Palette,
  'attendance-shifts': Clock,
  holidays: CalendarDays,
  'leave-quotas': CalendarCheck,
  'daily-log-fields': SlidersHorizontal,
  'mobile-alerts': Smartphone,
  'lead-sources': Flame,
  'booking-scheduler': Calendar,
  'message-templates': MessageSquare,
  'lead-routing': GitFork,
  'content-calendar-display': Eye,
  'content-calendar-fields': Tags,
  'ad-accounts': Megaphone,
};

export interface SidebarProps {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  onSignOut: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  themePreference?: ThemePreference;
  onSelectThemePreference?: (preference: ThemePreference) => void;
  activeCrmSection?: CrmSubSection;
  onSelectCrmSection?: (section: CrmSubSection) => void;
  activeAttendanceSection?: AttendanceSubSection;
  onSelectAttendanceSection?: (section: AttendanceSubSection) => void;
  activeAdminSection?: AdminSectionType;
  onSelectAdminSection?: (section: AdminSectionType) => void;
  activeWebsiteSection?: 'board' | 'tasks' | 'table';
  onSelectWebsiteSection?: (section: 'board' | 'tasks' | 'table') => void;
  activePortalTab?: 'content' | 'website';
  onSelectPortalTab?: (tab: 'content' | 'website') => void;
  activeSettingsSection?: SettingsSectionSlug;
  onSelectSettingsSection?: (section: SettingsSectionSlug) => void;
  lastNonSettingsView?: ViewType;
  onOpenShortcuts?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobile?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  onSignOut,
  theme,
  themePreference = 'system',
  onSelectThemePreference,
  activeCrmSection = 'board',
  onSelectCrmSection,
  activeAttendanceSection,
  onSelectAttendanceSection,
  activeAdminSection = 'directory',
  onSelectAdminSection,
  activeWebsiteSection = 'board',
  onSelectWebsiteSection,
  activePortalTab = 'content',
  onSelectPortalTab,
  activeSettingsSection = 'profile',
  onSelectSettingsSection,
  lastNonSettingsView,
  onOpenShortcuts,
  isCollapsed: controlledIsCollapsed,
  onToggleCollapse,
  isMobile = false,
}) => {
  const { user } = useAuth();
  const [internalIsCollapsed, setInternalIsCollapsed] = useState<boolean>(() => {
    try {
      const userKey = user?.id ? `sidebar_collapsed_${user.id}` : 'sidebar_collapsed';
      const saved = localStorage.getItem(userKey) ?? localStorage.getItem('sidebar_collapsed');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  const isCollapsed = isMobile
    ? false
    : controlledIsCollapsed !== undefined
    ? controlledIsCollapsed
    : internalIsCollapsed;

  const toggleSidebar = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalIsCollapsed((prev) => {
        const next = !prev;
        try {
          if (user?.id) {
            localStorage.setItem(`sidebar_collapsed_${user.id}`, String(next));
          }
          localStorage.setItem('sidebar_collapsed', String(next));
        } catch {}
        return next;
      });
    }
  };

  const isMac =
    typeof window !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(window.navigator.userAgent);
  const shortcutHint = isMac ? '⌘\\' : 'Ctrl+\\';

  // Expand states: open only for the group whose view is active initially (§8.4)
  const [isCrmExpanded, setIsCrmExpanded] = useState(() => currentView === 'crm');
  const [isAttendanceExpanded, setIsAttendanceExpanded] = useState(() => currentView === 'attendance');
  const [isAdminExpanded, setIsAdminExpanded] = useState(() => currentView === 'admin');
  const [isWebsiteExpanded, setIsWebsiteExpanded] = useState(() => currentView === 'website-pipeline');
  const [isPortalExpanded, setIsPortalExpanded] = useState(() => currentView === 'portal');
  const [requestCount, setRequestCount] = useState(0);

  // When currentView changes to a parent view, expand that group; leave other groups as the user left them (§8.4)
  useEffect(() => {
    if (currentView === 'crm') setIsCrmExpanded(true);
    if (currentView === 'attendance') setIsAttendanceExpanded(true);
    if (currentView === 'admin') setIsAdminExpanded(true);
    if (currentView === 'website-pipeline') setIsWebsiteExpanded(true);
    if (currentView === 'portal') setIsPortalExpanded(true);
  }, [currentView]);

  const fetchBadge = useCallback(() => {
    const role = user?.role;
    if (!role || !['team_member', 'team_lead', 'hr'].includes(role)) {
      setRequestCount(0);
      return;
    }
    dailyLogService
      .getDayTarget()
      .then((t) => {
        setRequestCount((t.follow_ups || []).length);
      })
      .catch(() => {
        setRequestCount(0);
      });
  }, [user?.role]);

  useEffect(() => {
    fetchBadge();
  }, [fetchBadge, currentView, user?.id]);

  useCacheInvalidation(['daily-log', 'exceptions'], () => {
    fetchBadge();
  });

  const displayName = user?.full_name || user?.name || 'Guest Contributor';
  const displayEmail = user?.email || '';
  const displayRole = getRoleDisplayName(user?.role);

  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isOperations = user?.role === 'operations';
  const isClient = user?.role === 'client';
  const isLead = user?.role === 'team_lead';
  const canSeeExceptions = isLead || isHR;
  const canSeeActiveClients = isLead || isHR || isAdmin || isOperations;
  const canSeeCrm = canAccessCrm(user);
  const canSeeContentCalendar = canAccessContentCalendar(user);
  const canSeeWebsitePipeline = canAccessWebsitePipeline(user);
  const isManagementRole = isAdmin || isHR || isOperations;

  const deptLower = (user?.department || '').toLowerCase().trim();
  const isMarketingOrSEO = deptLower === 'seo' || deptLower === 'performance marketing';
  const canSeeMarketing =
    isAdmin ||
    ((user?.role === 'team_lead' || user?.role === 'team_member') && isMarketingOrSEO);

  const canSeeAdmin = isAdmin || isHR || isOperations;
  const adminLabel = isAdmin ? 'Admin panel' : isHR ? 'HR panel' : 'Operations panel';

  // Sub-items definitions (no icons per mocks)
  const crmSubItems = [
    { id: 'board' as CrmSubSection, label: 'Leads board' },
    { id: 'deals' as CrmSubSection, label: 'Deals' },
    { id: 'list' as CrmSubSection, label: 'All leads' },
    { id: 'followup' as CrmSubSection, label: 'Follow-ups' },
  ];

  const attendanceSubItems = isManagementRole
    ? [
        { id: 'daily-matrix' as AttendanceSubSection, label: 'Daily attendance' },
        { id: 'punctuality-hub' as AttendanceSubSection, label: 'Punctuality reports' },
        { id: 'employee-timesheets' as AttendanceSubSection, label: 'Timesheets' },
        { id: 'approvals' as AttendanceSubSection, label: 'Approvals' },
      ]
    : [
        { id: 'timesheet' as AttendanceSubSection, label: 'My timesheet' },
        { id: 'requests' as AttendanceSubSection, label: 'My requests' },
      ];

  const adminSubItems = [
    { id: 'directory' as AdminSectionType, label: 'Team directory', visible: true },
    { id: 'compliance' as AdminSectionType, label: 'Log compliance', visible: isAdmin },
    { id: 'workspaces' as AdminSectionType, label: 'Client workspaces', visible: isAdmin || isOperations },
  ].filter((item) => item.visible);

  const websitePipelineSubItems = [
    { id: 'board' as const, label: 'Website pipeline' },
    { id: 'tasks' as const, label: 'Tasks pipeline' },
    { id: 'table' as const, label: 'Table view' },
  ];

  const portalSubItems = [
    { id: 'content' as const, label: 'Content calendar' },
    { id: 'website' as const, label: 'Website portal' },
  ];

  // Grouped navigation per §8.2
  interface NavGroup {
    id: string;
    label: string;
    items: {
      id: ViewType;
      label: string;
      icon: React.ComponentType<{ className?: string; size?: number }>;
      badge?: number;
      badgeAttention?: boolean;
      hasSubItems?: boolean;
      isExpanded?: boolean;
      onToggleExpand?: () => void;
      subItems?: { id: string; label: string; isActive: boolean; onSelect: () => void }[];
    }[];
  }

  const groups: NavGroup[] = [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        ...(!isClient
          ? [
              {
                id: 'dashboard' as ViewType,
                label: 'Dashboard',
                icon: LayoutDashboard,
              },
            ]
          : []),
      ],
    },
    {
      id: 'portal-group',
      label: 'Client portal',
      items: [
        ...(isClient
          ? [
              {
                id: 'portal' as ViewType,
                label: 'Approvals',
                icon: CircleCheck,
                hasSubItems: true,
                isExpanded: isPortalExpanded,
                onToggleExpand: () => setIsPortalExpanded(!isPortalExpanded),
                subItems: portalSubItems.map((sub) => ({
                  id: sub.id,
                  label: sub.label,
                  isActive:
                    currentView === 'portal' &&
                    (activePortalTab === sub.id || (!activePortalTab && sub.id === 'content')),
                  onSelect: () => {
                    if (currentView !== 'portal') onSelectView('portal');
                    onSelectPortalTab?.(sub.id);
                  },
                })),
              },
            ]
          : []),
      ],
    },
    {
      id: 'clients',
      label: 'Clients',
      items: [
        ...(canSeeActiveClients
          ? [
              {
                id: 'active-clients' as ViewType,
                label: 'Active clients',
                icon: Building2,
              },
            ]
          : []),
        ...(canSeeCrm
          ? [
              {
                id: 'crm' as ViewType,
                label: 'Sales pipeline',
                icon: Contact,
                hasSubItems: true,
                isExpanded: isCrmExpanded,
                onToggleExpand: () => setIsCrmExpanded(!isCrmExpanded),
                subItems: crmSubItems.map((sub) => ({
                  id: sub.id,
                  label: sub.label,
                  isActive:
                    currentView === 'crm' &&
                    (activeCrmSection === sub.id || (!activeCrmSection && sub.id === 'board')),
                  onSelect: () => {
                    if (currentView !== 'crm') onSelectView('crm');
                    onSelectCrmSection?.(sub.id);
                  },
                })),
              },
            ]
          : []),
        ...(canSeeMarketing
          ? [
              {
                id: 'marketing' as ViewType,
                label: 'Performance marketing',
                icon: TrendingUp,
              },
            ]
          : []),
        ...(canSeeContentCalendar
          ? [
              {
                id: 'content-calendar' as ViewType,
                label: 'Content calendar',
                icon: CalendarDays,
              },
            ]
          : []),
        ...(canSeeWebsitePipeline
          ? [
              {
                id: 'website-pipeline' as ViewType,
                label: 'Website pipeline',
                icon: Globe,
                hasSubItems: true,
                isExpanded: isWebsiteExpanded,
                onToggleExpand: () => setIsWebsiteExpanded(!isWebsiteExpanded),
                subItems: websitePipelineSubItems.map((sub) => ({
                  id: sub.id,
                  label: sub.label,
                  isActive:
                    currentView === 'website-pipeline' &&
                    (activeWebsiteSection === sub.id || (!activeWebsiteSection && sub.id === 'board')),
                  onSelect: () => {
                    if (currentView !== 'website-pipeline') onSelectView('website-pipeline');
                    onSelectWebsiteSection?.(sub.id);
                  },
                })),
              },
            ]
          : []),
      ],
    },
    {
      id: 'team',
      label: 'Team',
      items: [
        ...(!isClient
          ? [
              {
                id: 'attendance' as ViewType,
                label: 'Attendance',
                icon: Clock,
                hasSubItems: true,
                isExpanded: isAttendanceExpanded,
                onToggleExpand: () => setIsAttendanceExpanded(!isAttendanceExpanded),
                subItems: attendanceSubItems.map((sub) => {
                  const defaultActiveId = isManagementRole ? 'daily-matrix' : 'timesheet';
                  return {
                    id: sub.id,
                    label: sub.label,
                    isActive:
                      currentView === 'attendance' &&
                      (activeAttendanceSection === sub.id || (!activeAttendanceSection && sub.id === defaultActiveId)),
                    onSelect: () => {
                      if (currentView !== 'attendance') onSelectView('attendance');
                      onSelectAttendanceSection?.(sub.id);
                    },
                  };
                }),
              },
              {
                id: 'daily-log' as ViewType,
                label: 'Daily log',
                icon: NotebookPen,
                badge: requestCount > 0 ? requestCount : undefined,
                badgeAttention: true,
              },
            ]
          : []),
        ...(canSeeExceptions
          ? [
              {
                id: 'exceptions' as ViewType,
                label: 'Exceptions',
                icon: Inbox,
              },
            ]
          : []),
      ],
    },
    {
      id: 'admin',
      label: 'Admin',
      items: [
        ...(canSeeAdmin
          ? [
              {
                id: 'admin' as ViewType,
                label: adminLabel,
                icon: Shield,
                hasSubItems: adminSubItems.length > 1,
                isExpanded: isAdminExpanded,
                onToggleExpand: () => setIsAdminExpanded(!isAdminExpanded),
                subItems:
                  adminSubItems.length > 1
                    ? adminSubItems.map((sub) => ({
                        id: sub.id,
                        label: sub.label,
                        isActive:
                          currentView === 'admin' &&
                          (activeAdminSection === sub.id || (!activeAdminSection && sub.id === 'directory')),
                        onSelect: () => {
                          if (currentView !== 'admin') onSelectView('admin');
                          onSelectAdminSection?.(sub.id);
                        },
                      }))
                    : undefined,
              },
            ]
          : []),
      ],
    },
  ].filter((group) => group.items.length > 0);

  const isSettingsMode = currentView === 'settings';
  const settingsGroups = getGroupedVisibleSettings(user);
  const defaultBackView: ViewType = isClient ? 'portal' : isAdmin ? 'admin' : 'dashboard';
  const handleBackToApp = () => {
    onSelectView(lastNonSettingsView || defaultBackView);
  };

  return (
    <aside
      id="app-sidebar"
      aria-label="Application sidebar"
      data-collapsed={isCollapsed}
      className={cn(
        'group/sidebar relative flex flex-col h-full bg-surface border-r border-border p-3 select-none shrink-0 z-20 motion-reduce:transition-none motion-reduce:delay-0',
        isCollapsed
          ? 'w-[64px] transition-[width] duration-200 delay-100 ease-[var(--ease-standard,cubic-bezier(0.2,0,0,1))]'
          : 'w-[248px] transition-[width] duration-200 delay-0 ease-[var(--ease-standard,cubic-bezier(0.2,0,0,1))]'
      )}
    >
      {/* 1. Brand Block (§8.1, §8.5) */}
      <div className="relative h-11 mb-4 shrink-0">
        {/* Expanded state logo row */}
        <div
          className={cn(
            'absolute inset-0 h-11 px-2 py-1.5 border border-border rounded-[10px] flex items-center gap-2 bg-surface transition-opacity motion-reduce:transition-none',
            isCollapsed
              ? 'opacity-0 pointer-events-none duration-100 delay-0 ease-out'
              : 'opacity-100 duration-100 delay-200 ease-out'
          )}
        >
          <BrandMark size={28} className="shrink-0" />
          <div className="min-w-0 flex-1 truncate pr-1 select-none">
            <span className="block text-[13px] font-semibold text-fg leading-4 truncate">
              Reamarc
            </span>
            <span className="block text-xs text-fg-muted leading-4 truncate">
              Operations hub
            </span>
          </div>
          {!isMobile && (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label="Collapse sidebar"
                  aria-expanded="true"
                  aria-controls="app-sidebar"
                  tabIndex={isCollapsed ? -1 : 0}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-fg-muted hover:text-fg hover:bg-subtle transition-opacity duration-[120ms] ease-[var(--ease-standard)] cursor-pointer focus-visible:focus-ring opacity-0 group-hover/sidebar:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 shrink-0"
                >
                  <PanelLeftClose size={16} strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <span>Collapse sidebar</span>
                <kbd className="ml-1.5 font-mono text-[10px] text-fg-muted bg-surface/80 border border-border px-1 py-0.5 rounded">
                  {shortcutHint}
                </kbd>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Collapsed state R logo expand button */}
        <div
          className={cn(
            'absolute inset-0 h-11 flex items-center justify-center transition-opacity motion-reduce:transition-none',
            isCollapsed
              ? 'opacity-100 duration-100 delay-200 ease-out'
              : 'opacity-0 pointer-events-none duration-100 delay-0 ease-out'
          )}
        >
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Expand sidebar"
                aria-expanded="false"
                aria-controls="app-sidebar"
                tabIndex={isCollapsed ? 0 : -1}
                className="sidebar-expand-btn relative w-7 h-7 rounded-mark bg-accent text-accent-fg font-semibold flex items-center justify-center shrink-0 cursor-pointer select-none focus-visible:focus-ring hover:bg-accent-hover transition-colors"
                style={{ fontSize: '14px' }}
              >
                <span className="sidebar-expand-r absolute inset-0 flex items-center justify-center transition-opacity duration-[120ms] ease-[var(--ease-standard)] opacity-100 motion-reduce:transition-none pointer-events-none">
                  R
                </span>
                <span className="sidebar-expand-icon absolute inset-0 flex items-center justify-center transition-opacity duration-[120ms] ease-[var(--ease-standard)] opacity-0 motion-reduce:transition-none pointer-events-none">
                  <PanelLeftOpen size={16} strokeWidth={1.5} />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <span>Expand sidebar</span>
              <kbd className="ml-1.5 font-mono text-[10px] text-fg-muted bg-surface/80 border border-border px-1 py-0.5 rounded">
                {shortcutHint}
              </kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* 2. Navigation Area: App Navigation & Settings Navigation Swap */}
      <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* Main App Nav */}
        <nav
          aria-label="Main"
          className={cn(
            'overflow-y-auto overflow-x-hidden space-y-3.5 transition-all duration-180 ease-[var(--ease-standard,cubic-bezier(0.2,0,0,1))] motion-reduce:transition-none motion-reduce:transform-none',
            isCollapsed ? 'pr-0' : 'pr-0.5',
            isSettingsMode
              ? 'opacity-0 -translate-x-2 pointer-events-none absolute inset-0'
              : 'opacity-100 translate-x-0 relative flex-1'
          )}
        >
          {groups.map((group, groupIndex) => (
            <div key={group.id} role="group" aria-labelledby={`nav-group-${group.id}`}>
            {/* Group Label / Divider */}
            <div className="relative">
              <div
                id={`nav-group-${group.id}`}
                className={cn(
                  'text-xs font-medium text-fg-muted px-2.5 pb-1 leading-4 select-none whitespace-nowrap overflow-hidden transition-all ease-out motion-reduce:transition-none',
                  isCollapsed
                    ? 'opacity-0 max-h-0 pb-0 duration-100 delay-0 pointer-events-none'
                    : 'opacity-100 max-h-6 duration-100 delay-200'
                )}
              >
                {group.label}
              </div>
              {groupIndex > 0 && (
                <div
                  className={cn(
                    'border-t border-border transition-all ease-out motion-reduce:transition-none',
                    isCollapsed
                      ? 'my-2 opacity-100 duration-100 delay-200'
                      : 'my-0 opacity-0 max-h-0 pointer-events-none duration-100 delay-0'
                  )}
                />
              )}
            </div>

            {/* Group Items */}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isItemActive = currentView === item.id;
                const isParentOfActive = isItemActive && item.hasSubItems;

                // Collapsed item with Tooltip / DropdownMenu
                if (isCollapsed) {
                  const buttonElement = (
                    <button
                      type="button"
                      onClick={() => onSelectView(item.id)}
                      className={cn(
                        'w-10 h-[34px] mx-auto rounded-md flex items-center justify-center transition-colors cursor-pointer relative focus-visible:focus-ring',
                        isItemActive
                          ? 'bg-accent-soft text-accent-text'
                          : 'text-fg-2 hover:bg-hover hover:text-fg'
                      )}
                      aria-current={isItemActive ? 'page' : undefined}
                      aria-label={item.label}
                    >
                      <Icon
                        size={18}
                        className={cn('shrink-0', isItemActive ? 'text-accent-text' : 'text-fg-muted')}
                      />
                      {item.badge && item.badge > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent" />
                      )}
                    </button>
                  );

                  // If item has sub-items in collapsed mode, hover/click opens right dropdown (§8.5)
                  if (item.hasSubItems && item.subItems) {
                    return (
                      <DropdownMenu key={item.id}>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              {buttonElement}
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <span>{item.label}</span>
                          </TooltipContent>
                        </Tooltip>

                        <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-48">
                          <div className="px-2 py-1.5 text-xs font-semibold text-fg-muted">
                            {item.label}
                          </div>
                          <DropdownMenuSeparator />
                          {item.subItems.map((sub) => (
                            <DropdownMenuItem
                              key={sub.id}
                              onClick={sub.onSelect}
                              className={cn(
                                'text-[13px] h-8 cursor-pointer',
                                sub.isActive && 'bg-accent-soft text-accent-text font-medium'
                              )}
                            >
                              {sub.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  }

                  return (
                    <Tooltip key={item.id} delayDuration={300}>
                      <TooltipTrigger asChild>{buttonElement}</TooltipTrigger>
                      <TooltipContent side="right">
                        <span>{item.label}</span>
                        {item.badge && item.badge > 0 && <span> ({item.badge})</span>}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                // Expanded Mode
                return (
                  <div key={item.id} className="space-y-0.5">
                    <div
                      className={cn(
                        'h-[34px] px-2.5 rounded-md flex items-center gap-2.5 transition-colors cursor-pointer select-none group',
                        isItemActive && !item.hasSubItems
                          ? 'bg-accent-soft text-accent-text font-medium'
                          : isParentOfActive
                          ? 'text-fg font-medium hover:bg-hover'
                          : 'text-fg-2 hover:bg-hover hover:text-fg'
                      )}
                      onClick={() => {
                        onSelectView(item.id);
                        if (item.hasSubItems && currentView === item.id) {
                          item.onToggleExpand?.();
                        }
                      }}
                    >
                      <Icon
                        size={18}
                        className={cn(
                          'shrink-0',
                          isItemActive ? 'text-accent-text' : 'text-fg-muted group-hover:text-fg'
                        )}
                      />
                      <span className="text-[13px] font-medium truncate flex-1 leading-5 whitespace-nowrap overflow-hidden transition-opacity duration-100 delay-200 ease-out motion-reduce:transition-none">
                        {item.label}
                      </span>

                      {/* Attention or standard badge */}
                      {item.badge !== undefined && item.badge > 0 && (
                        <span
                          className={cn(
                            'ml-auto text-micro leading-4 px-1.5 rounded-full font-numeric font-medium whitespace-nowrap overflow-hidden transition-opacity duration-100 delay-200 ease-out motion-reduce:transition-none',
                            item.badgeAttention
                              ? 'bg-accent-soft-2 text-accent-text'
                              : 'bg-subtle text-fg-2'
                          )}
                        >
                          {item.badge}
                        </span>
                      )}

                      {/* Sub-item Chevron toggle */}
                      {item.hasSubItems && (
                        <button
                          type="button"
                          aria-label={`Toggle ${item.label} sub-items`}
                          onClick={(e) => {
                            e.stopPropagation();
                            item.onToggleExpand?.();
                          }}
                          className="p-0.5 rounded hover:bg-subtle text-fg-faint hover:text-fg transition-colors shrink-0"
                        >
                          <ChevronRight
                            size={14}
                            className={cn(
                              'transition-transform duration-160',
                              item.isExpanded && 'rotate-90'
                            )}
                          />
                        </button>
                      )}
                    </div>

                    {/* Sub-item List (§8.3) */}
                    {item.hasSubItems && item.isExpanded && item.subItems && (
                      <div className="my-0.5 ml-[21px] pl-3 border-l border-border space-y-0.5 whitespace-nowrap overflow-hidden transition-opacity duration-100 delay-200 ease-out motion-reduce:transition-none">
                        {item.subItems.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={sub.onSelect}
                            className={cn(
                              'w-full h-[30px] px-2.5 rounded-md flex items-center text-[13px] transition-colors cursor-pointer select-none truncate text-left',
                              sub.isActive
                                ? 'bg-accent-soft text-accent-text font-medium'
                                : 'text-fg-2 hover:bg-hover hover:text-fg font-normal'
                            )}
                          >
                            <span className="truncate">{sub.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Settings Nav */}
      <nav
        aria-label="Settings"
        className={cn(
          'overflow-y-auto overflow-x-hidden space-y-2 transition-all duration-180 ease-[var(--ease-standard,cubic-bezier(0.2,0,0,1))] motion-reduce:transition-none motion-reduce:transform-none',
          isCollapsed ? 'pr-0' : 'pr-0.5',
          isSettingsMode
            ? 'opacity-100 translate-x-0 relative flex-1'
            : 'opacity-0 translate-x-2 pointer-events-none absolute inset-0'
        )}
      >

          {/* Back to app button */}
          <div className="pt-0.5 pb-1">
            {!isCollapsed ? (
              <button
                type="button"
                onClick={handleBackToApp}
                className="w-full h-8 px-2 rounded-md flex items-center gap-2 text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer text-xs font-medium"
              >
                <ArrowLeft size={14} className="shrink-0" />
                <span className="truncate whitespace-nowrap overflow-hidden transition-opacity duration-100 delay-200 ease-out motion-reduce:transition-none">
                  Back to app
                </span>
              </button>
            ) : (
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleBackToApp}
                    className="w-10 h-8 mx-auto rounded-md flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer"
                    aria-label="Back to app"
                  >
                    <ArrowLeft size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Back to app</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Settings Heading */}
          {!isCollapsed && (
            <div className="px-2.5 pt-1 pb-1">
              <h2 className="text-sm font-semibold text-fg tracking-tight whitespace-nowrap overflow-hidden transition-opacity duration-100 delay-200 ease-out motion-reduce:transition-none">
                Settings
              </h2>
            </div>
          )}

          {/* Settings Groups & Sections */}
          {settingsGroups.map((group, groupIdx) => (
            <div key={group.group} className="space-y-0.5">
              {!isCollapsed ? (
                <div className="text-[11px] font-medium text-fg-muted px-2.5 pt-2 pb-0.5 select-none leading-4 whitespace-nowrap overflow-hidden transition-opacity duration-100 delay-200 ease-out motion-reduce:transition-none">
                  {group.label}
                </div>
              ) : (
                groupIdx > 0 && <div className="my-2 border-t border-border" />
              )}

              <div className="space-y-0.5">
                {group.sections.map((sec) => {
                  const Icon = SETTINGS_ICONS[sec.slug] || Settings;
                  const isSecActive = activeSettingsSection === sec.slug;

                  if (isCollapsed) {
                    return (
                      <Tooltip key={sec.slug} delayDuration={300}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => onSelectSettingsSection?.(sec.slug)}
                            className={cn(
                              'w-10 h-[34px] mx-auto rounded-md flex items-center justify-center transition-colors cursor-pointer relative focus-visible:focus-ring',
                              isSecActive
                                ? 'bg-accent-soft text-accent-text'
                                : 'text-fg-2 hover:bg-hover hover:text-fg'
                            )}
                            aria-current={isSecActive ? 'page' : undefined}
                            aria-label={sec.label}
                          >
                            <Icon
                              size={16}
                              className={isSecActive ? 'text-accent-text' : 'text-fg-muted'}
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">{sec.label}</TooltipContent>
                      </Tooltip>
                    );
                  }

                  return (
                    <button
                      key={sec.slug}
                      type="button"
                      onClick={() => onSelectSettingsSection?.(sec.slug)}
                      className={cn(
                        'w-full h-[34px] px-2.5 rounded-md flex items-center gap-2.5 transition-colors cursor-pointer select-none text-[13px] font-medium leading-5',
                        isSecActive
                          ? 'bg-accent-soft text-accent-text font-medium'
                          : 'text-fg-2 hover:bg-hover hover:text-fg font-normal'
                      )}
                      aria-current={isSecActive ? 'page' : undefined}
                    >
                      <Icon
                        size={16}
                        className={cn('shrink-0', isSecActive ? 'text-accent-text' : 'text-fg-muted')}
                      />
                      <span className="truncate whitespace-nowrap overflow-hidden transition-opacity duration-100 delay-200 ease-out motion-reduce:transition-none">
                        {sec.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* 3. Bottom Area (§8.1, §8.7) - ONLY Settings and User Block */}
      <div className="mt-auto pt-2 space-y-1 shrink-0">
        {/* Settings nav item */}
        {!isCollapsed ? (
          <button
            type="button"
            onClick={() => {
              onSelectView('settings');
              if (onSelectSettingsSection) onSelectSettingsSection('profile');
            }}
            className={cn(
              'w-full h-[34px] px-2.5 rounded-md flex items-center gap-2.5 transition-colors cursor-pointer select-none group focus-visible:focus-ring',
              currentView === 'settings'
                ? 'bg-accent-soft text-accent-text font-medium'
                : 'text-fg-2 hover:bg-hover hover:text-fg'
            )}
          >
            <Settings
              size={18}
              className={cn(
                'shrink-0',
                currentView === 'settings' ? 'text-accent-text' : 'text-fg-muted group-hover:text-fg'
              )}
            />
            <span className="text-[13px] font-medium truncate leading-5 text-left whitespace-nowrap overflow-hidden transition-opacity duration-100 delay-200 ease-out motion-reduce:transition-none">
              Settings
            </span>
          </button>
        ) : (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  onSelectView('settings');
                  if (onSelectSettingsSection) onSelectSettingsSection('profile');
                }}
                className={cn(
                  'w-10 h-[34px] mx-auto rounded-md flex items-center justify-center transition-colors cursor-pointer focus-visible:focus-ring',
                  currentView === 'settings'
                    ? 'bg-accent-soft text-accent-text'
                    : 'text-fg-2 hover:bg-hover hover:text-fg'
                )}
                aria-label="Settings"
              >
                <Settings
                  size={18}
                  className={currentView === 'settings' ? 'text-accent-text' : 'text-fg-muted'}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <span>Settings</span>
            </TooltipContent>
          </Tooltip>
        )}

        {/* User Block + DropdownMenu (§8.3, §8.7) */}
        <div className="border-t border-border mt-2 pt-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {!isCollapsed ? (
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 p-1 rounded-md hover:bg-hover transition-colors cursor-pointer select-none text-left focus-visible:focus-ring"
                >
                  <Avatar
                    name={displayName}
                    src={user?.avatar_url}
                    size={32}
                    className="rounded-full shrink-0"
                  />
                  <div className="min-w-0 flex-1 whitespace-nowrap overflow-hidden transition-opacity duration-100 delay-200 ease-out motion-reduce:transition-none">
                    <span className="block text-[13px] font-medium text-fg leading-4 truncate">
                      {displayName}
                    </span>
                    <span className="block text-xs text-fg-muted leading-4 truncate">
                      {displayRole}
                    </span>
                  </div>
                  <ChevronsUpDown size={16} className="text-fg-muted shrink-0" />
                </button>
              ) : (
                <button
                  type="button"
                  className="w-10 h-10 mx-auto rounded-full flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer select-none focus-visible:focus-ring"
                  aria-label="User menu"
                >
                  <Avatar
                    name={displayName}
                    src={user?.avatar_url}
                    size={32}
                    className="rounded-full shrink-0"
                  />
                </button>
              )}
            </DropdownMenuTrigger>

            <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-60">
              {/* 1. Header non-interactive */}
              <div className="px-2.5 py-2 select-none">
                <p className="text-[13px] font-medium text-fg truncate leading-tight">{displayName}</p>
                {displayEmail && (
                  <p className="text-xs text-fg-muted truncate mt-0.5">{displayEmail}</p>
                )}
              </div>

              <DropdownMenuSeparator />

              {/* 2. Settings */}
              <DropdownMenuItem
                onClick={() => {
                  onSelectView('settings');
                  if (onSelectSettingsSection) onSelectSettingsSection('profile');
                }}
                className="text-[13px] gap-2.5 cursor-pointer"
              >
                <Settings size={16} className="text-fg-muted" />
                <span>Settings</span>
              </DropdownMenuItem>

              {/* 3. Theme sub-menu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-[13px] gap-2.5 cursor-pointer">
                  {theme === 'dark' ? (
                    <Moon size={16} className="text-fg-muted" />
                  ) : (
                    <Sun size={16} className="text-fg-muted" />
                  )}
                  <span>Theme</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-36">
                  <DropdownMenuItem
                    onClick={() => onSelectThemePreference?.('light')}
                    className="text-[13px] gap-2 cursor-pointer flex justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Sun size={14} className="text-fg-muted" />
                      <span>Light</span>
                    </div>
                    {themePreference === 'light' && <Check size={14} className="text-accent" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onSelectThemePreference?.('dark')}
                    className="text-[13px] gap-2 cursor-pointer flex justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Moon size={14} className="text-fg-muted" />
                      <span>Dark</span>
                    </div>
                    {themePreference === 'dark' && <Check size={14} className="text-accent" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onSelectThemePreference?.('system')}
                    className="text-[13px] gap-2 cursor-pointer flex justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Monitor size={14} className="text-fg-muted" />
                      <span>System</span>
                    </div>
                    {themePreference === 'system' && <Check size={14} className="text-accent" />}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* 4. Keyboard shortcuts */}
              <DropdownMenuItem
                onClick={() => onOpenShortcuts?.()}
                className="text-[13px] gap-2.5 cursor-pointer"
              >
                <Keyboard size={16} className="text-fg-muted" />
                <span>Keyboard shortcuts</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* 5. Sign out */}
              <DropdownMenuItem
                onClick={onSignOut}
                className="text-[13px] gap-2.5 cursor-pointer"
              >
                <LogOut size={16} className="text-fg-muted" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  );
};
