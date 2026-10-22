import React, { useMemo, useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { FormFooter } from '@/components/ui/FormFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout } from '@/components/ui/Callout';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { StartingPasswordField } from './StartingPasswordField';
import { ownerService, type Company } from '@/services/ownerService';
import { useToast } from '@/context/ToastContext';
import { DEFAULT_TIMEZONE, getTimezoneOptions } from '@/utils/timezones';

export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface CreateCompanyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (company: Company) => void;
}

export const CreateCompanyDialog: React.FC<CreateCompanyDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isEditingSlug, setIsEditingSlug] = useState(false);
  const [hasManuallyEditedSlug, setHasManuallyEditedSlug] = useState(false);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setName('');
      setSlug('');
      setIsEditingSlug(false);
      setHasManuallyEditedSlug(false);
      setTimezone(DEFAULT_TIMEZONE);
      setAdminName('');
      setAdminEmail('');
      setAdminPassword('');
      setConfirmPassword('');
      setServerError(null);
      setClientErrors({});
    }
  }, [isOpen]);

  const passwordsMismatch = Boolean(adminPassword) && adminPassword !== confirmPassword;

  const handleNameChange = (val: string) => {
    setName(val);
    if (!hasManuallyEditedSlug) {
      setSlug(deriveSlug(val));
    }
    if (clientErrors.name) {
      setClientErrors((prev) => ({ ...prev, name: '' }));
    }
  };

  const handleSlugChange = (val: string) => {
    setHasManuallyEditedSlug(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    if (clientErrors.slug) {
      setClientErrors((prev) => ({ ...prev, slug: '' }));
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Company name is required';
    if (!slug.trim()) errs.slug = 'Short name is required';
    if (!adminName.trim()) errs.adminName = 'Admin full name is required';
    if (!adminEmail.trim()) {
      errs.adminEmail = 'Admin email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) {
      errs.adminEmail = 'Enter a valid email address';
    }
    if (!adminPassword) {
      errs.adminPassword = 'Starting password is required';
    } else if (adminPassword.length < 8) {
      errs.adminPassword = 'Starting password must be at least 8 characters';
    }
    if (adminPassword !== confirmPassword) {
      errs.confirmPassword = "Passwords don't match";
    }
    setClientErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const created = await ownerService.createCompany({
        name: name.trim(),
        slug: slug.trim(),
        timezone,
        accent_color: '#6847E0',
        admin_name: adminName.trim(),
        admin_email: adminEmail.trim(),
        admin_password: adminPassword,
        confirm_password: confirmPassword,
      });

      addToast(
        `${created.name} created`,
        `Share the email and starting password with ${adminName.trim()}.`,
        'success'
      );
      onClose();
      onSuccess(created);
    } catch (err: any) {
      const msg = err.message || err.detail || 'Failed to create company.';
      setServerError(msg);
      addToast("Couldn't create company", msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      title="New company"
      description="Creates the company and its first admin. Logo and colour can be set later from Branding."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="text-small font-semibold text-fg tracking-tight">Company</div>

          <FormField label="Company name" required error={clientErrors.name}>
            {({ id }) => (
              <div>
                <Input
                  id={id}
                  autoFocus
                  placeholder="Acme Corp"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  error={clientErrors.name}
                />
                <div className="mt-1.5 text-caption text-fg-muted flex items-center gap-1.5 flex-wrap">
                  <span>Short name for links:</span>
                  <code className="px-1.5 py-0.5 rounded bg-subtle text-fg font-mono text-micro">
                    {slug || 'company-slug'}
                  </code>
                  {!isEditingSlug ? (
                    <button
                      type="button"
                      onClick={() => setIsEditingSlug(true)}
                      className="text-accent hover:underline text-caption font-medium cursor-pointer"
                    >
                      · Change
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </FormField>

          {isEditingSlug && (
            <FormField
              label="Short name"
              required
              hint="Lowercase letters, numbers and hyphens only."
              error={clientErrors.slug}
            >
              {({ id }) => (
                <Input
                  id={id}
                  placeholder="acme-corp"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  error={clientErrors.slug}
                />
              )}
            </FormField>
          )}

          <FormField label="Time zone">
            {({ id }) => (
              <CustomSelect
                id={id}
                aria-label="Time zone"
                value={timezone}
                onChange={setTimezone}
                options={timezoneOptions}
                searchable
                searchPlaceholder="Search time zones"
                placeholder="Select time zone"
              />
            )}
          </FormField>
        </div>

        <div className="space-y-4 pt-2 border-t border-border">
          <div className="text-small font-semibold text-fg tracking-tight">First admin</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Full name" required error={clientErrors.adminName}>
              {({ id }) => (
                <Input
                  id={id}
                  placeholder="Jane Doe"
                  value={adminName}
                  onChange={(e) => {
                    setAdminName(e.target.value);
                    if (clientErrors.adminName) setClientErrors((p) => ({ ...p, adminName: '' }));
                  }}
                  error={clientErrors.adminName}
                />
              )}
            </FormField>

            <FormField label="Email" required error={clientErrors.adminEmail}>
              {({ id }) => (
                <Input
                  id={id}
                  type="email"
                  placeholder="jane@example.com"
                  value={adminEmail}
                  onChange={(e) => {
                    setAdminEmail(e.target.value);
                    if (clientErrors.adminEmail) setClientErrors((p) => ({ ...p, adminEmail: '' }));
                  }}
                  error={clientErrors.adminEmail}
                />
              )}
            </FormField>
          </div>

          <StartingPasswordField
            value={adminPassword}
            onChange={(pwd) => {
              setAdminPassword(pwd);
              if (clientErrors.adminPassword) setClientErrors((p) => ({ ...p, adminPassword: '' }));
              if (clientErrors.confirmPassword && pwd === confirmPassword) {
                setClientErrors((p) => ({ ...p, confirmPassword: '' }));
              }
            }}
            error={clientErrors.adminPassword}
            required
            helperText="At least 10 characters. Share it with the admin yourself. They can change it from Profile. You won't see it again after this."
          />

          <StartingPasswordField
            label="Confirm password"
            value={confirmPassword}
            onChange={(pwd) => {
              setConfirmPassword(pwd);
              if (clientErrors.confirmPassword) setClientErrors((p) => ({ ...p, confirmPassword: '' }));
            }}
            error={clientErrors.confirmPassword || (passwordsMismatch ? "Passwords don't match" : undefined)}
            required
            showGenerate={false}
            helperText=""
          />
        </div>

        {serverError && (
          <Callout variant="danger" title="Check the highlighted fields">
            {serverError}
          </Callout>
        )}

        <FormFooter className="-mx-5 -mb-5 sm:-mx-6 sm:-mb-6 rounded-b-lg">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            loadingText="Creating…"
            disabled={isSubmitting || passwordsMismatch || !confirmPassword}
          >
            Create company
          </Button>
        </FormFooter>
      </form>
    </Modal>
  );
};
