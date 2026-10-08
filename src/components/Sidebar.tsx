import React, { useState, useEffect } from 'react';
import type { ViewType, ThemeMode, ThemePreference } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { dailyLogService } from '@/services/dailyLogService';
import { getInitials } from '@/utils/badgeStyles';
import { getRoleDisplayName } from '@/lib/roleLabel';
import { canAccessCrm, canAssignCrmLeads } from '@/utils/crmAccess';
import { canAccessContentCalendar } from '@/utils/contentCalendarAccess';
import { canAccessWebsitePipeline } from '@/utils/websiteProjectAccess';
import type { CrmSubSection } from '@/types/crm';
import type { AttendanceSubSection } from '@/types/attendance';
import type { AdminSectionType } from './admin/AdminSidebarNav';
import { BrandMark } from '@/components/ui/BrandMark';
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
  PanelLeft,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  LogOut,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  onOpenShortcuts?: () => void;
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
  onOpenShortcuts,
}) => {
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

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

  useEffect(() => {
    const role = user?.role;
    if (!role || !['team_member', 'team_lead', 'hr'].includes(role)) {
      setRequestCount(0);
      return;
    }
    let cancelled = false;
    dailyLogService
      .getDayTarget()
      .then((t) => {
        if (!cancelled) setRequestCount((t.follow_ups || []).length);
      })
      .catch(() => {
        if (!cancelled) setRequestCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, currentView]);

  const displayName = user?.full_name || user?.name || 'Guest Contributor';
  const displayEmail = user?.email || '';
  const displayInitials = getInitials(user?.full_name || user?.name, user?.email);
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
  const canAssign = canAssignCrmLeads(user);
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
    ...(canAssign
      ? [
          { id: 'settings' as CrmSubSection, label: 'Pipeline settings' },
        ]
      : []),
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
    { id: 'attendance_policies' as AdminSectionType, label: 'Attendance policies', visible: isAdmin || isHR },
    { id: 'mobile_ops' as AdminSectionType, label: 'Mobile & alerts', visible: isAdmin || isHR },
    { id: 'workspaces' as AdminSectionType, label: 'Workspaces', visible: isAdmin || isOperations },
    { id: 'ad_accounts' as AdminSectionType, label: 'Ad accounts', visible: isAdmin },
  ].filter((item) => item.visible);

  const websitePipelineSubItems = [
    { id: 'board' as const, label: 'Websites pipeline' },
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
        ...(!isAdmin && !isClient
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
                    (activeCrmSection === sub.id ||
                      (!activeCrmSection && sub.id === 'board') ||
                      (sub.id === 'settings' &&
                        (activeCrmSection === 'templates' ||
                          activeCrmSection === 'ingest' ||
                          activeCrmSection === 'rules'))),
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
                hasSubItems: true,
                isExpanded: isAdminExpanded,
                onToggleExpand: () => setIsAdminExpanded(!isAdminExpanded),
                subItems: adminSubItems.map((sub) => ({
                  id: sub.id,
                  label: sub.label,
                  isActive:
                    currentView === 'admin' &&
                    (activeAdminSection === sub.id || (!activeAdminSection && sub.id === 'directory')),
                  onSelect: () => {
                    if (currentView !== 'admin') onSelectView('admin');
                    onSelectAdminSection?.(sub.id);
                  },
                })),
              },
            ]
          : []),
      ],
    },
  ].filter((group) => group.items.length > 0);

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full bg-surface border-r border-border p-3 select-none transition-[width] duration-200 ease-[var(--ease-standard)] shrink-0 z-20',
        isCollapsed ? 'w-[64px]' : 'w-[248px]'
      )}
    >
      {/* 1. Brand Block (§8.1) */}
      {!isCollapsed ? (
        <div className="h-11 px-2 py-1.5 border border-border rounded-[10px] flex items-center gap-2.5 mb-4 shrink-0 bg-surface">
          <BrandMark size={28} />
          <div className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-fg leading-4 truncate">
              Reamarc
            </span>
            <span className="block text-xs text-fg-muted leading-4 truncate">
              Operations hub
            </span>
          </div>
        </div>
      ) : (
        <div className="h-11 flex items-center justify-center mb-4 shrink-0">
          <BrandMark size={28} />
        </div>
      )}

      {/* 2. Navigation Groups (§8.2, §8.3) */}
      <nav aria-label="Main" className="flex-1 overflow-y-auto space-y-3.5 pr-0.5">
        {groups.map((group, groupIndex) => (
          <div key={group.id} role="group" aria-labelledby={`nav-group-${group.id}`}>
            {/* Group Label / Divider */}
            {!isCollapsed ? (
              <div
                id={`nav-group-${group.id}`}
                className="text-xs font-medium text-fg-muted px-2.5 pb-1 leading-4 select-none"
              >
                {group.label}
              </div>
            ) : (
              groupIndex > 0 && <div className="my-2 border-t border-border" />
            )}

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
                      <span className="text-[13px] font-medium truncate flex-1 leading-5">
                        {item.label}
                      </span>

                      {/* Attention or standard badge */}
                      {item.badge !== undefined && item.badge > 0 && (
                        <span
                          className={cn(
                            'ml-auto text-micro leading-4 px-1.5 rounded-full font-mono font-medium',
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
                          className="p-0.5 rounded hover:bg-subtle text-fg-faint hover:text-fg transition-colors"
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
                      <div className="my-0.5 ml-[21px] pl-3 border-l border-border space-y-0.5">
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

      {/* 3. Bottom Area (§8.1, §8.7) */}
      <div className="mt-auto pt-2 space-y-1 shrink-0">
        {/* Settings nav item */}
        {!isCollapsed ? (
          <button
            type="button"
            onClick={() => onSelectView('profile')}
            className={cn(
              'w-full h-[34px] px-2.5 rounded-md flex items-center gap-2.5 transition-colors cursor-pointer select-none group',
              currentView === 'profile'
                ? 'bg-accent-soft text-accent-text font-medium'
                : 'text-fg-2 hover:bg-hover hover:text-fg'
            )}
          >
            <Settings
              size={18}
              className={cn(
                'shrink-0',
                currentView === 'profile' ? 'text-accent-text' : 'text-fg-muted group-hover:text-fg'
              )}
            />
            <span className="text-[13px] font-medium truncate leading-5">Settings</span>
          </button>
        ) : (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onSelectView('profile')}
                className={cn(
                  'w-10 h-[34px] mx-auto rounded-md flex items-center justify-center transition-colors cursor-pointer focus-visible:focus-ring',
                  currentView === 'profile'
                    ? 'bg-accent-soft text-accent-text'
                    : 'text-fg-2 hover:bg-hover hover:text-fg'
                )}
                aria-label="Settings"
              >
                <Settings
                  size={18}
                  className={currentView === 'profile' ? 'text-accent-text' : 'text-fg-muted'}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <span>Settings</span>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Collapse Toggle */}
        <div className={cn('flex items-center', isCollapsed ? 'justify-center' : 'justify-end pr-1')}>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleSidebar}
                className="w-8 h-8 rounded-md flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer select-none focus-visible:focus-ring"
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <span>{isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* User Block + DropdownMenu (§8.3, §8.7) */}
        <div className="border-t border-border mt-2 pt-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {!isCollapsed ? (
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 p-1 rounded-md hover:bg-hover transition-colors cursor-pointer select-none text-left focus-visible:focus-ring"
                >
                  <div className="w-8 h-8 rounded-full bg-accent-soft-2 text-accent-text border border-accent-200 flex items-center justify-center text-xs font-medium shrink-0">
                    {displayInitials}
                  </div>
                  <div className="min-w-0 flex-1">
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
                  <div className="w-8 h-8 rounded-full bg-accent-soft-2 text-accent-text border border-accent-200 flex items-center justify-center text-xs font-medium shrink-0">
                    {displayInitials}
                  </div>
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

              {/* 2. Profile & settings */}
              <DropdownMenuItem
                onClick={() => onSelectView('profile')}
                className="text-[13px] gap-2.5 cursor-pointer"
              >
                <Settings size={16} className="text-fg-muted" />
                <span>Profile & settings</span>
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
