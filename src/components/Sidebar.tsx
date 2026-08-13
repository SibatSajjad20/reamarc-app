import React, { useState, useRef, useEffect } from 'react';
import type { ViewType, Workspace, ThemeMode } from '../types';
import { useAuth } from '../context/AuthContext';
import { LottieLogo } from './ui/LottieLogo';
import {
  LogOut,
  ChevronDown,
  Check,
  Building2,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Plus,
  Shield,
  TrendingUp,
} from 'lucide-react';
import { HasPermission } from './HasPermission';

interface SidebarProps {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  pendingCount?: number;
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace | null) => void;
  onSignOut: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onAddWorkspace?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
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

  const displayName = user?.name || 'Guest Director';
  const displayEmail = user?.email || 'Sign in to sync session';
  const displayInitials = getInitials(user?.name, user?.email);

  const navItems = [
    {
      id: 'marketing' as ViewType,
      label: 'Performance Marketing',
      icon: TrendingUp,
      badge: 'V1.0',
      badgeColor: 'bg-orange-500/20 text-orange-600 dark:text-orange-300 border border-orange-500/30',
    },
    ...(user?.role === 'admin'
      ? [
          {
            id: 'admin' as ViewType,
            label: 'Admin Panel',
            icon: Shield,
            badge: 'Admin',
            badgeColor: 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30',
          },
        ]
      : []),
  ];

  return (
    <aside
      className={`relative flex flex-col h-screen bg-white dark:bg-[#0d0d10] border-r border-slate-200 dark:border-zinc-800/70 transition-all duration-300 ease-in-out z-30 select-none ${isCollapsed ? 'w-20' : 'w-64'
        } shadow-sm`}
    >
      {/* Top Branding Bar */}
      <div className="px-4 py-3.5 border-b border-slate-100 dark:border-zinc-800/60 flex items-center justify-between">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm flex items-center justify-center">
              <LottieLogo size={28} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-1.5 leading-none">
                Reamarc
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-600 text-white">
                  AI
                </span>
              </h1>
            </div>
          </div>
        ) : (
          <div className="mx-auto p-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center shadow-sm">
            <LottieLogo size={26} />
          </div>
        )}

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Workspace Context Switcher */}
      <div className="p-3 border-b border-slate-200 dark:border-zinc-800/40 relative" ref={menuRef}>
        {!isCollapsed ? (
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider px-2 block mb-1.5">
              Workspace Context
            </label>
            <button
              onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800/80 border border-slate-200 dark:border-zinc-800 text-left transition-all duration-150 group cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-extrabold text-white shrink-0 ${selectedWorkspace ? selectedWorkspace.brandColor : 'bg-slate-700'
                    }`}
                >
                  {selectedWorkspace ? selectedWorkspace.initials : 'ALL'}
                </div>
                <div className="min-w-0 truncate">
                  <p className="text-xs font-bold text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-white truncate leading-none">
                    {selectedWorkspace ? selectedWorkspace.name : 'All Workspaces'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate mt-0.5 font-medium">
                    {selectedWorkspace?.tagline || 'Global workspace filter'}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 dark:text-zinc-400 shrink-0 transition-transform duration-150 ${isWorkspaceMenuOpen ? 'rotate-180' : ''
                  }`}
              />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
            className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shadow-sm"
            title={selectedWorkspace ? selectedWorkspace.name : 'All Workspaces'}
          >
            <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </button>
        )}

        {/* Dropdown Menu */}
        {isWorkspaceMenuOpen && (
          <div className="absolute left-3 right-3 top-full mt-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/90 rounded-2xl shadow-2xl z-50 p-2 space-y-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 max-h-80 overflow-y-auto custom-scrollbar">
            <div className="px-2 py-1 text-[10px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-wider">
              Switch Workspace Context
            </div>

            <button
              onClick={() => {
                onSelectWorkspace(null);
                setIsWorkspaceMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${selectedWorkspace === null
                  ? 'bg-indigo-50 dark:bg-indigo-600/15 text-indigo-600 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-500/20'
                  : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-md bg-slate-200 dark:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-[10px] font-bold flex items-center justify-center">
                  ALL
                </div>
                <span className="font-semibold">All Workspaces</span>
              </div>
              {selectedWorkspace === null && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
            </button>

            <div className="h-px bg-slate-200 dark:bg-zinc-800 my-1" />

            {workspaces.map((ws) => {
              const isSelected = selectedWorkspace?.id === ws.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => {
                    onSelectWorkspace(ws);
                    setIsWorkspaceMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-600/15 text-indigo-600 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-500/20'
                      : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-md text-[10px] font-extrabold flex items-center justify-center text-white ${ws.brandColor}`}
                    >
                      {ws.initials}
                    </div>
                    <div className="truncate text-left font-semibold">
                      <p className="truncate leading-none">{ws.name}</p>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                </button>
              );
            })}

            {onAddWorkspace && (
              <HasPermission allowedRoles={['admin', 'editor']}>
                <div className="h-px bg-slate-200 dark:bg-zinc-800 my-1" />
                <button
                  onClick={() => {
                    setIsWorkspaceMenuOpen(false);
                    onAddWorkspace();
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-xl text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 font-bold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create New Workspace</span>
                </button>
              </HasPermission>
            )}
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {!isCollapsed && (
          <div className="px-2 pb-1.5 pt-0.5 text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
            Navigation
          </div>
        )}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`w-full flex items-center justify-between px-2.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150 cursor-pointer ${isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isCollapsed ? item.label : undefined}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 dark:text-zinc-500'}`} />
                {!isCollapsed && <span>{item.label}</span>}
              </div>

              {item.badge !== null && !isCollapsed && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${isActive ? 'bg-white/20 text-white' : item.badgeColor
                    }`}
                >
                  {item.badge}
                </span>
              )}

              {item.badge !== null && isCollapsed && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-indigo-500 rounded-full ring-2 ring-white dark:ring-zinc-950 animate-pulse" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Light / Dark Mode Toggle */}
      {!isCollapsed ? (
        <div className="mx-3 mb-3 p-2.5 rounded-xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 flex items-center justify-between shadow-sm">
          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-indigo-400" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
            <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
          </span>
          <button
            onClick={onToggleTheme}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer ${theme === 'dark' ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            <span
              className={`pointer-events-none flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
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
          onClick={onToggleTheme}
          className="w-10 h-10 mx-auto mb-3 flex items-center justify-center rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shadow-sm"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-600" />}
        </button>
      )}

      {/* User Profile Footer */}
      <div className="p-3 border-t border-slate-200 dark:border-zinc-800/60 flex items-center justify-between">
        {!isCollapsed ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs border border-slate-300 dark:border-zinc-700 uppercase shadow-sm">
                  {displayInitials}
                </div>
                <span
                  className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-zinc-950 ${user ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 leading-tight">
                  <p className="text-xs font-bold text-slate-900 dark:text-zinc-200 truncate">{displayName}</p>
                  {user && (
                    <span className="px-1.5 py-0.2 text-[9px] font-extrabold capitalize rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                      {user.role}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate leading-tight mt-0.5 font-medium">{displayEmail}</p>
              </div>
            </div>
            <button
              onClick={onSignOut}
              className="text-slate-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
              title={user ? 'Sign Out' : 'Sign In'}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onSignOut}
            className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
            title={user ? 'Sign Out' : 'Sign In'}
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
};
