import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { FormFooter } from '@/components/ui/FormFooter';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/Callout';
import { StartingPasswordField } from './StartingPasswordField';
import { ownerService, type OwnerMember } from '@/services/ownerService';
import { useToast } from '@/context/ToastContext';

interface SetStartingPasswordDialogProps {
  user: OwnerMember | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SetStartingPasswordDialog: React.FC<SetStartingPasswordDialogProps> = ({
  user,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
    }
  }, [isOpen]);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Starting password is required');
      return;
    }
    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await ownerService.setStartingPassword(user.id, password);
      addToast(`Starting password set for ${user.name}`, undefined, 'success');
      onClose();
      onSuccess();
    } catch (err: any) {
      const msg = err.message || err.detail || 'Failed to set starting password.';
      setError(msg);
      addToast("Couldn't set starting password", msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title="Set starting password"
      description={`For ${user.name} · ${user.email}`}
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <StartingPasswordField
          value={password}
          onChange={(val) => {
            setPassword(val);
            if (error) setError(null);
          }}
          error={error || undefined}
          required
          helperText="At least 10 characters. Share it with them yourself; they can change it from Profile."
        />

        <Callout variant="warning">
          This signs them out on every device and in every company they belong to.
        </Callout>

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
            disabled={isSubmitting || !password || password.length < 10}
            loading={isSubmitting}
            loadingText="Setting password…"
          >
            Set password
          </Button>
        </FormFooter>
      </form>
    </Modal>
  );
};
