import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { FormFooter } from '@/components/ui/FormFooter';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/Callout';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { ownerService, type Company, type OwnerMember } from '@/services/ownerService';
import { useToast } from '@/context/ToastContext';

interface GiveAccessDialogProps {
  user: OwnerMember | null;
  companies: Company[];
  isOpen: boolean;
  presetCompanyId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const GiveAccessDialog: React.FC<GiveAccessDialogProps> = ({
  user,
  companies,
  isOpen,
  presetCompanyId,
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
      const granted = new Set(
        (user?.memberships || []).filter((m) => m.status === 'active').map((m) => m.company_id)
      );
      const preset =
        presetCompanyId && !granted.has(presetCompanyId) ? presetCompanyId : '';
      setSelectedCompanyId(preset);
      setRole('team_member');
      setError(null);
    }
  }, [isOpen, user, presetCompanyId]);

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
            <CustomSelect
              id={id}
              aria-label="Company"
              value={selectedCompanyId}
              onChange={(val) => {
                setSelectedCompanyId(val);
                setError(null);
              }}
              placeholder="Select a company…"
              options={companies
                .filter((c) => !grantedCompanyIds.has(c.id) && c.status !== 'suspended')
                .map((c) => ({ value: c.id, label: c.name }))}
            />
          )}
        </FormField>

        <FormField label="Role">
          {({ id }) => (
            <CustomSelect
              id={id}
              aria-label="Role"
              value={role}
              onChange={setRole}
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'hr', label: 'HR' },
                { value: 'operations', label: 'Operations' },
                { value: 'team_lead', label: 'Team lead' },
                { value: 'team_member', label: 'Team member' },
              ]}
            />
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
