import React, { useState, useRef, useEffect } from 'react';
import type { ViewType, Workspace, ThemeMode } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  Inbox,
  Calendar,
  Brain,
  Settings,
  LogOut,
  ChevronDown,
  Sparkles,
  Check,
  Building2,
  PanelLeftClose,
  PanelLeft,
  Zap,
  Sun,
  Moon,
} from 'lucide-react';

interface SidebarProps {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  pendingCount: number;
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null; // null means 'All Workspaces'
  onSelectWorkspace: (workspace: Workspace | null) => void;
  onSignOut: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onAddWorkspace?: () => void;
}


export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  pendingCount,
  workspaces,
  selectedWorkspace,
  onSelectWorkspace,
  onSignOut,
  theme,
  onToggleTheme,
  onAddWorkspace,
}) => {
  const { user } = useAuth();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name?: string, email?: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0].substring(0, 2).toUpperCase();
    }
    if (email && email.trim()) {
      return email.trim().substring(0, 2).toUpperCase();
    }
    return 'GU';
  };

  const displayName = user?.name || 'Guest User';
  const displayEmail = user?.email || 'Sign in to sync data';
  const displayInitials = getInitials(user?.name, user?.email);

  const navItems = [
    {
      id: 'inbox' as ViewType,
      label: 'Approval Inbox',
      icon: Inbox,
      badge: pendingCount > 0 ? pendingCount : null,
      badgeColor: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
    },
    {
      id: 'campaigns' as ViewType,
      label: 'Campaign Manager',
      icon: Calendar,
      badge: null,
    },
    {
      id: 'knowledge' as ViewType,
      label: 'Brand Knowledge Base',
      icon: Brain,
      badge: null,
    },
    {
      id: 'settings' as ViewType,
      label: 'Settings',
      icon: Settings,
      badge: null,
    },
  ];

  return (
    <aside
      className={`relative flex flex-col h-screen bg-zinc-950 border-r border-zinc-800/80 transition-all duration-300 z-30 select-none ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Top Header & App Branding */}
      <div className="p-4 border-b border-zinc-800/60 flex items-center justify-between">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 font-bold text-sm">
              <Sparkles className="w-4 h-4 text-white animate-pulse-glow" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-zinc-100 tracking-tight flex items-center gap-1.5">
                Reamarc AI
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  PRO
                </span>
              </h1>
              <p className="text-[11px] text-zinc-500 font-medium">B2B Copy Director</p>
            </div>
          </div>
        )}

        {isCollapsed && (
          <div className="mx-auto w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
        )}

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800/60 transition-colors"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Workspace Switcher */}
      <div className="p-3 border-b border-zinc-800/40 relative" ref={menuRef}>
        {!isCollapsed ? (
          <div>
            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 block mb-1.5">
              Workspace
            </label>
            <button
              onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
              className="w-full flex items-center justify-between p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800/80 border border-zinc-800 text-left transition-all duration-200 group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold text-zinc-900 shrink-0 ${
                    selectedWorkspace ? selectedWorkspace.brandColor : 'bg-zinc-400'
                  }`}
                >
                  {selectedWorkspace ? selectedWorkspace.initials : 'ALL'}
                </div>
                <div className="min-w-0 truncate">
                  <p className="text-xs font-semibold text-zinc-200 group-hover:text-white truncate">
                    {selectedWorkspace ? selectedWorkspace.name : 'All Workspaces'}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-200 ${
                  isWorkspaceMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
            className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300"
            title={selectedWorkspace ? selectedWorkspace.name : 'All Workspaces'}
          >
            <Building2 className="w-4 h-4 text-indigo-400" />
          </button>
        )}

        {/* Dropdown Menu */}
        {isWorkspaceMenuOpen && (
          <div className="absolute left-3 right-3 top-full mt-1 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl z-50 p-1.5 space-y-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Switch Account Workspace
            </div>

            <button
              onClick={() => {
                onSelectWorkspace(null);
                setIsWorkspaceMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors ${
                selectedWorkspace === null
                  ? 'bg-indigo-600/10 text-indigo-400 font-semibold'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-zinc-700 text-zinc-200 text-[10px] font-bold flex items-center justify-center">
                  ALL
                </div>
                <span>All Workspaces</span>
              </div>
              {selectedWorkspace === null && <Check className="w-3.5 h-3.5 text-indigo-400" />}
            </button>

            <div className="h-px bg-zinc-800 my-1" />

            {workspaces.map((ws) => {
              const isSelected = selectedWorkspace?.id === ws.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => {
                    onSelectWorkspace(ws);
                    setIsWorkspaceMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors ${
                    isSelected
                      ? 'bg-indigo-600/10 text-indigo-400 font-semibold'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center text-zinc-950 ${ws.brandColor}`}
                    >
                      {ws.initials}
                    </div>
                    <div className="truncate text-left">
                      <p className="truncate leading-none">{ws.name}</p>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                </button>
              );
            })}

            {onAddWorkspace && (
              <>
                <div className="h-px bg-zinc-800 my-1" />
                <button
                  onClick={() => {
                    setIsWorkspaceMenuOpen(false);
                    onAddWorkspace();
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg text-xs text-indigo-400 hover:bg-indigo-600/10 font-semibold transition-colors"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>+ Create New Workspace</span>
                </button>
              </>
            )}
          </div>
        )}

      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {!isCollapsed && (
          <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            Main Navigation
          </div>
        )}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isCollapsed ? item.label : undefined}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                {!isCollapsed && <span>{item.label}</span>}
              </div>

              {item.badge !== null && !isCollapsed && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : item.badgeColor
                  }`}
                >
                  {item.badge}
                </span>
              )}

              {item.badge !== null && isCollapsed && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-indigo-500 rounded-full ring-2 ring-zinc-950 animate-pulse" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Theme Toggle Button */}
      {!isCollapsed ? (
        <div className="mx-3 mb-3 p-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between transition-colors">
          <span className="text-[11px] font-semibold text-zinc-300 px-2 flex items-center gap-2">
            {theme === 'dark' ? (
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            )}
            <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
          </span>
          <button
            onClick={onToggleTheme}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              theme === 'dark' ? 'bg-indigo-600' : 'bg-amber-400'
            }`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                theme === 'dark' ? 'translate-x-5 text-indigo-600' : 'translate-x-0 text-amber-600'
              }`}
            >
              {theme === 'dark' ? (
                <Moon className="w-3 h-3 text-indigo-600" />
              ) : (
                <Sun className="w-3 h-3 text-amber-600" />
              )}
            </span>
          </button>
        </div>
      ) : (
        <button
          onClick={onToggleTheme}
          className="w-10 h-10 mx-auto mb-3 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-colors"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
        </button>
      )}

      {/* AI Token Usage Banner */}
      {!isCollapsed && (
        <div className="mx-3 mb-3 p-3 rounded-xl bg-gradient-to-br from-indigo-50/80 to-purple-50/40 dark:from-zinc-900 dark:to-zinc-900/40 border border-indigo-100/80 dark:border-zinc-800/80 shadow-sm dark:shadow-none transition-all">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-600 dark:text-zinc-400 font-medium flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" /> AI Credits
            </span>
            <span className="text-slate-900 dark:text-zinc-200 font-semibold">14,250 / 20k</span>
          </div>
          <div className="w-full h-1.5 bg-slate-200/80 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 w-[71%] rounded-full" />
          </div>
        </div>
      )}

      {/* Bottom Profile & Sign Out */}
      <div className="p-3 border-t border-zinc-800/60 flex items-center justify-between">
        {!isCollapsed ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white font-semibold text-xs border border-zinc-700 uppercase">
                  {displayInitials}
                </div>
                <span
                  className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-zinc-950 ${
                    user ? 'bg-emerald-500' : 'bg-zinc-500'
                  }`}
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-200 truncate leading-tight">{displayName}</p>
                <p className="text-[11px] text-zinc-500 truncate leading-tight">{displayEmail}</p>
              </div>
            </div>
            <button
              onClick={onSignOut}
              className="text-zinc-400 hover:text-rose-400 p-2 rounded-lg hover:bg-rose-500/10 transition-colors"
              title={user ? 'Sign Out' : 'Sign In'}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onSignOut}
            className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title={user ? 'Sign Out' : 'Sign In'}
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
};
