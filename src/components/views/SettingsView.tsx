import React, { useState } from 'react';
import type { Workspace, ThemeMode, PlatformType } from '../../types';
import { PlatformIcon } from '../../utils/platform';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
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
  const { addToast } = useToast();
  const { user } = useAuth();
  const [selectedModel, setSelectedModel] = useState('reamarc-custom');

  const channels: { name: string; platform: PlatformType; status: string }[] = [
    { name: 'Instagram Business', platform: 'Instagram', status: 'Connected as @nova_luxury' },
    { name: 'LinkedIn Company', platform: 'LinkedIn', status: 'Connected as TechFlow Inc.' },
    { name: 'Facebook Pages', platform: 'Facebook', status: 'Connected' },
    { name: 'X / Twitter Pro', platform: 'Twitter', status: 'Connected' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-y-auto select-none">
      <header className="h-16 border-b border-zinc-800/80 px-6 flex items-center justify-between bg-zinc-950/80 backdrop-blur-md shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-zinc-800 border border-zinc-700/60 text-zinc-300">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-100">Settings & Workspace Manager</h1>
            <p className="text-xs text-zinc-400">
              Manage user profile, workspaces, LLM engines, and social publishing channels.
            </p>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-8 max-w-4xl mx-auto w-full">
        {/* User Account Profile Info */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-zinc-100">Active User Profile</h2>
          </div>

          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg shadow-lg border border-zinc-700 uppercase">
                {user?.name ? user.name.slice(0, 2) : 'GU'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-zinc-100">{user?.name || 'Guest User'}</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck className="w-3 h-3" /> Authenticated
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">{user?.email || 'Not logged in'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Brand Workspaces Manager */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              <div>
                <h2 className="text-sm font-bold text-zinc-100">Brand Workspaces</h2>
                <p className="text-xs text-zinc-400">Multi-tenant client brand environments</p>
              </div>
            </div>
            <button
              onClick={onAddWorkspace}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Create Workspace
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between group hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl ${ws.brandColor} flex items-center justify-center text-zinc-950 font-bold text-sm shadow-md`}
                  >
                    {ws.initials}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-zinc-100">{ws.name}</h3>
                      {ws.isDefault && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-semibold border border-zinc-700">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400">{ws.industry || 'General B2B'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onEditWorkspace(ws)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    title="Edit Workspace"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {workspaces.length > 1 && (
                    <button
                      onClick={() => onDeleteWorkspace(ws.id)}
                      className="p-2 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete Workspace"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Appearance & Visual Theme Selection */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-zinc-100">Appearance & Visual Theme</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => {
                if (theme !== 'dark') {
                  onSetTheme('dark');
                }
              }}
              className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                theme === 'dark'
                  ? 'bg-zinc-900 border-indigo-500 shadow-xl ring-1 ring-indigo-500/50'
                  : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 text-zinc-400'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Moon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">Dark Mode</h3>
                    <p className="text-[11px] text-zinc-400">Low-glare deep aesthetic</p>
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
              className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                theme === 'light'
                  ? 'bg-white border-amber-500 shadow-xl ring-1 ring-amber-500/50'
                  : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 text-zinc-400'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <Sun className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold ${theme === 'light' ? 'text-zinc-900' : 'text-zinc-100'}`}>
                      Light Mode
                    </h3>
                    <p className={`text-[11px] ${theme === 'light' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      High-contrast daytime workspace
                    </p>
                  </div>
                </div>
                {theme === 'light' && (
                  <span className="p-1 rounded-full bg-amber-500 text-zinc-900">
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
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-zinc-100">Default Copy LLM Model</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'reamarc-custom', name: 'Reamarc Copy-V3 (Fine-Tuned)', desc: 'Best for high-converting social hooks' },
              { id: 'claude-sonnet', name: 'Claude 3.5 Sonnet', desc: 'Superior nuanced brand storytelling' },
              { id: 'gpt4o', name: 'GPT-4o Omnimodal', desc: 'Fast multi-lingual copy execution' },
            ].map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  setSelectedModel(model.id);
                  addToast('Model Updated', `Switched LLM engine to ${model.name}`, 'info');
                }}
                className={`p-4 rounded-xl border text-left transition-all ${
                  selectedModel === model.id
                    ? 'bg-indigo-600/10 border-indigo-500/80 text-zinc-100 shadow-md'
                    : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200">{model.name}</span>
                  {selectedModel === model.id && <Check className="w-4 h-4 text-indigo-400" />}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">{model.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Channels Integration */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <h2 className="text-sm font-bold text-zinc-100">Social Platform Publishing Integrations</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {channels.map((chan) => (
              <div
                key={chan.name}
                className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                    <PlatformIcon platform={chan.platform} className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200">{chan.name}</h4>
                    <p className="text-[11px] text-emerald-400 font-medium">{chan.status}</p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
