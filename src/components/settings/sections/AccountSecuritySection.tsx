import React, { useState, useMemo } from 'react';
import { authService } from '@/services/authService';
import { useToast } from '@/context/ToastContext';
import { Input } from '@/components/ui/input';
import { SettingsCard } from '../SettingsCard';
import { StickySaveBar } from '../StickySaveBar';
import { cn } from '@/lib/utils';

function passwordStrength(password: string): { score: number; label: string; bar: string } {
  if (!password) return { score: 0, label: '', bar: 'bg-border' };
  let score = 0;
  if (password.length >= 6) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (score <= 1) return { score, label: 'Weak', bar: 'bg-danger-dot' };
  if (score === 2) return { score, label: 'Fair', bar: 'bg-warning-dot' };
  return { score, label: 'Strong', bar: 'bg-success-dot' };
}

export const AccountSecuritySection: React.FC = () => {
  const { addToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);

  const isDirty = useMemo(() => {
    return Boolean(currentPassword || newPassword || confirmPassword);
  }, [currentPassword, newPassword, confirmPassword]);

  const handleDiscard = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMessage(null);
  };

  const handleSave = async () => {
    setErrorMessage(null);
    if (!currentPassword) {
      setErrorMessage('Please enter your current password.');
      return;
    }
    if (!newPassword) {
      setErrorMessage('Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('New passwords do not match.');
      return;
    }

    setIsSaving(true);
    try {
      await authService.updateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });
      addToast('Password updated', 'Your password has been changed successfully.', 'success');
      handleDiscard();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Could not update password';
      setErrorMessage(msg);
      addToast('Update failed', msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Change password"
        description="Ensure your account is using a secure, unique password with at least 6 characters."
      >
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-medium text-fg mb-1.5">
              Current password
            </label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-fg mb-1.5">
              New password
            </label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
            {newPassword && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3].map((step) => (
                    <div
                      key={step}
                      className={cn(
                        'h-1 flex-1 rounded-full transition-colors',
                        strength.score >= step ? strength.bar : 'bg-border'
                      )}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-micro text-fg-muted">
                  <span>Strength: {strength.label}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-fg mb-1.5">
              Confirm new password
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
            />
          </div>
        </div>
      </SettingsCard>

      <StickySaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onDiscard={handleDiscard}
        onSave={handleSave}
        saveLabel="Update password"
        errorMessage={errorMessage}
      />
    </div>
  );
};
