import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { FormFooter } from '@/components/ui/FormFooter';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/Callout';
import { ownerService, type Company, type OwnerMember } from '@/services/ownerService';
import { useToast } from '@/context/ToastContext';

interface GiveAccessDialogProps {
  user: OwnerMember | null;
  companies: Company[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const GiveAccessDialog: React.FC<GiveAccessDialogProps> = ({
  user,
  companies,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [role, setRole] = useState('team_member');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing active company IDs for this member
  const grantedCompanyIds = new Set(
    (user?.memberships || [])
      .filter((m) => m.status === 'active')
      .map((m) => m.company_id)
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedCompanyId('');
      setRole('team_member');
      setError(null);
    }
  }, [isOpen, user]);

  if (!user) return null;

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId) {
      setError('Please select a company.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await ownerService.grantCompanyAccess(user.id, selectedCompanyId, role);
      const compName = selectedCompany?.name || 'the company';

      if (res.note === 'already has access') {
        addToast(`${user.name} already has access to ${compName}`, undefined, 'info');
      } else {
        addToast(
          'Access given',
          `${user.name} can now open ${compName}. Its admin will finish their setup.`,
          'success'
        );
      }
      onClose();
      onSuccess();
    } catch (err: any) {
      const msg = err.message || err.detail || 'Failed to give access.';
      setError(msg);
      addToast("Couldn't give access", msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title={`Give ${user.name} access`}
      description={user.email}
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Company" required error={error}>
          {({ id }) => (
            <select
              id={id}
              value={selectedCompanyId}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value);
                setError(null);
              }}
              className="w-full h-9 px-3 rounded-md border border-border-strong bg-surface text-fg text-ui outline-none hover:border-fg-faint focus:border-ring-border focus:shadow-[0_0_0_3px_var(--ring)] transition-colors"
            >
              <option value="">Select a company…</option>
              {companies
                .filter((c) => !grantedCompanyIds.has(c.id))
                .map((c) => {
                const isPaused = c.status === 'suspended';
                const suffix = isPaused ? ' (Paused)' : '';

                return (
                  <option key={c.id} value={c.id} disabled={isPaused}>
                    {c.name}
                    {suffix}
                  </option>
                );
              })}
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
              className="w-full h-9 px-3 rounded-md border border-border-strong bg-surface text-fg text-ui outline-none hover:border-fg-faint focus:border-ring-border focus:shadow-[0_0_0_3px_var(--ring)] transition-colors"
            >
              <option value="admin">Admin</option>
              <option value="hr">HR</option>
              <option value="operations">Operations</option>
              <option value="team_lead">Team lead</option>
              <option value="team_member">Team member</option>
            </select>
          )}
        </FormField>

        {selectedCompany && (
          <Callout variant="info">
            {role === 'admin' ? (
              <>
                They'll be Admin of {selectedCompany.name} straight away.
              </>
            ) : (
              <>
                {selectedCompany.name}'s admin sets their role, department and modules. Until then they show as{' '}
                <strong className="font-semibold">Needs setup</strong> and can only see their profile.
              </>
            )}
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
            disabled={!selectedCompanyId || isSubmitting}
            loading={isSubmitting}
            loadingText="Giving access…"
          >
            Give access
          </Button>
        </FormFooter>
      </form>
    </Modal>
  );
};
