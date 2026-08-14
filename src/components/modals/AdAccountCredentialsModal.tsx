import React, { useState, useEffect, useRef } from 'react';
import type { Workspace } from '../../types';
import { marketingService } from '../../services/marketingService';
import { useToast } from '../../context/ToastContext';
import {
  KeyRound,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ChevronDown,
  Check,
  Building2,
  Layers,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedWorkspace: Workspace | null;
  workspaces: Workspace[];
}

export const AdAccountCredentialsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedWorkspace,
  workspaces,
}) => {
  const { addToast } = useToast();
  const [credentials, setCredentials] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Form State
  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string>('');
  const [platform, setPlatform] = useState<'Meta' | 'Google'>('Meta');
  const [accountId, setAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [developerToken, setDeveloperToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Custom Dropdowns State
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [isPlatformDropdownOpen, setIsPlatformDropdownOpen] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);
  const platformDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setIsAccountDropdownOpen(false);
      }
      if (platformDropdownRef.current && !platformDropdownRef.current.contains(e.target as Node)) {
        setIsPlatformDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedWorkspace) {
      setTargetWorkspaceId(selectedWorkspace.id);
    } else if (workspaces.length > 0) {
      setTargetWorkspaceId(workspaces[0].id);
    }
  }, [selectedWorkspace, workspaces]);

  const loadCredentials = async () => {
    if (!isOpen) return;
    setIsLoading(true);
    try {
      const data = await marketingService.getCredentials(targetWorkspaceId);
      setCredentials(data || []);

      // Pre-fill master Google Ads OAuth credentials if available in system
      if (!developerToken || !clientId) {
        const allCreds = await marketingService.getCredentials('ALL');
        const existingGoogle = allCreds.find((c: any) => c.platform === 'Google' && c.developer_token);
        if (existingGoogle) {
          setDeveloperToken(existingGoogle.developer_token || '');
          setRefreshToken(existingGoogle.refresh_token || '');
          setClientId(existingGoogle.client_id || '');
          setClientSecret(existingGoogle.client_secret || '');
        }
      }
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to fetch ad account credentials.', 'warning');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCredentials();
  }, [isOpen, targetWorkspaceId]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentSelectedAccount = workspaces.find((w) => w.id === targetWorkspaceId) || workspaces[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetWorkspaceId) {
      addToast('Validation Error', 'Please select an ad account.', 'warning');
      return;
    }
    if (!accountId.trim()) {
      addToast('Validation Error', 'Account ID is required.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await marketingService.saveCredential({
        workspace_id: targetWorkspaceId,
        platform,
        account_id: accountId.trim(),
        access_token: accessToken.trim(),
        refresh_token: refreshToken.trim(),
        developer_token: developerToken.trim(),
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        is_active: isActive,
      });

      addToast('Credential Saved ✅', `${platform} account (${accountId}) connected!`, 'success');
      // Reset form
      setAccountId('');
      setAccessToken('');
      setRefreshToken('');
      setDeveloperToken('');
      setClientId('');
      setClientSecret('');
      loadCredentials();
    } catch (err: any) {
      addToast('Save Failed', err.message || 'Could not save ad account credential.', 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (credId: string) => {
    try {
      await marketingService.deleteCredential(credId);
      addToast('Deleted', 'Ad account credential removed.', 'info');
      loadCredentials();
    } catch (err: any) {
      addToast('Delete Failed', err.message || 'Could not delete credential.', 'warning');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Ad Account Credentials & Sync</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Connect Meta & Google Ads accounts for automated live metrics syncing.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
          {/* Target Ad Account Selector Dropdown */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>Target Ad Account / Client Brand</span>
            </label>

            <div className="relative" ref={accountDropdownRef}>
              <button
                type="button"
                onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs cursor-pointer transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-lg text-[10px] font-bold text-white flex items-center justify-center shrink-0 ${
                      currentSelectedAccount?.brandColor || 'bg-indigo-600'
                    }`}
                  >
                    {currentSelectedAccount?.initials || 'AD'}
                  </div>
                  <span className="truncate">{currentSelectedAccount?.name || 'Select Account'}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isAccountDropdownOpen ? 'rotate-180 text-indigo-500' : ''}`} />
              </button>

              {isAccountDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-full bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 p-1.5 space-y-1 max-h-56 overflow-y-auto custom-scrollbar animate-scaleIn">
                  {workspaces.map((w) => {
                    const isSelected = w.id === targetWorkspaceId;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => {
                          setTargetWorkspaceId(w.id);
                          setIsAccountDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800/80'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-5 h-5 rounded text-[9px] font-bold text-white flex items-center justify-center shrink-0 ${
                              w.brandColor || 'bg-indigo-600'
                            }`}
                          >
                            {w.initials}
                          </div>
                          <span className="truncate">{w.name}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* List of existing credentials */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2 flex items-center justify-between">
              <span>Connected Credentials ({credentials.length})</span>
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />}
            </h3>

            {credentials.length === 0 && !isLoading ? (
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-center">
                <AlertCircle className="w-5 h-5 text-zinc-400 mx-auto mb-1" />
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">No ad accounts connected for this account profile yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {credentials.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800/80">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${c.platform === 'Meta' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'}`}>
                        {c.platform} Ads
                      </span>
                      <div>
                        <p className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100">{c.account_id}</p>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Active Sync Enabled
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                      title="Remove Credential"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

          {/* Add New Credential Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-500" /> Connect Ad Platform Account
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Platform Selector Dropdown */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Platform</span>
                </label>

                <div className="relative" ref={platformDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsPlatformDropdownOpen(!isPlatformDropdownOpen)}
                    className="w-full flex items-center justify-between px-3.5 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs cursor-pointer transition"
                  >
                    <span>{platform === 'Meta' ? 'Meta Ads (Facebook / Instagram)' : 'Google Ads'}</span>
                    <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isPlatformDropdownOpen ? 'rotate-180 text-indigo-500' : ''}`} />
                  </button>

                  {isPlatformDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-full bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 p-1.5 space-y-1 animate-scaleIn">
                      {[
                        { id: 'Meta' as const, label: 'Meta Ads (Facebook & Instagram)' },
                        { id: 'Google' as const, label: 'Google Ads (Search & Display)' },
                      ].map((p) => {
                        const isSelected = platform === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setPlatform(p.id);
                              setIsPlatformDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800/80'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <span>{p.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Account ID Input */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Account ID</label>
                <input
                  type="text"
                  placeholder={platform === 'Meta' ? 'act_1234567890' : '123-456-7890'}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono shadow-2xs transition"
                  required
                />
              </div>
            </div>

            {platform === 'Meta' ? (
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">User Access Token / System User Token</label>
                <input
                  type="password"
                  placeholder="EAABw..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono shadow-2xs transition"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Developer Token</label>
                    <input
                      type="text"
                      placeholder="Developer Token"
                      value={developerToken}
                      onChange={(e) => setDeveloperToken(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono shadow-2xs transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Refresh Token</label>
                    <input
                      type="password"
                      placeholder="OAuth Refresh Token"
                      value={refreshToken}
                      onChange={(e) => setRefreshToken(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono shadow-2xs transition"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Client ID</label>
                    <input
                      type="text"
                      placeholder="OAuth Client ID"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono shadow-2xs transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Client Secret</label>
                    <input
                      type="password"
                      placeholder="OAuth Client Secret"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono shadow-2xs transition"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Sync Toggle Switch and Solid Save Button */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer ${
                    isActive ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transform ring-0 transition duration-200 ease-in-out ${
                      isActive ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Enable Automated Syncing</span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 hover:shadow-md hover:shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50 select-none"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Save Ad Credential</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
