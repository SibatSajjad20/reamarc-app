import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
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
import { MetaIcon, GoogleAdsIcon } from '../ui/brand-icons';
import type { AdAccount, CreateAdAccountPayload, UpdateAdAccountPayload } from '../../types/admin';
import type { Workspace } from '../../types';
import { focusFirstError } from '../../utils/formFocus';
import { FormErrorSummaryButton } from '../../hooks/useFormValidation';

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
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

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
      setFieldErrors({});
      setServerError(null);
      setHasSubmitted(false);
    }
  }, [isOpen, adAccountToEdit, workspaces]);

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!name.trim()) {
      errs.name = 'Account name is required';
    }
    if (!accountId.trim()) {
      errs.accountId = 'Account ID is required';
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);
    setServerError(null);

    const errs = validate();
    setFieldErrors(errs);

    if (Object.keys(errs).length > 0) {
      setTimeout(() => {
        if (formRef.current) focusFirstError(formRef.current);
      }, 50);
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
      setServerError(err.message || 'Failed to save advertising account');
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

        <form ref={formRef} onSubmit={handleSubmit} noValidate className="p-6 space-y-4 max-h-[calc(85vh-140px)] overflow-y-auto">
          {/* Account Name */}
          <div>
            <label className="block text-ui font-medium text-fg mb-1.5">
              Account name <span className="text-danger-fg">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Apex Transfers - Meta Main"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (hasSubmitted && e.target.value.trim()) {
                  setFieldErrors((prev) => { const n = { ...prev }; delete n.name; return n; });
                }
              }}
              aria-invalid={!!fieldErrors.name}
              className={`w-full h-9 px-3 text-ui bg-surface border rounded-md text-fg placeholder:text-fg-faint focus:outline-none ${
                fieldErrors.name ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border focus:border-accent'
              }`}
            />
            {fieldErrors.name && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-status-danger-fg" role="alert">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{fieldErrors.name}</span>
              </div>
            )}
          </div>

          {/* Platform & Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Platform <span className="text-danger-fg">*</span>
              </label>
              <CustomSelect
                name="platform"
                value={platform}
                onChange={(val) => setPlatform(val as any)}
                options={[
                  { value: 'Meta Ads', label: 'Meta Ads', icon: MetaIcon },
                  { value: 'Google Ads', label: 'Google Ads', icon: GoogleAdsIcon },
                ]}
              />
            </div>

            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Currency
              </label>
              <CustomSelect
                name="currency"
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
                name="accountId"
                required
                placeholder="act_123456789 or 123-456-7890"
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  if (hasSubmitted && e.target.value.trim()) {
                    setFieldErrors((prev) => { const n = { ...prev }; delete n.accountId; return n; });
                  }
                }}
                aria-invalid={!!fieldErrors.accountId}
                className={`w-full h-9 px-3 text-ui font-mono bg-surface border rounded-md text-fg placeholder:text-fg-faint focus:outline-none ${
                  fieldErrors.accountId ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border focus:border-accent'
                }`}
              />
              {fieldErrors.accountId && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-status-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{fieldErrors.accountId}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Tracking / Pixel ID <span className="text-fg-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                name="pixelId"
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
              name="workspaceId"
              value={workspaceId}
              onChange={setWorkspaceId}
              options={workspaceOptions}
              placeholder="Select client workspace"
            />
          </div>
        </form>

        <DialogFooter className="px-6 py-3.5 border-t border-border bg-canvas flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FormErrorSummaryButton
              count={Object.keys(fieldErrors).length}
              onClick={() => {
                if (formRef.current) focusFirstError(formRef.current);
              }}
            />
            {serverError && (
              <div className="flex items-center gap-1.5 text-xs text-status-danger-fg" role="alert">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
