import React from 'react';
import type { Workspace, ThemeMode } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { HasPermission } from '../HasPermission';
import {
  Settings,
  Zap,
  Bot,
  Check,
  Sun,
  Moon,
  Palette,
  User as UserIcon,
  ShieldCheck,
  Building2,
  Plus,
  Edit3,
  Trash2,
} from 'lucide-react';

interface SettingsViewProps {
  selectedWorkspace: Workspace | null;
  workspaces: Workspace[];
  theme: ThemeMode;
  onSetTheme: (theme: ThemeMode) => void;
  onAddWorkspace: () => void;
  onEditWorkspace: (workspace: Workspace) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  workspaces,
  theme,
  onSetTheme,
  onAddWorkspace,
  onEditWorkspace,
  onDeleteWorkspace,
}) => {
  const { user } = useAuth();

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-zinc-950 overflow-y-auto font-sans text-slate-900 dark:text-zinc-100 select-none">
      <header className="h-16 border-b border-slate-200 dark:border-zinc-800/80 px-6 flex items-center justify-between bg-white dark:bg-zinc-950/80 backdrop-blur-md shrink-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/60 text-slate-700 dark:text-zinc-300">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 dark:text-zinc-100">Settings & Workspace Manager</h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
              Manage user profile, workspaces, LLM engines, and social publishing channels.
            </p>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-8 max-w-4xl mx-auto w-full">
        {/* User Account Profile Info */}
        <div className="bg-white dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5">
            <UserIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-zinc-100">Active User Profile</h2>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg shadow-lg border border-slate-300 dark:border-zinc-700 uppercase">
                {user?.name ? user.name.slice(0, 2) : 'GU'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">{user?.name || 'Guest User'}</h3>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                    <ShieldCheck className="w-3 h-3" /> Authenticated
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 font-medium">{user?.email || 'Not logged in'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Brand Workspaces Manager */}
        <div className="bg-white dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-zinc-100">Brand Workspaces</h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Multi-tenant client brand environments</p>
              </div>
            </div>
            <HasPermission allowedRoles={['admin', 'editor']}>
              <button
                onClick={onAddWorkspace}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Create Workspace
              </button>
            </HasPermission>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80 flex items-center justify-between group hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl ${ws.brandColor} flex items-center justify-center text-white font-bold text-sm shadow-md`}
                  >
                    {ws.initials}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100">{ws.name}</h3>
                      {ws.isDefault && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400 font-bold border border-slate-300 dark:border-zinc-700">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">{ws.industry || 'General B2B'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <HasPermission allowedRoles={['admin', 'editor']}>
                    <button
                      onClick={() => onEditWorkspace(ws)}
                      className="p-2 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Edit Workspace"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </HasPermission>
                  {workspaces.length > 1 && (
                    <HasPermission allowedRoles={['admin', 'editor']}>
                      <button
                        onClick={() => onDeleteWorkspace(ws.id)}
                        className="p-2 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete Workspace"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </HasPermission>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Appearance & Visual Theme Selection */}
        <div className="bg-white dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Palette className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-zinc-100">Appearance & Visual Theme</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => {
                if (theme !== 'dark') {
                  onSetTheme('dark');
                }
              }}
              className={`p-5 rounded-3xl border text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                theme === 'dark'
                  ? 'bg-zinc-900 border-indigo-500 shadow-xl ring-2 ring-indigo-500/50'
                  : 'bg-slate-50 dark:bg-zinc-950/60 border-slate-200 dark:border-zinc-800 hover:border-slate-300 text-slate-700 dark:text-zinc-400'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Moon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Dark Mode</h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">Low-glare deep aesthetic</p>
                  </div>
                </div>
                {theme === 'dark' && (
                  <span className="p-1 rounded-full bg-indigo-500 text-white">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>

              <div className="w-full h-16 rounded-xl bg-zinc-950 border border-zinc-800 p-2 flex gap-2">
                <div className="w-1/4 h-full bg-zinc-900 rounded-md border border-zinc-800" />
                <div className="flex-1 h-full flex flex-col gap-1.5 p-1 bg-zinc-900/60 rounded-md border border-zinc-800">
                  <div className="w-3/4 h-2 bg-indigo-500/40 rounded" />
                  <div className="w-1/2 h-2 bg-zinc-800 rounded" />
                  <div className="w-full h-3 bg-zinc-800/80 rounded" />
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                if (theme !== 'light') {
                  onSetTheme('light');
                }
              }}
              className={`p-5 rounded-3xl border text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                theme === 'light'
                  ? 'bg-white border-amber-500 shadow-xl ring-2 ring-amber-500/50'
                  : 'bg-slate-50 dark:bg-zinc-950/60 border-slate-200 dark:border-zinc-800 hover:border-slate-300 text-slate-700 dark:text-zinc-400'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-200 dark:border-amber-500/20">
                    <Sun className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Light Mode</h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                      High-contrast daytime workspace
                    </p>
                  </div>
                </div>
                {theme === 'light' && (
                  <span className="p-1 rounded-full bg-amber-500 text-slate-900">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>

              <div className="w-full h-16 rounded-xl bg-slate-100 border border-slate-200 p-2 flex gap-2">
                <div className="w-1/4 h-full bg-white rounded-md border border-slate-200" />
                <div className="flex-1 h-full flex flex-col gap-1.5 p-1 bg-white rounded-md border border-slate-200">
                  <div className="w-3/4 h-2 bg-amber-500/50 rounded" />
                  <div className="w-1/2 h-2 bg-slate-200 rounded" />
                  <div className="w-full h-3 bg-slate-100 rounded" />
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Model Selection */}
        <div className="bg-white dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-zinc-100">AI Copy Engine</h2>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-zinc-100">Gemini 2.0 Flash</h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">Google DeepMind — active model for all copy generation</p>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20 font-bold">Active</span>
          </div>
        </div>

        {/* Channels Integration */}
        <div className="bg-white dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Zap className="w-5 h-5 text-amber-500" />
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-zinc-100">Social Platform Publishing Integrations</h2>
            </div>
          </div>
          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 border-dashed flex flex-col items-center justify-center text-center gap-2">
            <Zap className="w-6 h-6 text-slate-400 dark:text-zinc-600" />
            <p className="text-sm font-bold text-slate-700 dark:text-zinc-400">Coming Soon</p>
            <p className="text-xs text-slate-500 dark:text-zinc-500 max-w-xs font-medium">Direct publishing to Instagram, LinkedIn, Facebook, and X will be available in a future release.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
