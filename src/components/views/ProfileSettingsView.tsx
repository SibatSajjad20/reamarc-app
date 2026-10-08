import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Calendar,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Mail,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import { useToast } from '../../context/ToastContext';
import { useBreadcrumb } from '../layout/BreadcrumbContext';
import { getRoleDisplayName } from '../../lib/roleLabel';
import { getInitials } from '../../utils/badgeStyles';
import { enableWebPush, disableWebPush, canUsePush, notificationPermission } from '../../services/webPushService';
import { PageHeader } from '../ui/PageHeader';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { cn } from '../../lib/utils';
import type { ThemePreference } from '../../types';

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

interface ProfileSettingsViewProps {
  onSaved?: () => void;
  themePreference?: ThemePreference;
  onSelectThemePreference?: (preference: ThemePreference) => void;
}

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({
  onSaved,
  themePreference = 'system',
  onSelectThemePreference,
}) => {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const { setTrail } = useBreadcrumb();

  useEffect(() => {
    setTrail([{ label: 'Account' }, { label: 'Profile' }]);
    return () => setTrail(null);
  }, [setTrail]);

  const initialName = user?.full_name || user?.name || '';
  const initialPhone = user?.phone || user?.phone_number || '';
  const email = user?.email || '';

  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync state if user reloads
  useEffect(() => {
    setFullName(user?.full_name || user?.name || '');
    setPhone(user?.phone || user?.phone_number || '');
  }, [user]);

  // Desktop notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    return canUsePush() && notificationPermission() === 'granted';
  });
  const [notificationsToggling, setNotificationsToggling] = useState(false);

  // Theme preference fallback
  const activeThemePreference = themePreference;

  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);
  const initials = getInitials(user?.full_name || user?.name, user?.email);
  const displayName = user?.full_name || user?.name || 'Team member';
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

  const isDirty = useMemo(() => {
    return (
      fullName.trim() !== initialName.trim() ||
      phone.trim() !== initialPhone.trim() ||
      Boolean(currentPassword || newPassword || confirmPassword)
    );
  }, [fullName, phone, currentPassword, newPassword, confirmPassword, initialName, initialPhone]);

  const handleDiscard = () => {
    setFullName(initialName);
    setPhone(initialPhone);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleThemeChange = (pref: ThemePreference) => {
    if (onSelectThemePreference) {
      onSelectThemePreference(pref);
    } else {
      localStorage.setItem('reamarc-theme', pref);
      window.dispatchEvent(new Event('storage'));
    }
  };

  const handleToggleNotifications = async (checked: boolean) => {
    setNotificationsToggling(true);
    try {
      if (checked) {
        const perm = await enableWebPush();
        if (perm === 'granted') {
          setNotificationsEnabled(true);
          addToast('Notifications Enabled', 'Desktop alerts are now active.', 'success');
        } else if (perm === 'denied') {
          setNotificationsEnabled(false);
          addToast(
            'Notifications Blocked',
            'Notifications are blocked in your browser settings.',
            'warning'
          );
        } else {
          setNotificationsEnabled(false);
        }
      } else {
        await disableWebPush();
        setNotificationsEnabled(false);
        addToast('Notifications Disabled', 'Desktop notifications turned off.', 'info');
      }
    } catch (err: any) {
      addToast('Notification Error', err?.message || 'Could not update notification settings', 'error');
    } finally {
      setNotificationsToggling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!fullName.trim()) {
      setErrorMessage('Full name is required.');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Email address is required.');
      return;
    }
    if (newPassword) {
      if (newPassword.length < 6) {
        setErrorMessage('New password must be at least 6 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMessage('New passwords do not match.');
        return;
      }
      if (!currentPassword) {
        setErrorMessage('Please enter your current password to set a new password.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await authService.updateProfile({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        current_password: currentPassword || undefined,
        new_password: newPassword || undefined,
      });
      setSuccessMessage('Profile updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast('Profile Updated', 'Your profile information and credentials were saved.', 'success');
      await refreshUser();
      onSaved?.();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update profile settings.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6">
      <PageHeader
        title="Profile"
        description="Your details, password and preferences."
      />

      {/* Identity Card */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-full bg-accent-soft text-accent-text border border-accent/20 flex items-center justify-center text-lg font-semibold select-none shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-fg truncate">
                {displayName}
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-soft text-accent-text border border-accent/20">
                {roleName}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-fg-faint shrink-0" />
                <span className="truncate">{departmentLabel}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-fg-faint shrink-0" />
                <span className="truncate">{email}</span>
              </span>
              {formattedJoined && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-fg-faint shrink-0" />
                  <span>Joined {formattedJoined}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <Button
            variant="outline"
            size="sm"
            disabled
            title="Profile photos are managed via Google Workspace"
            icon={Camera}
          >
            Change photo
          </Button>
        </div>
      </div>

      {/* Settings Form Card */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-border bg-surface shadow-xs divide-y divide-border overflow-hidden"
      >
        {errorMessage && (
          <div className="p-4 bg-danger-bg border-b border-danger-bd text-danger-fg text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-4 bg-success-bg border-b border-success-bd text-success-fg text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Section: Personal Information */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-4 space-y-1">
            <h3 className="text-sm font-semibold text-fg">Personal information</h3>
            <p className="text-xs text-fg-muted">Your name and how the team reaches you.</p>
          </div>
          <div className="md:col-span-8 space-y-4">
            <div>
              <label htmlFor="profile-full-name" className="block text-xs font-medium text-fg mb-1.5">
                Full name <span className="text-danger-fg">*</span>
              </label>
              <Input
                id="profile-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Enter your full name"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="profile-email" className="block text-xs font-medium text-fg mb-1.5">
                  Work email
                </label>
                <div className="relative">
                  <Input
                    id="profile-email"
                    type="email"
                    value={email}
                    readOnly
                    disabled
                    className="pr-8 cursor-not-allowed bg-subtle"
                  />
                  <Lock className="w-3.5 h-3.5 text-fg-faint absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-xs text-fg-muted mt-1.5">Email changes go through HR</p>
              </div>

              <div>
                <label htmlFor="profile-phone" className="block text-xs font-medium text-fg mb-1.5">
                  Phone / WhatsApp
                </label>
                <Input
                  id="profile-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92 300 4412 876"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section: Work Details */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-4 space-y-1">
            <h3 className="text-sm font-semibold text-fg">Work details</h3>
            <p className="text-xs text-fg-muted">Managed by HR and admins.</p>
          </div>
          <div className="md:col-span-8">
            <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-3 text-xs">
              <dt className="text-fg-muted font-medium">Role</dt>
              <dd className="text-fg font-medium">{roleName}</dd>

              <dt className="text-fg-muted font-medium">Departments</dt>
              <dd className="text-fg font-medium">{departmentLabel}</dd>

              <dt className="text-fg-muted font-medium">Employment type</dt>
              <dd className="text-fg font-medium">{employmentTypeLabel}</dd>

              <dt className="text-fg-muted font-medium">Shift</dt>
              <dd className="text-fg font-medium">{shiftLabel}</dd>
            </dl>
          </div>
        </div>

        {/* Section: Security */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-4 space-y-1">
            <h3 className="text-sm font-semibold text-fg">Security</h3>
            <p className="text-xs text-fg-muted">Use at least 6 characters.</p>
          </div>
          <div className="md:col-span-8 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-start">
              <div>
                <label htmlFor="profile-cur-pw" className="block text-xs font-medium text-fg mb-1.5">
                  Current password
                </label>
                <Input
                  id="profile-cur-pw"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Required to change"
                />
                <p className="text-xs text-fg-muted mt-1 leading-tight">
                  Required only when changing password
                </p>
              </div>

              <div>
                <label htmlFor="profile-new-pw" className="block text-xs font-medium text-fg mb-1.5">
                  New password
                </label>
                <Input
                  id="profile-new-pw"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
                {newPassword && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1 h-1.5">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          className={cn(
                            'flex-1 rounded-full transition-colors duration-150',
                            step <= strength.score ? strength.bar : 'bg-subtle'
                          )}
                        />
                      ))}
                    </div>
                    <p className="text-[10px] font-medium text-fg-muted">{strength.label}</p>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="profile-confirm-pw" className="block text-xs font-medium text-fg mb-1.5">
                  Confirm new password
                </label>
                <Input
                  id="profile-confirm-pw"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section: Preferences */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-4 space-y-1">
            <h3 className="text-sm font-semibold text-fg">Preferences</h3>
            <p className="text-xs text-fg-muted">Applies on this device.</p>
          </div>
          <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <span className="block text-xs font-medium text-fg mb-2">Theme</span>
              <div className="inline-flex p-1 rounded-lg bg-subtle border border-border gap-1">
                {[
                  { key: 'light', label: 'Light', icon: Sun },
                  { key: 'dark', label: 'Dark', icon: Moon },
                  { key: 'system', label: 'System', icon: Monitor },
                ].map(({ key, label, icon: Icon }) => {
                  const isActive = activeThemePreference === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleThemeChange(key as ThemePreference)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-120 cursor-pointer select-none',
                        isActive
                          ? 'bg-surface text-fg shadow-xs border border-border font-semibold'
                          : 'text-fg-muted hover:text-fg hover:bg-surface/50 border border-transparent'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-fg mb-2">Desktop notifications</span>
              <div className="flex items-start gap-3">
                <Switch
                  id="profile-notifications-toggle"
                  checked={notificationsEnabled}
                  onCheckedChange={handleToggleNotifications}
                  disabled={notificationsToggling}
                />
                <div className="space-y-0.5">
                  <label
                    htmlFor="profile-notifications-toggle"
                    className="text-xs font-medium text-fg block cursor-pointer"
                  >
                    Shift reminders, approvals and mentions
                  </label>
                  <p className="text-xs text-fg-muted leading-tight">
                    {notificationsEnabled
                      ? 'System push notifications are active'
                      : 'Turn on to receive native desktop alerts'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card Footer / Save Bar */}
        <div className="px-6 py-4 bg-surface flex items-center justify-between">
          <div>
            {isDirty ? (
              <span className="text-xs text-fg-muted">You have unsaved changes</span>
            ) : (
              <span className="text-xs text-fg-faint">All changes saved</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDiscard}
              disabled={!isDirty || isSubmitting}
            >
              Discard
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
              disabled={!isDirty || isSubmitting}
            >
              Save changes
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
