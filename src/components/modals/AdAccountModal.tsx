import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { CustomSelect } from '../ui/CustomSelect';
import type { AdAccount, CreateAdAccountPayload, UpdateAdAccountPayload } from '../../types/admin';
import type { Workspace } from '../../types';

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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (adAccountToEdit) {
        setName(adAccountToEdit.name || '');
        setPlatform((adAccountToEdit.platform as any) || 'Meta Ads');
        setAccountId(adAccountToEdit.account_id || '');
        setPixelId(adAccountToEdit.pixel_id || '');
        setWorkspaceId(adAccountToEdit.workspace_id || '');
        setCurrency(adAccountToEdit.currency || 'USD');
      } else {
        setName('');
        setPlatform('Meta Ads');
        setAccountId('');
        setPixelId('');
        setWorkspaceId(workspaces[0]?.id || '');
        setCurrency('USD');
      }
      setErrorMsg(null);
    }
  }, [isOpen, adAccountToEdit, workspaces]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Account name is required');
      return;
    }
    if (!accountId.trim()) {
      setErrorMsg('Account ID is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateAdAccountPayload | UpdateAdAccountPayload = {
        name: name.trim(),
        platform,
        account_id: accountId.trim(),
        pixel_id: pixelId.trim() || undefined,
        workspace_id: workspaceId || undefined,
        currency,
      };

      await onSave(payload, adAccountToEdit?.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save advertising account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const workspaceOptions = [
    { value: '', label: 'None (Global Agency Account)' },
    ...workspaces.map((w) => ({ value: w.id, label: w.name })),
  ];

  const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent maxWidth="md" className="p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold">
            {isEditMode ? 'Edit ad account' : 'Connect ad account'}
          </DialogTitle>
          <DialogDescription className="text-ui text-fg-muted mt-0.5">
            Link Meta Ads or Google Ads account identifiers to client workspaces.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(85vh-140px)] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 text-ui font-medium text-danger-fg bg-danger-bg border border-danger-bd rounded-md">
              {errorMsg}
            </div>
          )}

          {/* Account Name */}
          <div>
            <label className="block text-ui font-medium text-fg mb-1.5">
              Account name <span className="text-danger-fg">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Apex Transfers - Meta Main"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 text-ui bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
            />
          </div>

          {/* Platform & Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Platform <span className="text-danger-fg">*</span>
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as any)}
                className="w-full h-9 px-3 text-ui bg-surface border border-border rounded-md text-fg focus:outline-none focus:border-accent"
              >
                <option value="Meta Ads">Meta Ads</option>
                <option value="Google Ads">Google Ads</option>
              </select>
            </div>

            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Currency
              </label>
              <CustomSelect
                value={currency}
                onChange={setCurrency}
                options={currencyOptions}
              />
            </div>
          </div>

          {/* Account ID & Pixel ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Account ID <span className="text-danger-fg">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="act_123456789 or 123-456-7890"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full h-9 px-3 text-ui font-mono bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Tracking / Pixel ID <span className="text-fg-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 9876543210123"
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                className="w-full h-9 px-3 text-ui font-mono bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Workspace Assignment */}
          <div>
            <label className="block text-ui font-medium text-fg mb-1.5">
              Assigned client workspace
            </label>
            <CustomSelect
              value={workspaceId}
              onChange={setWorkspaceId}
              options={workspaceOptions}
              placeholder="Select client workspace"
            />
          </div>
        </form>

        <DialogFooter className="px-6 py-3.5 border-t border-border bg-canvas">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            {isEditMode ? 'Save changes' : 'Connect account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
