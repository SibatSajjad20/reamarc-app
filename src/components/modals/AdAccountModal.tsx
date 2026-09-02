import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Briefcase,
  Layers,
  KeyRound,
  Coins,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import type { AdAccount, CreateAdAccountPayload, UpdateAdAccountPayload } from '../../types/admin';
import type { Workspace } from '../../types';
import { marketingService } from '../../services/marketingService';

interface AdAccountModalProps {
  isOpen: boolean;
  adAccountToEdit?: AdAccount | null;
  workspaces: Workspace[];
  onClose: () => void;
  onSave: (payload: CreateAdAccountPayload | UpdateAdAccountPayload, accountId?: string) => Promise<void>;
}

const CURRENCIES = ['USD', 'PKR', 'AED', 'EUR', 'GBP', 'CAD', 'AUD'];

export const AdAccountModal: React.FC<AdAccountModalProps> = ({
  isOpen,
  adAccountToEdit,
  workspaces,
  onClose,
  onSave,
}) => {
  const isEditMode = Boolean(adAccountToEdit);

  // Form Fields
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<'Meta Ads' | 'Google Ads'>('Meta Ads');
  const [accountId, setAccountId] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [currency, setCurrency] = useState('USD');

  // Meta Credentials
  const [accessToken, setAccessToken] = useState('');

  // Google Credentials
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [developerToken, setDeveloperToken] = useState('');

  const [isLoadingCreds, setIsLoadingCreds] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Lock body scroll
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

  // Load existing data / credentials
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      if (adAccountToEdit) {
        setName(adAccountToEdit.name || '');
        const p = (adAccountToEdit.platform || '').toLowerCase();
        setPlatform(p.includes('google') && !p.includes('meta') ? 'Google Ads' : 'Meta Ads');
        setAccountId(adAccountToEdit.account_id || '');
        setPixelId(adAccountToEdit.pixel_id || '');
        setWorkspaceId(adAccountToEdit.workspace_id || '');
        setCurrency(adAccountToEdit.currency || 'USD');

        // Fetch existing credentials
        setIsLoadingCreds(true);
        marketingService
          .getCredentials('ALL')
          .then((creds) => {
            if (Array.isArray(creds)) {
              const matched = creds.find(
                (c: any) =>
                  c.account_id === adAccountToEdit.account_id ||
                  c.workspace_id === adAccountToEdit.id ||
                  c.workspace_id === adAccountToEdit.workspace_id
              );
              if (matched) {
                setAccessToken(matched.access_token || '');
                setClientId(matched.client_id || '');
                setClientSecret(matched.client_secret || '');
                setRefreshToken(matched.refresh_token || '');
                setDeveloperToken(matched.developer_token || '');
              }
            }
          })
          .catch(() => {})
          .finally(() => setIsLoadingCreds(false));
      } else {
        setName('');
        setPlatform('Meta Ads');
        setAccountId('');
        setPixelId('');
        setWorkspaceId('');
        setCurrency('USD');
        setAccessToken('');
        setClientId('');
        setClientSecret('');
        setRefreshToken('');
        setDeveloperToken('');
        setIsLoadingCreds(false);
      }
    }
  }, [isOpen, adAccountToEdit]);

  if (!isOpen) return null;

  const workspaceOptions = [
    { value: '', label: 'None (Standalone Ad Account)' },
    ...workspaces.map((w) => ({
      value: w.id,
      label: w.name,
    })),
  ];

  const currencyOptions = CURRENCIES.map((c) => ({
    value: c,
    label: c,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Ad account name is required.');
      return;
    }
    if (!accountId.trim()) {
      setErrorMsg('Account ID / Customer ID is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateAdAccountPayload = {
        name: name.trim(),
        platform,
        account_id: accountId.trim(),
        pixel_id: pixelId.trim() || undefined,
        workspace_id: workspaceId.trim() || undefined,
        currency,
        access_token: platform === 'Meta Ads' ? accessToken.trim() : undefined,
        client_id: platform === 'Google Ads' ? clientId.trim() : undefined,
        client_secret: platform === 'Google Ads' ? clientSecret.trim() : undefined,
        refresh_token: platform === 'Google Ads' ? refreshToken.trim() : undefined,
        developer_token: platform === 'Google Ads' ? developerToken.trim() : undefined,
      };

      await onSave(payload, adAccountToEdit?.id);
      onClose();
    } catch (err: any) {
      console.error('Failed to save ad account:', err);
      setErrorMsg(err.message || 'Failed to save ad account.');
    } finally {
      setIsSubmitting(false);
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
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto custom-scrollbar bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {isEditMode ? 'Edit Ad Account & Credentials' : 'Connect Ad Account & Credentials'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Configure advertising platform API credentials and account mapping
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Platform Switcher (Meta Ads vs Google Ads) */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Advertising Platform
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <button
                type="button"
                onClick={() => setPlatform('Meta Ads')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  platform === 'Meta Ads'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black">
                  M
                </div>
                <span>Meta Ads (Facebook & IG)</span>
              </button>

              <button
                type="button"
                onClick={() => setPlatform('Google Ads')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  platform === 'Google Ads'
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/20'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black">
                  G
                </div>
                <span>Google Ads</span>
              </button>
            </div>
          </div>

          {/* Account Name */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
              <span>Ad Account Name <span className="text-rose-500">*</span></span>
            </label>
            <input
              type="text"
              placeholder={platform === 'Meta Ads' ? 'e.g. Perkasa Flight School, Valencia Heights' : 'e.g. ED&C Google Ads, Apex PPC'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
              required
              autoComplete="off"
            />
          </div>

          {/* Account ID / Customer ID */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                {platform === 'Meta Ads' ? 'Meta Account ID (act_...)' : 'Google Customer ID (XXX-XXX-XXXX)'}{' '}
                <span className="text-rose-500">*</span>
              </span>
            </label>
            <input
              type="text"
              placeholder={platform === 'Meta Ads' ? 'act_25031283349870704' : '172-373-8317'}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2.5 text-xs font-numeric font-bold text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
              required
              autoComplete="off"
            />
          </div>

          {/* Platform Specific Credential Fields */}
          {platform === 'Meta Ads' ? (
            <div className="space-y-3 p-4 rounded-2xl bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-300">
                  <ShieldCheck className="w-4 h-4 text-blue-500" />
                  <span>Meta Marketing API Credentials</span>
                </div>
                {isLoadingCreds && (
                  <div className="flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Loading keys...</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  System User Access Token
                </label>
                <input
                  type="password"
                  placeholder="EAABw..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3 py-2 text-xs font-numeric text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Pixel ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 182736492018273"
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3 py-2 text-xs font-numeric text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                  autoComplete="off"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-4 rounded-2xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>Google Ads API Credentials</span>
                </div>
                {isLoadingCreds && (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Loading keys...</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Client ID
                  </label>
                  <input
                    type="text"
                    placeholder="xxxx.apps.googleusercontent.com"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-3 py-2 text-xs font-numeric text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Client Secret
                  </label>
                  <input
                    type="password"
                    placeholder="GOCSPX-xxxx"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-3 py-2 text-xs font-numeric text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Refresh Token
                  </label>
                  <input
                    type="password"
                    placeholder="1//04xxxx"
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-3 py-2 text-xs font-numeric text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Developer Token
                  </label>
                  <input
                    type="password"
                    placeholder="xxxx_Developer_Token"
                    value={developerToken}
                    onChange={(e) => setDeveloperToken(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-3 py-2 text-xs font-numeric text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Associated Workspace & Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>Associated Workspace</span>
              </label>
              <CustomSelect
                value={workspaceId}
                onChange={setWorkspaceId}
                options={workspaceOptions}
                icon={Building2}
                placeholder="Assign workspace..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-indigo-500" />
                <span>Account Currency</span>
              </label>
              <CustomSelect
                value={currency}
                onChange={setCurrency}
                options={currencyOptions}
                icon={Coins}
                placeholder="Currency"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 select-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isEditMode ? 'Save Ad Account' : 'Connect Ad Account'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

