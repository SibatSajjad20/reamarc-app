import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/authService';
import { useToast } from '@/context/ToastContext';
import { getRoleDisplayName } from '@/lib/roleLabel';
import { Input } from '@/components/ui/input';
import { SettingsCard } from '../SettingsCard';
import { StickySaveBar } from '../StickySaveBar';

function formatJoinedDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
}

export const AccountProfileSection: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();

  const initialName = user?.full_name || user?.name || '';
  const initialPhone = user?.phone || user?.phone_number || '';
  const email = user?.email || '';

  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setFullName(user?.full_name || user?.name || '');
    setPhone(user?.phone || user?.phone_number || '');
  }, [user]);

  const isDirty = useMemo(() => {
    return fullName.trim() !== initialName.trim() || phone.trim() !== initialPhone.trim();
  }, [fullName, phone, initialName, initialPhone]);

  const handleDiscard = () => {
    setFullName(initialName);
    setPhone(initialPhone);
    setErrorMessage(null);
  };

  const handleSave = async () => {
    setErrorMessage(null);
    if (!fullName.trim()) {
      setErrorMessage('Full name is required.');
      return;
    }

    setIsSaving(true);
    try {
      await authService.updateProfile({
        full_name: fullName.trim(),
        phone: phone.trim(),
      });
      await refreshUser();
      addToast('Profile updated', 'Your personal details have been saved.', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Could not update profile';
      setErrorMessage(msg);
      addToast('Update failed', msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const roleName = getRoleDisplayName(user?.role);
  const departmentLabel =
    user?.departments && user.departments.length > 0
      ? user.departments.join(', ')
      : user?.department || 'General';
  const formattedJoined = formatJoinedDate(user?.joining_date);
  const employmentTypeLabel = user?.employment_type
    ? user.employment_type === 'probation'
      ? 'Probation'
      : 'Contract'
    : 'Full-time';
  const shiftLabel =
    (user as any)?.shift ||
    (user as any)?.shift_name ||
    'Standard · 9:30 AM – 6:30 PM';

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Personal details"
        description="Your name and contact details visible across the workspace."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-fg mb-1.5">
              Full name
            </label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-fg mb-1.5">
              Phone number
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+92 300 1234567"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-fg mb-1.5">
              Email address
            </label>
            <Input
              value={email}
              readOnly
              disabled
              className="bg-subtle text-fg-muted cursor-not-allowed"
            />
            <p className="text-caption text-fg-muted mt-1">
              Contact an administrator to change your email address.
            </p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Work assignment"
        description="Your department, organizational role, and assigned shift."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 rounded-lg border border-border bg-subtle/50">
            <span className="block text-caption text-fg-muted font-medium">Role</span>
            <span className="block text-sm font-semibold text-fg mt-0.5">{roleName}</span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-subtle/50">
            <span className="block text-caption text-fg-muted font-medium">Department</span>
            <span className="block text-sm font-semibold text-fg mt-0.5">{departmentLabel}</span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-subtle/50">
            <span className="block text-caption text-fg-muted font-medium">Employment type</span>
            <span className="block text-sm font-semibold text-fg mt-0.5">{employmentTypeLabel}</span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-subtle/50">
            <span className="block text-caption text-fg-muted font-medium">Date joined</span>
            <span className="block text-sm font-semibold text-fg mt-0.5">{formattedJoined || 'Not recorded'}</span>
          </div>

          <div className="sm:col-span-2 p-3 rounded-lg border border-border bg-subtle/50">
            <span className="block text-caption text-fg-muted font-medium">Assigned shift</span>
            <span className="block text-sm font-semibold text-fg mt-0.5">{shiftLabel}</span>
          </div>
        </div>
      </SettingsCard>

      <StickySaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onDiscard={handleDiscard}
        onSave={handleSave}
        errorMessage={errorMessage}
      />
    </div>
  );
};
