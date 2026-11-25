import { brandNameOf } from '../utils/branding';
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import type { ViewType, ThemeMode, ThemePreference } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { dailyLogService } from '@/services/dailyLogService';
import { useCacheInvalidation } from '@/utils/cacheBus';
import { getRoleDisplayName } from '@/lib/roleLabel';
import { usePermissions } from '@/hooks/usePermissions';
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
  PanelLeft,
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
  Handshake,
  Bell,
  Palette,
  CalendarCheck,
  SlidersHorizontal,
  Smartphone,
  Flame,
  Calendar,
  MessageSquare,
  GitFork,
  Tags,
  Megaphone,
  Receipt,
  CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SettingsSectionSlug } from '@/types/settings';
import { getGroupedVisibleSettings } from '@/utils/settingsAccess';
import { isCompanyModuleEnabled } from '@/utils/companyModules';
import { prefetchView } from '@/routes/lazyViews';
import { useTaskCounts } from '@/hooks/useTaskCounts';
import { useSidebarHoverExpand } from '@/hooks/useSidebarHoverExpand';
import type { SidebarBehavior } from '@/utils/sidebarBehavior';

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
  'content-calendar-fields': Tags,
  'ad-accounts': Megaphone,
  access: ShieldCheck,
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
  behavior?: SidebarBehavior;
  onBehaviorChange?: (behavior: SidebarBehavior) => void;
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
  behavior,
  onBehaviorChange,
}) => {
  const { user, switchCompany } = useAuth();
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

  const behaviorDefined = behavior !== undefined;

  const [finePointer, setFinePointer] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    try {
      return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    try {
      const mql = window.matchMedia('(hover: hover) and (pointer: fine)');
      const handler = (e: MediaQueryListEvent) => {
        setFinePointer(e.matches);
      };
      if (mql.addEventListener) {
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
      } else if (mql.addListener) {
        mql.addListener(handler);
        return () => mql.removeListener(handler);
      }
    } catch {}
  }, []);

  const hoverExpandEnabled = behaviorDefined && !isMobile && behavior === 'hover' && finePointer;

  const {
    peekState,
    panelProps,
    setOverlayOpen,
    onTransitionEnd,
    closeNow,
  } = useSidebarHoverExpand({
    enabled: hoverExpandEnabled,
    openDelay: 120,
    closeDelay: 250,
    closeAnimMs: 240,
  });

  const collapseHoverPeek = () => {
    if (hoverExpandEnabled) closeNow();
  };

  const visuallyCollapsed = isMobile
    ? false
    : behaviorDefined
    ? (behavior === 'expanded' ? false : peekState === 'closed')
    : isCollapsed;

  const labelsShown = isMobile
    ? true
    : behaviorDefined
    ? behavior === 'expanded' || peekState === 'opening' || peekState === 'open'
    : !isCollapsed;

  const asideRef = useRef<HTMLElement | null>(null);
  const lastFocusedNavKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;
    const active = document.activeElement as HTMLElement | null;
    const activeNavKey =
      active?.closest?.('[data-nav-key]')?.getAttribute('data-nav-key') ??
      lastFocusedNavKeyRef.current;

    if (activeNavKey && (aside.contains(active) || lastFocusedNavKeyRef.current)) {
      const targetToFocus = aside.querySelector<HTMLElement>(`[data-nav-key="${activeNavKey}"]`);
      if (targetToFocus && targetToFocus !== active) {
        targetToFocus.focus({ preventScroll: true });
      }
    }
  }, [visuallyCollapsed]);

  const handleFocusCapture = (e: React.FocusEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    const navKey = target?.closest?.('[data-nav-key]')?.getAttribute('data-nav-key');
    if (navKey) {
      lastFocusedNavKeyRef.current = navKey;
    }
    panelProps.onFocusCapture(e);
  };

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
  const [isTasksExpanded, setIsTasksExpanded] = useState(() => currentView === 'tasks');
  const { counts: taskCounts, canSeeTasks: countsOk } = useTaskCounts();
  const [activeTaskSection, setActiveTaskSection] = useState(() => {
    try {
      return sessionStorage.getItem('reamarc_tasks_section') || 'all';
    } catch {
      return 'all';
    }
  });
  const [isPortalExpanded, setIsPortalExpanded] = useState(() => currentView === 'portal');
  const [requestCount, setRequestCount] = useState(0);

  // When currentView changes to a parent view, expand that group; leave other groups as the user left them (§8.4)
  useEffect(() => {
    if (currentView === 'crm') setIsCrmExpanded(true);
    if (currentView === 'attendance') setIsAttendanceExpanded(true);
    if (currentView === 'admin') setIsAdminExpanded(true);
    if (currentView === 'website-pipeline') setIsWebsiteExpanded(true);
    if (currentView === 'tasks') setIsTasksExpanded(true);
    if (currentView === 'portal') setIsPortalExpanded(true);
  }, [currentView]);

  const fetchBadge = useCallback(() => {
    const role = user?.role;
    if (!role || !['team_member', 'team_lead', 'hr'].includes(role) || user?.permissions?.modules?.daily_log === false) {
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

  const perms = usePermissions();
  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isOperations = user?.role === 'operations';
  const isClient = user?.role === 'client';
  const eff = user?.effective_access;
  const canSeeExceptions = perms.can('exceptions', 'department') && isCompanyModuleEnabled(user, 'daily_log');
  const canSeeActiveClients = user?.needs_setup ? false : perms.can('active_clients', 'view') && isCompanyModuleEnabled(user, 'active_clients');
  const canSeeCrm = (eff ? !!eff.sales : perms.canAccessCrm) && isCompanyModuleEnabled(user, 'sales');
  const canSeeWonDealApprovals = perms.canSeeWonDealApprovals && isCompanyModuleEnabled(user, 'sales');
  const canSeeContentCalendar = (eff ? !!eff.content_calendar : perms.canAccessContentCalendar) && isCompanyModuleEnabled(user, 'content_calendar');
  const canSeeWebsitePipeline = (eff ? !!eff.website : perms.canAccessWebsitePipeline) && isCompanyModuleEnabled(user, 'website');
  const canSeeAttendance = (isAdmin || (eff ? !!eff.attendance : perms.canAccessAttendance)) && isCompanyModuleEnabled(user, 'attendance');
  const canSeeDailyLog = (isAdmin || (eff ? !!eff.daily_log : perms.canAccessDailyLog)) && isCompanyModuleEnabled(user, 'daily_log');
  const isManagementRole = isAdmin || isHR || isOperations;
  const canSeeTasks = Boolean(countsOk && isCompanyModuleEnabled(user, 'tasks'));
  const canSeeDashboard = !isClient && isCompanyModuleEnabled(user, 'dashboard');

  const canSeeMarketing = (eff ? !!eff.ads : perms.canAccessAds) && isCompanyModuleEnabled(user, 'ads');
  const canSeeFinance = (isAdmin || isOperations) && isCompanyModuleEnabled(user, 'finance');

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
    { id: 'compliance' as AdminSectionType, label: 'Log variance', visible: isAdmin && isCompanyModuleEnabled(user, 'daily_log') },
    { id: 'workspaces' as AdminSectionType, label: 'Client workspaces', visible: (isAdmin || isOperations) && isCompanyModuleEnabled(user, 'active_clients') },
    { id: 'companies' as AdminSectionType, label: 'Companies', visible: Boolean(user?.is_super_admin) },
  ].filter((item) => item.visible);

  const websitePipelineSubItems = [
    { id: 'board' as const, label: 'Website pipeline' },
    { id: 'tasks' as const, label: 'Tasks pipeline' },
    { id: 'table' as const, label: 'Table view' },
  ];

  const applyTaskSection = (id: string) => {
    setActiveTaskSection(id);
    try {
      sessionStorage.setItem('reamarc_tasks_section', id);
      window.dispatchEvent(new Event('reamarc-tasks-section'));
    } catch {
      /* ignore */
    }
  };

  const taskSubItems = [
    { id: 'all', label: 'All tasks', count: taskCounts?.open ?? 0 },
    { id: 'todo', label: 'To Do', count: taskCounts?.todo ?? 0 },
    { id: 'in_progress', label: 'In Progress', count: taskCounts?.in_progress ?? 0 },
    { id: 'in_review', label: 'In Review', count: taskCounts?.in_review ?? 0 },
    { id: 'completed', label: 'Completed', count: taskCounts?.completed ?? 0 },
    { id: 'follow-up', label: 'Follow-up', count: (taskCounts?.overdue || 0) + (taskCounts?.today || 0) },
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
      highlightParent?: boolean;
      onParentSelect?: () => void;
      isExpanded?: boolean;
      onToggleExpand?: () => void;
      subItems?: { id: string; label: string; isActive: boolean; onSelect: () => void; badge?: number }[];
    }[];
  }

  const groups: NavGroup[] = user?.needs_setup
    ? [
        {
          id: 'overview',
          label: 'Overview',
          items: canSeeDashboard
            ? [
                {
                  id: 'dashboard' as ViewType,
                  label: 'Dashboard',
                  icon: LayoutDashboard,
                },
              ]
            : [],
        },
      ]
    : [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        ...(canSeeDashboard
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
        ...(canSeeWonDealApprovals
          ? [
              {
                id: 'won-deal-approvals' as ViewType,
                label: 'Won-deal approvals',
                icon: Handshake,
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
        ...(canSeeTasks
          ? [
              {
                id: 'tasks' as ViewType,
                label: 'Tasks',
                icon: CheckSquare,
                hasSubItems: true,
                onParentSelect: () => applyTaskSection('all'),
                isExpanded: isTasksExpanded,
                onToggleExpand: () => setIsTasksExpanded(!isTasksExpanded),
                badge: taskCounts?.open,
                subItems: taskSubItems.map((sub) => ({
                  id: sub.id,
                  label: sub.label,
                  badge: sub.count,
                  isActive: currentView === 'tasks' && activeTaskSection === sub.id,
                  onSelect: () => {
                    applyTaskSection(sub.id);
                    if (currentView !== 'tasks') onSelectView('tasks');
                  },
                })),
              },
            ]
          : []),
      ],
    },
    ...(canSeeFinance
      ? [
          {
            id: 'finance-group',
            label: 'Accounts',
            items: [
              {
                id: 'finance' as ViewType,
                label: 'Accounts',
                icon: Receipt,
              },
            ],
          },
        ]
      : []),
    {
      id: 'team',
      label: 'Team',
      items: [
        ...(canSeeAttendance
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
            ]
          : []),
        ...(canSeeDailyLog
          ? [
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
        ...(canSeeAdmin || user?.is_super_admin
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

  const isRailMode = behaviorDefined && !isMobile && behavior !== 'expanded';
  const isPeeking = isRailMode && (peekState === 'open' || peekState === 'opening');
  const isPeekingAny = isRailMode && peekState !== 'closed';

  const asideElement = (
    <aside
      ref={asideRef}
      id="app-sidebar"
      aria-label="Application sidebar"
      aria-expanded={!visuallyCollapsed}
      data-collapsed={visuallyCollapsed}
      data-peek={behaviorDefined && !isMobile ? peekState : undefined}
      data-behavior={behavior}
      data-labels={labelsShown ? 'shown' : 'hidden'}
      onTransitionEnd={onTransitionEnd}
      onPointerEnter={behaviorDefined && !isMobile ? panelProps.onPointerEnter : undefined}
      onPointerLeave={behaviorDefined && !isMobile ? panelProps.onPointerLeave : undefined}
      onFocusCapture={behaviorDefined && !isMobile ? handleFocusCapture : undefined}
      onBlurCapture={behaviorDefined && !isMobile ? panelProps.onBlurCapture : undefined}
      onKeyDown={behaviorDefined && !isMobile ? panelProps.onKeyDown : undefined}
      className={cn(
        'group/sidebar flex flex-col h-full bg-surface border-r border-border px-2 select-none shrink-0 motion-reduce:transition-none motion-reduce:delay-0',
        isRailMode
          ? cn(
              'absolute inset-y-0 left-0 z-[45] [contain:layout_paint] transition-[width] duration-200 ease-[var(--ease-standard,cubic-bezier(0.2,0,0,1))]',
              isPeeking ? 'w-[var(--sidebar-w,224px)]' : 'w-[var(--sidebar-w-collapsed,60px)]',
              peekState !== 'closed' && 'shadow-lg'
            )
          : cn(
              'relative z-20',
              visuallyCollapsed
                ? 'w-[60px] transition-[width] duration-200 delay-100 ease-[var(--ease-standard,cubic-bezier(0.2,0,0,1))]'
                : 'w-[224px] transition-[width] duration-200 delay-0 ease-[var(--ease-standard,cubic-bezier(0.2,0,0,1))]'
            )
      )}
      style={{
        paddingTop: 'var(--sb-aside-py, 12px)',
        paddingBottom: 'var(--sb-aside-py, 12px)',
      }}
    >
      {/* 1. Brand Block (§8.1, §8.5, Multi-Company Switcher) */}
      <div
        className="relative h-11 shrink-0"
        style={{ marginBottom: 'var(--sb-brand-mb, 15px)' }}
      >
        {/* Expanded state logo row */}
        <div className="sidebar-brand-expanded absolute inset-0 h-11 pl-[7px] pr-2 py-1.5 border border-border rounded-[10px] flex items-center gap-2 bg-surface select-none">
          {Boolean((user?.companies && user.companies.length > 1) || user?.is_super_admin) ? (
            <DropdownMenu onOpenChange={(open) => setOverlayOpen('company', open)}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  tabIndex={labelsShown || behavior === 'hover' ? 0 : -1}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-md hover:bg-subtle p-0 transition-colors group/brand cursor-pointer"
                >
                  {user?.company?.logo_url ? (
                    <img
                      src={user.company.logo_url}
                      alt=""
                      className="w-7 h-7 rounded-md object-cover border border-border shrink-0"
                    />
                  ) : (
                    <BrandMark size={28} className="shrink-0" />
                  )}
                  <div className="sidebar-label min-w-0 flex-1 truncate pr-1 select-none">
                    <div className="flex items-center gap-1">
                      <span className="block text-[13px] font-semibold text-fg leading-4 truncate">
                        {brandNameOf(user?.company)}
                      </span>
                      <ChevronsUpDown size={12} className="text-fg-muted shrink-0 opacity-60 group-hover/brand:opacity-100" />
                    </div>
                    <span className="block text-xs text-fg-muted leading-4 truncate">
                      {user?.role ? getRoleDisplayName(user.role) : brandNameOf(user?.company)}
                    </span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 p-1 z-50">
                <div className="px-2 py-1 text-[10px] font-semibold text-fg-muted uppercase tracking-wider">
                  Companies
                </div>
                {(user?.companies || [
                  {
                    id: user?.company_id || user?.company?.id || '',
                    name: brandNameOf(user?.company),
                    role: user?.role,
                    logo_url: user?.company?.logo_url,
                  },
                ]).map((comp) => {
                  const isCurrent = comp.id === (user?.company_id || user?.company?.id);
                  return (
                    <DropdownMenuItem
                      key={comp.id}
                      onClick={() => {
                        if (!isCurrent) {
                          void switchCompany(comp.id);
                        }
                      }}
                      className={cn(
                        'flex items-center justify-between gap-2 px-2.5 py-1.5 cursor-pointer rounded-md text-xs',
                        isCurrent && 'bg-subtle font-medium text-fg'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 truncate">
                        {comp.logo_url ? (
                          <img
                            src={comp.logo_url}
                            alt=""
                            className="w-5 h-5 rounded object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded bg-accent/15 text-accent flex items-center justify-center font-bold text-[10px] shrink-0">
                            {comp.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 truncate">
                          <div className="truncate text-fg font-medium">{comp.name}</div>
                          <div className="text-[10px] text-fg-muted truncate capitalize">
                            {comp.role ? getRoleDisplayName(comp.role) : 'Member'}
                          </div>
                        </div>
                      </div>
                      {isCurrent && <Check size={14} className="text-accent shrink-0" />}
                    </DropdownMenuItem>
                  );
                })}

                {user?.is_super_admin && (
                  <>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem
                      onClick={() => {
                        onSelectAdminSection?.('companies');
                      }}
                      className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-xs font-medium text-fg hover:text-accent rounded-md"
                    >
                      <Shield size={14} className="text-accent shrink-0" />
                      <span>Companies</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {user?.company?.logo_url ? (
                <img
                  src={user.company.logo_url}
                  alt=""
                  className="w-7 h-7 rounded-md object-cover border border-border shrink-0"
                />
              ) : (
                <BrandMark size={28} className="shrink-0" />
              )}
              <div className="sidebar-label min-w-0 flex-1 truncate pr-1 select-none">
                <span className="block text-[13px] font-semibold text-fg leading-4 truncate">
                  {brandNameOf(user?.company)}
                </span>
                <span className="block text-xs text-fg-muted leading-4 truncate">
                  {user?.role ? getRoleDisplayName(user.role) : brandNameOf(user?.company)}
                </span>
              </div>
            </div>
          )}

          {!isMobile && (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  tabIndex={labelsShown || behavior === 'hover' ? 0 : -1}
                  onClick={() => {
                    if (isPeekingAny && onBehaviorChange) {
                      onBehaviorChange('expanded');
                    } else {
                      toggleSidebar();
                    }
                  }}
                  aria-label={isPeekingAny ? 'Keep sidebar expanded' : 'Collapse sidebar'}
                  aria-expanded="true"
                  aria-controls="app-sidebar"
                  className="sidebar-label w-7 h-7 rounded-md flex items-center justify-center text-fg-muted hover:text-fg hover:bg-subtle transition-opacity duration-[120ms] ease-[var(--ease-standard)] cursor-pointer focus-visible:focus-ring opacity-0 group-hover/sidebar:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 shrink-0"
                >
                  {isPeekingAny ? (
                    <PanelLeftOpen size={16} strokeWidth={1.5} />
                  ) : (
                    <PanelLeftClose size={16} strokeWidth={1.5} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <span>{isPeekingAny ? 'Keep sidebar expanded' : 'Collapse sidebar'}</span>
                <kbd className="ml-1.5 font-mono text-[10px] text-fg-muted bg-surface/80 border border-border px-1 py-0.5 rounded">
                  {shortcutHint}
                </kbd>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Collapsed state logo expand button */}
        <div className="sidebar-brand-collapsed absolute inset-0 h-11 flex items-center justify-center select-none">
          <Tooltip
            delayDuration={300}
            open={behavior === 'hover' ? false : undefined}
            disableHoverableContent={behavior === 'hover'}
          >
            <TooltipTrigger asChild>
              <button
                type="button"
                tabIndex={labelsShown || behavior === 'hover' ? -1 : 0}
                onClick={() => {
                  if (behaviorDefined && onBehaviorChange) {
                    onBehaviorChange('expanded');
                  } else {
                    toggleSidebar();
                  }
                }}
                aria-label="Expand sidebar"
                aria-expanded="false"
                aria-controls="app-sidebar"
                className="sidebar-expand-btn relative w-7 h-7 rounded-mark bg-accent text-accent-fg font-semibold flex items-center justify-center shrink-0 cursor-pointer select-none focus-visible:focus-ring hover:bg-accent-hover transition-colors"
                style={{ fontSize: '14px' }}
              >
                <span className="sidebar-expand-r absolute inset-0 flex items-center justify-center transition-opacity duration-[120ms] ease-[var(--ease-standard)] opacity-100 motion-reduce:transition-none pointer-events-none">
                  {brandNameOf(user?.company).trim().charAt(0).toUpperCase()}
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
          aria-hidden={isSettingsMode ? true : undefined}
          inert={isSettingsMode ? true : undefined}
          className={cn(
            'sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden transition-[opacity,transform] duration-180 ease-[var(--ease-standard,cubic-bezier(0.2,0,0,1))] motion-reduce:transition-none motion-reduce:transform-none',
            labelsShown && 'sidebar-scroll-visible',
            isSettingsMode
              ? 'opacity-0 -translate-x-2 pointer-events-none absolute inset-0'
              : 'opacity-100 translate-x-0 relative flex-1'
          )}
        >
          {groups.filter((group) => group.items.length > 0).map((group, groupIndex) => (
            <div key={group.id} role="group" aria-labelledby={`nav-group-${group.id}`}>
              {/* Group Header Slot */}
              <div
                data-group-header
                className="relative shrink-0 select-none"
                style={{ height: 'var(--sb-group-h, 28px)' }}
              >
                <div
                  id={`nav-group-${group.id}`}
                  className="sidebar-label absolute inset-x-0 bottom-1 px-2.5 text-xs font-medium text-fg-muted leading-4 truncate whitespace-nowrap overflow-hidden"
                >
                  {group.label}
                </div>
                {groupIndex > 0 && (
                  <div
                    className="sidebar-rail-only absolute inset-x-2 top-1/2 -translate-y-1/2 border-t border-border"
                  />
                )}
              </div>

              {/* Group Items */}
              <div
                className="flex flex-col"
                style={{ gap: 'var(--sb-row-gap, 2px)' }}
              >
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isItemActive = currentView === item.id;
                  const isParentOfActive = isItemActive && item.hasSubItems;
                  const parentFilled = isItemActive && (!item.hasSubItems || item.highlightParent);

                  const rowButton = (
                    <button
                      type="button"
                      data-nav-key={item.id}
                      onMouseEnter={() => prefetchView(item.id)}
                      onClick={() => {
                        onSelectView(item.id);
                        item.onParentSelect?.();
                        if (!isRailMode && item.hasSubItems && currentView === item.id) {
                          item.onToggleExpand?.();
                        }
                        collapseHoverPeek();
                      }}
                      aria-current={isItemActive ? 'page' : undefined}
                      aria-label={item.label}
                      className={cn(
                        'w-full pl-[13px] pr-2 rounded-md flex items-center overflow-hidden whitespace-nowrap transition-colors cursor-pointer select-none group focus-visible:focus-ring',
                        parentFilled
                          ? 'bg-accent-soft text-accent-text font-medium'
                          : isParentOfActive
                          ? 'text-fg font-medium hover:bg-hover'
                          : 'text-fg-2 hover:bg-hover hover:text-fg'
                      )}
                      style={{ height: 'var(--sb-row-h, 34px)' }}
                    >
                      {/* Icon with dot badge wrapper */}
                      <div className="relative shrink-0 flex items-center justify-center">
                        <Icon
                          size={18}
                          className={cn(
                            'shrink-0',
                            isItemActive ? 'text-accent-text' : 'text-fg-muted group-hover:text-fg'
                          )}
                        />
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="sidebar-rail-only absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent" />
                        )}
                      </div>

                      {/* Label */}
                      <span className="sidebar-label ml-2.5 text-[13px] font-medium truncate flex-1 leading-5 text-left">
                        {item.label}
                      </span>

                      {/* Badge pill */}
                      {item.badge !== undefined && item.badge > 0 && (
                        <span
                          className={cn(
                            'sidebar-label ml-auto text-micro leading-4 px-1.5 rounded-full font-numeric font-medium whitespace-nowrap overflow-hidden shrink-0',
                            item.badgeAttention
                              ? 'bg-accent-soft-2 text-accent-text'
                              : 'bg-subtle text-fg-2'
                          )}
                        >
                          {item.badge}
                        </span>
                      )}

                      {/* Sub-item Chevron (omitted in the icon-only collapsed preference) */}
                      {item.hasSubItems && !(behavior === 'collapsed' && !isMobile) && (
                        <span
                          role="button"
                          tabIndex={labelsShown ? 0 : -1}
                          aria-label={`Toggle ${item.label} sub-items`}
                          onClick={(e) => {
                            e.stopPropagation();
                            item.onToggleExpand?.();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              e.preventDefault();
                              item.onToggleExpand?.();
                            }
                          }}
                          className="sidebar-label p-0.5 rounded hover:bg-subtle text-fg-faint hover:text-fg transition-colors shrink-0 ml-1 cursor-pointer"
                        >
                          <ChevronRight
                            size={14}
                            className={cn(
                              'transition-transform duration-160',
                              item.isExpanded && 'rotate-90'
                            )}
                          />
                        </span>
                      )}
                    </button>
                  );

                  if (isRailMode) {
                    // Icon-only preference: a right-side menu is the only way to reach sub-tabs.
                    if (behavior === 'collapsed' && item.hasSubItems && item.subItems) {
                      return (
                        <DropdownMenu
                          key={item.id}
                          onOpenChange={(open) => setOverlayOpen(`sub-${item.id}`, open)}
                        >
                          <Tooltip
                            delayDuration={300}
                            open={undefined}
                            disableHoverableContent={false}
                          >
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                {rowButton}
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
                                <span className="truncate flex-1">{sub.label}</span>
                                {sub.badge !== undefined && sub.badge > 0 && (
                                  <span className="ml-2 text-micro font-numeric text-fg-muted">{sub.badge}</span>
                                )}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    }

                    if (item.hasSubItems && item.subItems) {
                      const showSubs = labelsShown && !!item.isExpanded;
                      return (
                        <div key={item.id} className="space-y-0.5">
                          <Tooltip
                            delayDuration={300}
                            open={false}
                            disableHoverableContent
                          >
                            <TooltipTrigger asChild>{rowButton}</TooltipTrigger>
                            <TooltipContent side="right">
                              <span>{item.label}</span>
                              {item.badge && item.badge > 0 && <span> ({item.badge})</span>}
                            </TooltipContent>
                          </Tooltip>
                          {showSubs && (
                            <div
                              data-sidebar-subitems={item.id}
                              className="my-0.5 ml-[21px] pl-3 border-l border-border space-y-0.5 whitespace-nowrap overflow-hidden"
                            >
                              {item.subItems.map((sub) => (
                                <button
                                  key={sub.id}
                                  type="button"
                                  data-nav-key={`${item.id}-${sub.id}`}
                                  onClick={() => {
                                    sub.onSelect();
                                    collapseHoverPeek();
                                  }}
                                  className={cn(
                                    'w-full h-[30px] px-2.5 rounded-md flex items-center text-[13px] transition-colors cursor-pointer select-none truncate text-left focus-visible:focus-ring',
                                    sub.isActive
                                      ? 'bg-accent-soft text-accent-text font-medium'
                                      : 'text-fg-2 hover:bg-hover hover:text-fg font-normal'
                                  )}
                                >
                                  <span className="truncate flex-1">{sub.label}</span>
                                  {sub.badge !== undefined && sub.badge > 0 && (
                                    <span className="ml-2 text-micro font-numeric text-fg-muted">{sub.badge}</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <Tooltip
                        key={item.id}
                        delayDuration={300}
                        open={behavior === 'collapsed' ? undefined : false}
                        disableHoverableContent={behavior === 'hover'}
                      >
                        <TooltipTrigger asChild>{rowButton}</TooltipTrigger>
                        <TooltipContent side="right">
                          <span>{item.label}</span>
                          {item.badge && item.badge > 0 && <span> ({item.badge})</span>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  // !isRailMode (expanded mode, mobile, etc.)
                  return (
                    <div key={item.id} className="space-y-0.5">
                      <Tooltip
                        delayDuration={300}
                        open={false}
                        disableHoverableContent
                      >
                        <TooltipTrigger asChild>{rowButton}</TooltipTrigger>
                        <TooltipContent side="right">
                          <span>{item.label}</span>
                          {item.badge && item.badge > 0 && <span> ({item.badge})</span>}
                        </TooltipContent>
                      </Tooltip>

                      {/* Inline Sub-item List */}
                      {item.hasSubItems && item.isExpanded && item.subItems && (
                        <div
                          data-sidebar-subitems={item.id}
                          className="my-0.5 ml-[21px] pl-3 border-l border-border space-y-0.5 whitespace-nowrap overflow-hidden"
                        >
                          {item.subItems.map((sub) => (
                            <button
                              key={sub.id}
                              type="button"
                              data-nav-key={`${item.id}-${sub.id}`}
                              onClick={sub.onSelect}
                              className={cn(
                                'w-full h-[30px] px-2.5 rounded-md flex items-center text-[13px] transition-colors cursor-pointer select-none truncate text-left focus-visible:focus-ring',
                                sub.isActive
                                  ? 'bg-accent-soft text-accent-text font-medium'
                                  : 'text-fg-2 hover:bg-hover hover:text-fg font-normal'
                              )}
                            >
                              <span className="truncate flex-1">{sub.label}</span>
                              {sub.badge !== undefined && sub.badge > 0 && (
                                <span className="ml-2 text-micro font-numeric text-fg-muted">{sub.badge}</span>
                              )}
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
        aria-hidden={isSettingsMode ? undefined : true}
        inert={isSettingsMode ? undefined : true}
        className={cn(
          'sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden transition-[opacity,transform] duration-180 ease-[var(--ease-standard,cubic-bezier(0.2,0,0,1))] motion-reduce:transition-none motion-reduce:transform-none',
          labelsShown && 'sidebar-scroll-visible',
          isSettingsMode
            ? 'opacity-100 translate-x-0 relative flex-1'
            : 'opacity-0 translate-x-2 pointer-events-none absolute inset-0'
        )}
      >
        {/* Back to app button */}
        <div className="pt-0.5 pb-1">
          <Tooltip
            delayDuration={300}
            open={behavior === 'collapsed' ? undefined : false}
            disableHoverableContent={behavior === 'hover'}
          >
            <TooltipTrigger asChild>
              <button
                type="button"
                data-nav-key="back-to-app"
                onClick={() => { handleBackToApp(); collapseHoverPeek(); }}
                aria-label="Back to app"
                className="w-full pl-[14px] pr-2 rounded-md flex items-center overflow-hidden whitespace-nowrap text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer text-xs font-medium focus-visible:focus-ring"
                style={{ height: 'var(--sb-row-h, 34px)' }}
              >
                <ArrowLeft size={16} className="shrink-0" />
                <span className="sidebar-label ml-2.5 truncate">
                  Back to app
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Back to app</TooltipContent>
          </Tooltip>
        </div>

        {/* Settings Heading Slot */}
        <div
          data-group-header
          className="relative shrink-0 select-none"
          style={{ height: 'var(--sb-group-h, 28px)' }}
        >
          <h2 className="sidebar-label absolute inset-x-0 bottom-1 px-2.5 text-sm font-semibold text-fg tracking-tight truncate whitespace-nowrap overflow-hidden">
            Settings
          </h2>
        </div>

        {/* Settings Groups & Sections */}
        {settingsGroups.map((group, groupIdx) => (
          <div key={group.group} role="group" aria-label={group.label} className="space-y-0.5">
            {/* Group Header Slot */}
            <div
              data-group-header
              className="relative shrink-0 select-none"
              style={{ height: 'var(--sb-group-h, 28px)' }}
            >
              <div className="sidebar-label absolute inset-x-0 bottom-1 px-2.5 text-[11px] font-medium text-fg-muted leading-4 truncate whitespace-nowrap overflow-hidden">
                {group.label}
              </div>
              {groupIdx > 0 && (
                <div className="sidebar-rail-only absolute inset-x-2 top-1/2 -translate-y-1/2 border-t border-border" />
              )}
            </div>

            <div
              className="flex flex-col"
              style={{ gap: 'var(--sb-row-gap, 2px)' }}
            >
              {group.sections.map((sec) => {
                const Icon = SETTINGS_ICONS[sec.slug] || Settings;
                const isSecActive = activeSettingsSection === sec.slug;

                return (
                  <Tooltip
                    key={sec.slug}
                    delayDuration={300}
                    open={behavior === 'collapsed' ? undefined : false}
                    disableHoverableContent={behavior === 'hover'}
                  >
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        data-nav-key={sec.slug}
                        onClick={() => { onSelectSettingsSection?.(sec.slug); collapseHoverPeek(); }}
                        className={cn(
                          'w-full pl-[14px] pr-2 rounded-md flex items-center overflow-hidden whitespace-nowrap transition-colors cursor-pointer select-none text-[13px] leading-5 focus-visible:focus-ring',
                          isSecActive
                            ? 'bg-accent-soft text-accent-text font-medium'
                            : 'text-fg-2 hover:bg-hover hover:text-fg font-normal'
                        )}
                        style={{ height: 'var(--sb-row-h, 34px)' }}
                        aria-current={isSecActive ? 'page' : undefined}
                        aria-label={sec.label}
                      >
                        <Icon
                          size={16}
                          className={cn('shrink-0', isSecActive ? 'text-accent-text' : 'text-fg-muted')}
                        />
                        <span className="sidebar-label ml-2.5 truncate font-medium">
                          {sec.label}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{sec.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      </div>

      {/* 3. Bottom Area (§8.1, §8.7) - ONLY Settings and User Block */}
      <div className="mt-auto shrink-0 select-none">
        {/* Settings nav item */}
        <Tooltip
          delayDuration={300}
          open={behavior === 'collapsed' ? undefined : false}
          disableHoverableContent={behavior === 'hover'}
        >
          <TooltipTrigger asChild>
            <button
              type="button"
              data-nav-key="settings"
              onMouseEnter={() => prefetchView('settings')}
              onClick={() => {
                onSelectView('settings');
                if (onSelectSettingsSection) onSelectSettingsSection('profile');
                collapseHoverPeek();
              }}
              className={cn(
                'w-full pl-[13px] pr-2 rounded-md flex items-center overflow-hidden whitespace-nowrap transition-colors cursor-pointer select-none group focus-visible:focus-ring',
                currentView === 'settings'
                  ? 'bg-accent-soft text-accent-text font-medium'
                  : 'text-fg-2 hover:bg-hover hover:text-fg'
              )}
              style={{ height: 'var(--sb-row-h, 34px)' }}
              aria-label="Settings"
              aria-current={currentView === 'settings' ? 'page' : undefined}
            >
              <Settings
                size={18}
                className={cn(
                  'shrink-0',
                  currentView === 'settings' ? 'text-accent-text' : 'text-fg-muted group-hover:text-fg'
                )}
              />
              <span className="sidebar-label ml-2.5 text-[13px] font-medium truncate leading-5 text-left">
                Settings
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <span>Settings</span>
          </TooltipContent>
        </Tooltip>

        {/* User Block + DropdownMenu (§8.3, §8.7) */}
        <div
          className="border-t border-border"
          style={{
            marginTop: 'var(--sb-bottom-mt, 8px)',
            paddingTop: 'var(--sb-bottom-pt, 8px)',
          }}
        >
          <DropdownMenu onOpenChange={(open) => setOverlayOpen('user', open)}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-nav-key="user-menu"
                aria-label={labelsShown ? undefined : 'User menu'}
                className="w-full pl-[6px] pr-2 rounded-md flex items-center overflow-hidden whitespace-nowrap hover:bg-hover transition-colors cursor-pointer select-none text-left focus-visible:focus-ring"
                style={{ height: 'var(--sb-user-h, 40px)' }}
              >
                <Avatar
                  name={displayName}
                  src={user?.avatar_url}
                  size={32}
                  className="rounded-full shrink-0"
                />
                <div className="sidebar-label min-w-0 flex-1 ml-2.5 whitespace-nowrap overflow-hidden text-left">
                  <span className="block text-[13px] font-medium text-fg leading-4 truncate">
                    {displayName}
                  </span>
                  <span className="block text-xs text-fg-muted leading-4 truncate">
                    {displayRole}
                  </span>
                </div>
                <ChevronsUpDown size={16} className="sidebar-label text-fg-muted shrink-0 ml-1" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent side="top" align="start" sideOffset={6} className="w-60">
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

              {/* 3b. Sidebar sub-menu */}
              {!isMobile && behaviorDefined && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="text-[13px] gap-2.5 cursor-pointer">
                    <PanelLeftOpen size={16} className="text-fg-muted" />
                    <span>Sidebar</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuItem
                      onClick={() => onBehaviorChange?.('expanded')}
                      className="text-[13px] gap-2 cursor-pointer flex justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <PanelLeft size={14} className="text-fg-muted" />
                        <span>Expanded</span>
                      </div>
                      {behavior === 'expanded' && <Check size={14} className="text-accent" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onBehaviorChange?.('collapsed')}
                      className="text-[13px] gap-2 cursor-pointer flex justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <PanelLeftClose size={14} className="text-fg-muted" />
                        <span>Collapsed</span>
                      </div>
                      {behavior === 'collapsed' && <Check size={14} className="text-accent" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onBehaviorChange?.('hover')}
                      className="text-[13px] gap-2 cursor-pointer flex justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <PanelLeftOpen size={14} className="text-fg-muted" />
                        <span>Expand on hover</span>
                      </div>
                      {behavior === 'hover' && <Check size={14} className="text-accent" />}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

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

  if (behaviorDefined && !isMobile) {
    return (
      <div
        data-sidebar-rail
        className={cn(
          'relative h-full shrink-0 transition-[width] duration-200 ease-[var(--ease-standard,cubic-bezier(0.2,0,0,1))]',
          behavior === 'expanded'
            ? 'w-[var(--sidebar-w,224px)]'
            : 'w-[var(--sidebar-w-collapsed,60px)]'
        )}
      >
        {asideElement}
      </div>
    );
  }

  return asideElement;
};
