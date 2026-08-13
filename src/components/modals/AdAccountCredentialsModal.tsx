import React, { useState, useEffect } from 'react';
import type { Workspace } from '../../types';
import { marketingService } from '../../services/marketingService';
import { useToast } from '../../context/ToastContext';
import { KeyRound, X, Plus, Trash2, CheckCircle2, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';

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

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetWorkspaceId) {
      addToast('Validation Error', 'Please select a workspace.', 'warning');
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
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Ad Account Credentials</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Connect Meta & Google Ads accounts for automated daily data syncing.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Workspace selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Target Workspace</label>
            <select
              value={targetWorkspaceId}
              onChange={(e) => setTargetWorkspaceId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:outline-none"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* List of existing credentials */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center justify-between">
              <span>Connected Accounts ({credentials.length})</span>
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />}
            </h3>

            {credentials.length === 0 && !isLoading ? (
              <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center">
                <AlertCircle className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">No ad accounts connected for this workspace yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {credentials.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${c.platform === 'Meta' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'}`}>
                        {c.platform}
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{c.account_id}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Active Sync Enabled
                        </p>
                      </div>
                    </div>

                    <button onClick={() => handleDelete(c.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* Add New Credential Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-orange-500" /> Connect New Ad Account
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Platform</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                >
                  <option value="Meta">Meta (Facebook / Instagram)</option>
                  <option value="Google">Google Ads</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Account ID</label>
                <input
                  type="text"
                  placeholder={platform === 'Meta' ? 'act_1234567890' : '123-456-7890'}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:outline-none font-mono"
                  required
                />
              </div>
            </div>

            {platform === 'Meta' ? (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">User Access Token / System User Token</label>
                <input
                  type="password"
                  placeholder="EAABw..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:outline-none font-mono"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Developer Token</label>
                    <input
                      type="text"
                      placeholder="Developer Token"
                      value={developerToken}
                      onChange={(e) => setDeveloperToken(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Refresh Token</label>
                    <input
                      type="password"
                      placeholder="1//04..."
                      value={refreshToken}
                      onChange={(e) => setRefreshToken(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Client ID</label>
                    <input
                      type="text"
                      placeholder="OAuth Client ID"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Client Secret</label>
                    <input
                      type="password"
                      placeholder="OAuth Client Secret"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500 bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Enable Automated Syncing</span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-400 hover:to-rose-500 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50"
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
