import React, { useState, useEffect } from 'react';
import type { ViewType, ThemeMode } from '../types';
import { useAuth } from '../context/AuthContext';
import { dailyLogService } from '../services/dailyLogService';
import { LottieLogo } from './ui/LottieLogo';
import { getInitials, getRoleLabel } from '../utils/badgeStyles';
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
} from 'lucide-react';

interface SidebarProps {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  onSignOut: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  onSignOut,
  theme,
  onToggleTheme,
}) => {
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
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

  const deptLower = (user?.department || '').toLowerCase().trim();
  const isMarketingOrSEO = deptLower === 'seo' || deptLower === 'performance marketing';
  const canSeeMarketing =
    isAdmin ||
    isClient ||
    ((user?.role === 'team_lead' || user?.role === 'team_member') && isMarketingOrSEO);

  const canSeeAdmin = isAdmin || isHR || isOperations;
  const adminLabel = isAdmin ? 'Admin Panel' : isHR ? 'HR Operations Hub' : 'Operations Panel';

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
            <div className="p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs flex items-center justify-center">
              <LottieLogo size={28} />
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
          <div className="mx-auto p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-2xs">
            <LottieLogo size={26} />
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
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
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/60'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isCollapsed ? item.label : undefined}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400 dark:text-zinc-500'}`} />
                {!isCollapsed && <span>{item.label}</span>}
              </div>
              {!isCollapsed && requestCount > 0 && (item.id === 'daily-log' || item.id === 'dashboard') && (
                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}>
                  {requestCount}
                </span>
              )}
            </button>
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