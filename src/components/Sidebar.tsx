import React, { useState, useEffect } from 'react';
import type { ViewType, ThemeMode } from '../types';
import { useAuth } from '../context/AuthContext';
import { dailyLogService } from '../services/dailyLogService';
const ReamarcLogo3D = React.lazy(() => import('./ui/ReamarcLogo3D'));
import { getInitials, getRoleLabel } from '../utils/badgeStyles';
import { canAccessCrm, canAssignCrmLeads } from '../utils/crmAccess';
import type { CrmSubSection } from '../types/crm';
import type { AttendanceSubSection } from '../types/attendance';
import type { AdminSectionType } from './admin/AdminSidebarNav';
import {
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Shield,
  TrendingUp,
  ClipboardList,
  Clock,
  Settings,
  LayoutDashboard,
  Inbox,
  Building2,
  Contact,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  MessageSquareText,
  Webhook,
  SlidersHorizontal,
  Users,
  BarChart3,
  Calendar,
  BellRing,
  FolderKanban,
  Briefcase,
  Smartphone,
} from 'lucide-react';

interface SidebarProps {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  onSignOut: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  activeCrmSection?: CrmSubSection;
  onSelectCrmSection?: (section: CrmSubSection) => void;
  activeAttendanceSection?: AttendanceSubSection;
  onSelectAttendanceSection?: (section: AttendanceSubSection) => void;
  activeAdminSection?: AdminSectionType;
  onSelectAdminSection?: (section: AdminSectionType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  onSignOut,
  theme,
  onToggleTheme,
  activeCrmSection = 'board',
  onSelectCrmSection,
  activeAttendanceSection,
  onSelectAttendanceSection,
  activeAdminSection = 'directory',
  onSelectAdminSection,
}) => {
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(() => {
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

  const [isCrmExpanded, setIsCrmExpanded] = useState(true);
  const [isAttendanceExpanded, setIsAttendanceExpanded] = useState(true);
  const [isAdminExpanded, setIsAdminExpanded] = useState(true);
  const [requestCount, setRequestCount] = useState(0);

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
  const displayInitials = getInitials(user?.full_name || user?.name, user?.email);

  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isOperations = user?.role === 'operations';
  const isClient = user?.role === 'client';
  const isLead = user?.role === 'team_lead';
  const canSeeExceptions = isLead || isHR;
  const canSeeActiveClients = isLead || isHR || isAdmin || isOperations;
  const canSeeCrm = canAccessCrm(user);
  const canAssign = canAssignCrmLeads(user);
  const isManagementRole = isAdmin || isHR || isOperations;

  const crmSubItems = [
    { id: 'board' as CrmSubSection, label: 'Pipeline', icon: LayoutGrid },
    { id: 'deals' as CrmSubSection, label: 'Deals', icon: Briefcase },
    { id: 'list' as CrmSubSection, label: 'All Leads', icon: List },
    { id: 'followup' as CrmSubSection, label: 'Follow-ups', icon: Clock },
    { id: 'templates' as CrmSubSection, label: 'Templates', icon: MessageSquareText },
    ...(canAssign
      ? [
          { id: 'ingest' as CrmSubSection, label: 'Ingest Sources', icon: Webhook },
          { id: 'rules' as CrmSubSection, label: 'Rules & Team', icon: SlidersHorizontal },
        ]
      : []),
  ];

  const attendanceSubItems = isManagementRole
    ? [
        { id: 'daily-matrix' as AttendanceSubSection, label: 'Daily Attendance', icon: LayoutGrid },
        { id: 'punctuality-hub' as AttendanceSubSection, label: 'Punctuality Reports', icon: BarChart3 },
        { id: 'employee-timesheets' as AttendanceSubSection, label: 'Timesheets', icon: Users },
        { id: 'approvals' as AttendanceSubSection, label: 'Approvals', icon: Inbox },
      ]
    : [
        { id: 'timesheet' as AttendanceSubSection, label: 'My Timesheet', icon: Calendar },
        { id: 'requests' as AttendanceSubSection, label: 'My Requests', icon: Inbox },
      ];

  const adminSubItems = [
    { id: 'directory' as AdminSectionType, label: 'Team Directory', icon: Users, visible: true },
    { id: 'compliance' as AdminSectionType, label: 'Log Compliance', icon: BellRing, visible: isAdmin },
    { id: 'attendance_policies' as AdminSectionType, label: 'Attendance Policies', icon: Clock, visible: isAdmin || isHR },
    { id: 'mobile_ops' as AdminSectionType, label: 'Mobile & Alerts', icon: Smartphone, visible: isAdmin || isHR },
    { id: 'workspaces' as AdminSectionType, label: 'Workspaces', icon: FolderKanban, visible: isAdmin || isOperations },
    { id: 'ad_accounts' as AdminSectionType, label: 'Ad Accounts', icon: Briefcase, visible: isAdmin },
  ].filter((item) => item.visible);

  const deptLower = (user?.department || '').toLowerCase().trim();
  const isMarketingOrSEO = deptLower === 'seo' || deptLower === 'performance marketing';
  const canSeeMarketing =
    isAdmin ||
    isClient ||
    ((user?.role === 'team_lead' || user?.role === 'team_member') && isMarketingOrSEO);

  const canSeeAdmin = isAdmin || isHR || isOperations;
  const adminLabel = isAdmin ? 'Admin Panel' : isHR ? 'HR Panel' : 'Operations Panel';

  const navItems = [
    ...(!isAdmin && !isClient
      ? [
          {
            id: 'dashboard' as ViewType,
            label: 'Dashboard',
            icon: LayoutDashboard,
          },
        ]
      : []),
    ...(canSeeActiveClients
      ? [
          {
            id: 'active-clients' as ViewType,
            label: 'Active Clients',
            icon: Building2,
          },
        ]
      : []),
    ...(canSeeCrm
      ? [
          {
            id: 'crm' as ViewType,
            label: 'Sales Pipeline',
            icon: Contact,
          },
        ]
      : []),
    ...(canSeeMarketing
      ? [
          {
            id: 'marketing' as ViewType,
            label: isClient ? 'Client Portal' : 'Performance Marketing',
            icon: TrendingUp,
          },
        ]
      : []),
    ...(!isClient
      ? [
          {
            id: 'attendance' as ViewType,
            label: 'Attendance',
            icon: Clock,
          },
          {
            id: 'daily-log' as ViewType,
            label: 'Daily Log',
            icon: ClipboardList,
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
    ...(canSeeAdmin
      ? [
          {
            id: 'admin' as ViewType,
            label: adminLabel,
            icon: Shield,
          },
        ]
      : []),
  ];

  return (
    <aside
      className={`relative flex flex-col h-screen bg-zinc-50 dark:bg-[#0d0f14] border-r border-zinc-200 dark:border-zinc-800/80 transition-all duration-300 ease-in-out z-30 select-none ${
        isCollapsed ? 'w-20' : 'w-64'
      } shadow-xs`}
    >
      {/* Top Branding Bar */}
      <div className="px-4 py-4 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center shrink-0">
              <React.Suspense fallback={<div style={{ width: 32, height: 32 }} className="shrink-0" />}>
                <ReamarcLogo3D size={32} />
              </React.Suspense>
            </div>
            <div>
              <h1 className="text-sm font-bold text-zinc-950 dark:text-zinc-100 tracking-tight flex items-center gap-1.5 leading-none">
                Reamarc
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-600 text-white">
                  AI
                </span>
              </h1>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">Agency Operations Hub</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex items-center justify-center shrink-0">
            <React.Suspense fallback={<div style={{ width: 30, height: 30 }} className="shrink-0" />}>
              <ReamarcLogo3D size={30} />
            </React.Suspense>
          </div>
        )}

        <button
          type="button"
          onClick={toggleSidebar}
          className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {!isCollapsed && (
          <div className="px-2.5 pb-2 pt-1 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
            Modules
          </div>
        )}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const isCrm = item.id === 'crm';
          const isAttendance = item.id === 'attendance';
          const isAdminItem = item.id === 'admin';
          const hasSubItems = isCrm || isAttendance || isAdminItem;
          const isExpanded = isCrm ? isCrmExpanded : isAttendance ? isAttendanceExpanded : isAdminItem ? isAdminExpanded : false;

          return (
            <div key={item.id} className="space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  onSelectView(item.id);
                  if (isCrm) {
                    if (currentView === 'crm') {
                      setIsCrmExpanded(!isCrmExpanded);
                    } else {
                      setIsCrmExpanded(true);
                    }
                  } else if (isAttendance) {
                    if (currentView === 'attendance') {
                      setIsAttendanceExpanded(!isAttendanceExpanded);
                    } else {
                      setIsAttendanceExpanded(true);
                    }
                  } else if (isAdminItem) {
                    if (currentView === 'admin') {
                      setIsAdminExpanded(!isAdminExpanded);
                    } else {
                      setIsAdminExpanded(true);
                    }
                  }
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] font-semibold transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/60'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? item.label : undefined}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400 dark:text-zinc-500'}`} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </div>
                {!isCollapsed && hasSubItems && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isCrm) setIsCrmExpanded(!isCrmExpanded);
                      if (isAttendance) setIsAttendanceExpanded(!isAttendanceExpanded);
                      if (isAdminItem) setIsAdminExpanded(!isAdminExpanded);
                    }}
                    className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                    ) : (
                      <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                    )}
                  </div>
                )}
                {!isCollapsed && !hasSubItems && requestCount > 0 && (item.id === 'daily-log' || item.id === 'dashboard') && (
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}>
                    {requestCount}
                  </span>
                )}
              </button>

              {/* Expandable Sub-items for Sales Pipeline */}
              {!isCollapsed && isCrm && isCrmExpanded && (
                <div className="ml-3.5 pl-3 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-1 py-1.5 mt-0.5">
                  {crmSubItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const isSubActive = currentView === 'crm' && (activeCrmSection === sub.id || (!activeCrmSection && sub.id === 'board'));
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          if (currentView !== 'crm') {
                            onSelectView('crm');
                          }
                          onSelectCrmSection?.(sub.id);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-all cursor-pointer ${
                          isSubActive
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold shadow-2xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 font-medium'
                        }`}
                      >
                        <SubIcon className={`w-4 h-4 shrink-0 ${isSubActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
                        <span className="truncate">{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Expandable Sub-items for Attendance */}
              {!isCollapsed && isAttendance && isAttendanceExpanded && (
                <div className="ml-3.5 pl-3 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-1 py-1.5 mt-0.5">
                  {attendanceSubItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const defaultActiveId = isManagementRole ? 'daily-matrix' : 'timesheet';
                    const isSubActive =
                      currentView === 'attendance' &&
                      (activeAttendanceSection === sub.id || (!activeAttendanceSection && sub.id === defaultActiveId));
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          if (currentView !== 'attendance') {
                            onSelectView('attendance');
                          }
                          onSelectAttendanceSection?.(sub.id);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-all cursor-pointer ${
                          isSubActive
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold shadow-2xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 font-medium'
                        }`}
                      >
                        <SubIcon className={`w-4 h-4 shrink-0 ${isSubActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
                        <span className="truncate">{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Expandable Sub-items for Admin Panel */}
              {!isCollapsed && isAdminItem && isAdminExpanded && (
                <div className="ml-3.5 pl-3 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-1 py-1.5 mt-0.5">
                  {adminSubItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const isSubActive =
                      currentView === 'admin' &&
                      (activeAdminSection === sub.id || (!activeAdminSection && sub.id === 'directory'));
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          if (currentView !== 'admin') {
                            onSelectView('admin');
                          }
                          onSelectAdminSection?.(sub.id);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-all cursor-pointer ${
                          isSubActive
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold shadow-2xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 font-medium'
                        }`}
                      >
                        <SubIcon className={`w-4 h-4 shrink-0 ${isSubActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
                        <span className="truncate">{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Profile Settings Nav Item */}
        {user && (
          <button
            type="button"
            onClick={() => onSelectView('profile')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
              currentView === 'profile'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/60'
            } ${isCollapsed ? 'justify-center px-0' : ''}`}
            title={isCollapsed ? 'Profile Settings' : undefined}
          >
            <Settings className={`w-4 h-4 shrink-0 ${currentView === 'profile' ? 'text-white' : 'text-zinc-400 dark:text-zinc-500'}`} />
            {!isCollapsed && <span>Profile Settings</span>}
          </button>
        )}
      </nav>

      {/* Light / Dark Mode Toggle */}
      {!isCollapsed ? (
        <div className="mx-3 mb-3 p-2.5 rounded-xl bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between shadow-2xs">
          <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-indigo-400" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
            <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
          </span>
          <button
            type="button"
            onClick={onToggleTheme}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer ${
              theme === 'dark' ? 'bg-indigo-600' : 'bg-zinc-300'
            }`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            <span
              className={`pointer-events-none flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
                theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
              }`}
            >
              {theme === 'dark' ? (
                <Moon className="w-3 h-3 text-indigo-600 shrink-0" />
              ) : (
                <Sun className="w-3 h-3 text-amber-500 shrink-0" />
              )}
            </span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggleTheme}
          className="w-10 h-10 mx-auto mb-3 flex items-center justify-center rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shadow-2xs"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-600" />}
        </button>
      )}

      {/* User Profile Footer */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between">
        {!isCollapsed ? (
          <div className="flex items-center justify-between w-full">
            <div
              className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => onSelectView('profile')}
              title="Open Profile Settings"
            >
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs uppercase">
                  {displayInitials}
                </div>
                <span
                  className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ring-2 ring-white dark:ring-zinc-950 ${
                    user ? 'bg-emerald-500' : 'bg-zinc-400'
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-zinc-950 dark:text-zinc-200 truncate leading-tight">{displayName}</p>
                {user && (
                  <span className="inline-flex mt-0.5 px-1.5 py-0.5 text-[9px] font-extrabold rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                    {getRoleLabel(user.role)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelectView('profile')}
                className="text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors cursor-pointer"
                title="Profile Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="text-zinc-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                title={user ? 'Sign Out' : 'Sign In'}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 mx-auto">
            <button
              type="button"
              onClick={() => onSelectView('profile')}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors cursor-pointer"
              title="Profile Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
              title={user ? 'Sign Out' : 'Sign In'}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
