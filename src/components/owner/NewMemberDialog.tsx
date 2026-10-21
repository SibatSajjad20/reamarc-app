import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { FormFooter } from '@/components/ui/FormFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout } from '@/components/ui/Callout';
import { StartingPasswordField } from './StartingPasswordField';
import { ownerService, type Company } from '@/services/ownerService';
import { useToast } from '@/context/ToastContext';

interface NewMemberDialogProps {
  companies: Company[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: { userId: string; companyId: string }) => void;
}

export const NewMemberDialog: React.FC<NewMemberDialogProps> = ({
  companies,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [role, setRole] = useState('team_member');
  const [password, setPassword] = useState('');

  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active companies only
  const activeCompanies = companies.filter((c) => c.status !== 'suspended');

  useEffect(() => {
    if (isOpen) {
      setFullName('');
      setEmail('');
      setPhone('');
      setCompanyId(activeCompanies[0]?.id || '');
      setRole('team_member');
      setPassword('');
      setClientErrors({});
      setServerError(null);
    }
  }, [isOpen]);

  const selectedCompany = activeCompanies.find((c) => c.id === companyId);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = 'Full name is required';
    if (!email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Enter a valid email address';
    }
    if (!companyId) errs.companyId = 'Company is required';
    if (!password) {
      errs.password = 'Starting password is required';
    } else if (password.length < 8) {
      errs.password = 'Starting password must be at least 8 characters';
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
      const res = await ownerService.provisionMember({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        company_id: companyId,
        role,
        temporary_password: password,
      });

      const compName = selectedCompany?.name || 'the company';
      addToast(`${fullName.trim()} added to ${compName}`, undefined, 'success');
      onClose();
      onSuccess({ userId: res.user_id, companyId });
    } catch (err: any) {
      const msg = err.message || err.detail || 'Failed to create member.';
      setServerError(msg);
      addToast("Couldn't add member", msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title="New member"
      description="Creates a login and gives it access to one company."
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Full name" required error={clientErrors.fullName}>
            {({ id }) => (
              <Input
                id={id}
                autoFocus
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (clientErrors.fullName) setClientErrors((p) => ({ ...p, fullName: '' }));
                }}
                error={clientErrors.fullName}
              />
            )}
          </FormField>

          <FormField label="Email" required error={clientErrors.email}>
            {({ id }) => (
              <Input
                id={id}
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (clientErrors.email) setClientErrors((p) => ({ ...p, email: '' }));
                }}
                error={clientErrors.email}
              />
            )}
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Company" required error={clientErrors.companyId}>
            {({ id }) => (
              <select
                id={id}
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  if (clientErrors.companyId) setClientErrors((p) => ({ ...p, companyId: '' }));
                }}
                className="w-full h-9 px-3 rounded-md border border-border-strong bg-surface text-fg text-ui outline-none"
              >
                <option value="">Select company…</option>
                {activeCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="Role">
            {({ id }) => (
              <select
                id={id}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                aria-label="Role"
                className="w-full h-9 px-3 rounded-md border border-border-strong bg-surface text-fg text-ui outline-none"
              >
                <option value="admin">Admin</option>
                <option value="hr">HR</option>
                <option value="operations">Operations</option>
                <option value="team_lead">Team lead</option>
                <option value="team_member">Team member</option>
              </select>
            )}
          </FormField>

          <FormField label="Phone" hint="Optional">
            {({ id }) => (
              <Input
                id={id}
                placeholder="+92 300 1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            )}
          </FormField>
        </div>

        <StartingPasswordField
          value={password}
          onChange={(val) => {
            setPassword(val);
            if (clientErrors.password) setClientErrors((p) => ({ ...p, password: '' }));
          }}
          error={clientErrors.password}
          required
          helperText="At least 10 characters. Share it with them yourself; they can change it from Profile."
        />

        {selectedCompany && (
          <Callout variant="neutral">
            {role === 'admin' ? (
              <>They'll be Admin of {selectedCompany.name} straight away.</>
            ) : (
              <>
                {selectedCompany.name}'s admin sets their role, department and modules. They start as{' '}
                <strong className="font-semibold text-fg">Needs setup</strong>.
              </>
            )}
          </Callout>
        )}

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
            loadingText="Creating member…"
          >
            Create member
          </Button>
        </FormFooter>
      </form>
    </Modal>
  );
};
