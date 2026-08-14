import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  selectedWorkspace?: Workspace | null;
  workspaces?: Workspace[];
}

export const AdAccountCredentialsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedWorkspace,
}) => {
  const { addToast } = useToast();
  const [credentials, setCredentials] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Form State - strictly clean and empty by default
  const [accountName, setAccountName] = useState<string>('');
  const [platform, setPlatform] = useState<'Meta' | 'Google'>('Meta');
  const [accountId, setAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [developerToken, setDeveloperToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Platform Dropdown State
  const [isPlatformDropdownOpen, setIsPlatformDropdownOpen] = useState(false);
  const platformDropdownRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when modal is open and restore on close
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (platformDropdownRef.current && !platformDropdownRef.current.contains(e.target as Node)) {
        setIsPlatformDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset all form inputs to clean empty state on modal open/close
  useEffect(() => {
    if (isOpen) {
      if (selectedWorkspace && selectedWorkspace.name && selectedWorkspace.id !== 'ALL' && selectedWorkspace.id !== 'all') {
        setAccountName(selectedWorkspace.name);
      } else {
        setAccountName('');
      }
      setAccountId('');
      setAccessToken('');
      setRefreshToken('');
      setDeveloperToken('');
      setClientId('');
      setClientSecret('');
      setIsActive(true);
      setPlatform('Meta');
      loadCredentials();
    }
  }, [isOpen, selectedWorkspace]);

  const loadCredentials = async () => {
    if (!isOpen) return;
    setIsLoading(true);
    try {
      const data = await marketingService.getCredentials('ALL');
      setCredentials(data || []);
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to fetch ad account credentials.', 'warning');
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim()) {
      addToast('Validation Error', 'Please enter an Ad Account / Client Brand name.', 'warning');
      return;
    }
    if (!accountId.trim()) {
      addToast('Validation Error', 'Account ID is required.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await marketingService.saveCredential({
        workspace_name: accountName.trim(),
        platform,
        account_id: accountId.trim(),
        access_token: accessToken.trim(),
        refresh_token: refreshToken.trim(),
        developer_token: developerToken.trim(),
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        is_active: isActive,
      });

      addToast('Credential Saved ✅', `${accountName.trim()} - ${platform} Ads account (${accountId}) connected!`, 'success');
      // Reset form fields
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

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center w-screen h-screen bg-black/60 backdrop-blur-xs animate-fadeIn p-4 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Connect Ad Account & Credentials</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Connect client ad accounts for automated daily performance tracking</p>
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
        <div className="space-y-5">
          {/* List of existing credentials */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2 flex items-center justify-between">
              <span>Connected Ad Accounts ({credentials.length})</span>
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />}
            </h3>

            {credentials.length === 0 && !isLoading ? (
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-center">
                <AlertCircle className="w-5 h-5 text-zinc-400 mx-auto mb-1" />
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">No ad accounts connected yet. Add your first credential below.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                {credentials.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800/80">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${c.platform === 'Meta' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'}`}>
                        {c.platform} Ads
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                            {c.workspace_name || 'Ad Account'}
                          </p>
                          <span className="text-[11px] font-mono text-zinc-400">({c.account_id})</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Active Sync Enabled
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer shrink-0 ml-2"
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
              <Plus className="w-4 h-4 text-indigo-500" /> Connect New Ad Account
            </h3>

            {/* Ad Account / Client Brand Name Input - Pure Text Field without Datalist/Arrow */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>Ad Account / Client Brand Name</span>
              </label>
              <input
                type="text"
                placeholder="Enter client or brand name (e.g. Apex Transfer)"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 placeholder:font-normal focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none shadow-2xs transition"
                required
                autoComplete="off"
              />
            </div>

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
                    className="w-full flex items-center justify-between px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${platform === 'Meta' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                      <span>{platform === 'Meta' ? 'Meta Ads' : 'Google Ads'}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isPlatformDropdownOpen ? 'rotate-180 text-indigo-500' : ''}`} />
                  </button>

                  {isPlatformDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-full bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 p-1.5 space-y-1 animate-scaleIn">
                      {[
                        { id: 'Meta' as const, label: 'Meta Ads', color: 'bg-blue-500' },
                        { id: 'Google' as const, label: 'Google Ads', color: 'bg-emerald-500' },
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
                            className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${p.color}`} />
                              <span>{p.label}</span>
                            </div>
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
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono shadow-2xs transition"
                  required
                  autoComplete="off"
                />
              </div>
            </div>

            {platform === 'Meta' ? (
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">User Access Token / System User Token</label>
                <input
                  type="password"
                  placeholder="Enter Meta User / System Access Token (EAABw...)"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono shadow-2xs transition"
                  autoComplete="new-password"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Developer Token</label>
                    <input
                      type="text"
                      placeholder="Enter Google Ads Developer Token"
                      value={developerToken}
                      onChange={(e) => setDeveloperToken(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono shadow-2xs transition"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Refresh Token</label>
                    <input
                      type="password"
                      placeholder="Enter OAuth Refresh Token"
                      value={refreshToken}
                      onChange={(e) => setRefreshToken(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono shadow-2xs transition"
                      autoComplete="new-password"
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
                      autoComplete="off"
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
                      autoComplete="new-password"
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 hover:shadow-md hover:shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50 select-none"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Save Ad Credential</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};
