import React, { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  Trash2,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button, IconButton } from '../ui/button';
import { Callout } from '../ui/Callout';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { CustomSelect } from '../ui/CustomSelect';
import { MetaIcon, GoogleAdsIcon } from '../ui/brand-icons';
import type { Workspace } from '../../types';
import type { AdAccount } from '../../types/admin';
import { marketingService } from '../../services/marketingService';
import { useToast } from '../../context/ToastContext';

export interface AdAccountCredential {
  id: string;
  workspace_id?: string;
  workspace_name?: string;
  platform: string;
  account_id: string;
  status?: string;
  created_at?: string;
}

interface Props {
  isOpen: boolean;
  selectedWorkspace?: (Workspace | AdAccount) | null;
  workspaces?: (Workspace | AdAccount)[];
  onClose: () => void;
}

export const AdAccountCredentialsModal: React.FC<Props> = ({
  isOpen,
  selectedWorkspace,
  workspaces: _workspaces = [],
  onClose,
}) => {
  const { addToast } = useToast();
  const [credentials, setCredentials] = useState<AdAccountCredential[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [platform, setPlatform] = useState<'Meta' | 'Google'>('Meta');
  const [accountName, setAccountName] = useState(selectedWorkspace?.name || '');
  const [accountId, setAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [developerToken, setDeveloperToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Show/Hide Password States
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showDeveloperToken, setShowDeveloperToken] = useState(false);
  const [showRefreshToken, setShowRefreshToken] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);

  // Callout States
  const [verificationResult, setVerificationResult] = useState<{
    status: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadCredentials();
      setAccountName(selectedWorkspace?.name || '');
      setVerificationResult(null);
    }
  }, [isOpen, selectedWorkspace]);

  const loadCredentials = async () => {
    setIsLoading(true);
    try {
      const data = await marketingService.getCredentials('ALL');
      setCredentials(data || []);
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to fetch ad account credentials.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationResult(null);

    if (!accountName.trim()) {
      setVerificationResult({ status: 'error', message: 'Please enter an account name or client brand.' });
      return;
    }
    if (!accountId.trim()) {
      setVerificationResult({ status: 'error', message: 'Account ID is required.' });
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

      const successMsg = `${accountName.trim()} (${accountId}) authenticated successfully!`;
      setVerificationResult({ status: 'success', message: successMsg });
      addToast('Ad account connected', successMsg, 'success');

      // Reset form
      setAccountId('');
      setAccessToken('');
      setRefreshToken('');
      setDeveloperToken('');
      setClientId('');
      setClientSecret('');
      loadCredentials();
    } catch (err: any) {
      const errMsg = err.message || err.detail || 'Could not authenticate with live platform API.';
      setVerificationResult({ status: 'error', message: errMsg });
      addToast('Authentication failed', errMsg, 'error');
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
      addToast('Delete failed', err.message || 'Could not delete credential.', 'error');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent maxWidth="md" className="p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold">
            API credentials & verification
          </DialogTitle>
          <DialogDescription className="text-ui text-fg-muted mt-0.5">
            Configure secret tokens for Meta Graph API and Google Ads API sync.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-5 max-h-[calc(85vh-140px)] overflow-y-auto">
          {/* Verification Callout */}
          {verificationResult && (
            <Callout
              variant={verificationResult.status === 'success' ? 'success' : 'danger'}
              title={
                verificationResult.status === 'success'
                  ? 'Verification succeeded'
                  : 'API verification failed'
              }
            >
              {verificationResult.message}
            </Callout>
          )}

          {/* Existing Connected Credentials List */}
          {credentials.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-caption font-medium uppercase tracking-wider text-fg-muted">
                  Connected accounts ({credentials.length})
                </div>
                {isLoading && (
                  <div className="flex items-center gap-1.5 text-caption text-fg-muted">
                    <Loader2 className="w-3 h-3 animate-spin text-accent-text" />
                    <span>Loading...</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto border border-border rounded-lg p-2 bg-canvas">
                {credentials.map((cred) => (
                  <div
                    key={cred.id}
                    className="flex items-center justify-between p-2 rounded-md bg-surface border border-border text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {cred.platform === 'Meta' ? (
                        <MetaIcon size={14} variant="brand" className="shrink-0" />
                      ) : (
                        <GoogleAdsIcon size={14} variant="brand" className="shrink-0" />
                      )}
                      <span className="font-medium text-fg truncate">
                        {cred.workspace_name}
                      </span>
                      <span className="font-mono text-caption text-fg-muted">
                        ({cred.account_id})
                      </span>
                    </div>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      label="Delete credential"
                      icon={Trash2}
                      onClick={() => handleDelete(cred.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-ui font-medium text-fg mb-1">Platform</label>
                <CustomSelect
                  value={platform}
                  onChange={(val) => setPlatform(val as any)}
                  options={[
                    { value: 'Meta', label: 'Meta Ads', icon: MetaIcon },
                    { value: 'Google', label: 'Google Ads', icon: GoogleAdsIcon },
                  ]}
                />
              </div>

              <div>
                <label className="block text-ui font-medium text-fg mb-1">
                  Account name <span className="text-danger-fg">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Transfers"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full h-9 px-3 text-ui bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-ui font-medium text-fg mb-1">
                Account ID <span className="text-danger-fg">*</span>
              </label>
              <input
                type="text"
                required
                placeholder={platform === 'Meta' ? 'act_123456789' : '123-456-7890'}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full h-9 px-3 text-ui font-mono bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
              />
            </div>

            {platform === 'Meta' ? (
              <div>
                <label className="block text-ui font-medium text-fg mb-1">
                  User system access token
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showAccessToken ? 'text' : 'password'}
                    placeholder="EAAGm..."
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    className="w-full h-9 pl-3 pr-10 text-ui font-mono bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
                  />
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1"
                    label={showAccessToken ? 'Hide token' : 'Show token'}
                    icon={showAccessToken ? EyeOff : Eye}
                    onClick={() => setShowAccessToken(!showAccessToken)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-ui font-medium text-fg mb-1">Developer token</label>
                    <div className="relative flex items-center">
                      <input
                        type={showDeveloperToken ? 'text' : 'password'}
                        placeholder="Developer token"
                        value={developerToken}
                        onChange={(e) => setDeveloperToken(e.target.value)}
                        className="w-full h-9 pl-3 pr-10 text-ui font-mono bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
                      />
                      <IconButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1"
                        label={showDeveloperToken ? 'Hide token' : 'Show token'}
                        icon={showDeveloperToken ? EyeOff : Eye}
                        onClick={() => setShowDeveloperToken(!showDeveloperToken)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-ui font-medium text-fg mb-1">Refresh token</label>
                    <div className="relative flex items-center">
                      <input
                        type={showRefreshToken ? 'text' : 'password'}
                        placeholder="OAuth Refresh token"
                        value={refreshToken}
                        onChange={(e) => setRefreshToken(e.target.value)}
                        className="w-full h-9 pl-3 pr-10 text-ui font-mono bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
                      />
                      <IconButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1"
                        label={showRefreshToken ? 'Hide token' : 'Show token'}
                        icon={showRefreshToken ? EyeOff : Eye}
                        onClick={() => setShowRefreshToken(!showRefreshToken)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-ui font-medium text-fg mb-1">OAuth Client ID</label>
                    <input
                      type="text"
                      placeholder="OAuth Client ID"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full h-9 px-3 text-ui font-mono bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-ui font-medium text-fg mb-1">OAuth Client Secret</label>
                    <div className="relative flex items-center">
                      <input
                        type={showClientSecret ? 'text' : 'password'}
                        placeholder="Client secret"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        className="w-full h-9 pl-3 pr-10 text-ui font-mono bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
                      />
                      <IconButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1"
                        label={showClientSecret ? 'Hide secret' : 'Show secret'}
                        icon={showClientSecret ? EyeOff : Eye}
                        onClick={() => setShowClientSecret(!showClientSecret)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <ToggleSwitch
                checked={isActive}
                onChange={setIsActive}
                label="Automated metrics sync"
              />
            </div>
          </form>
        </div>

        <DialogFooter className="px-6 py-3.5 border-t border-border bg-canvas">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Verify & save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
