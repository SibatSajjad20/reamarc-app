import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Camera, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/authService';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { getRoleDisplayName } from '@/lib/roleLabel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/Avatar';
import { AvatarCropModal } from '../AvatarCropModal';
import { SettingsCard } from '../SettingsCard';
import { StickySaveBar } from '../StickySaveBar';
import { cn } from '@/lib/utils';

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
  const { user, refreshUser, updateUser } = useAuth();
  const { addToast } = useToast();
  const confirm = useConfirm();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const validateFile = (file: File): string | null => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return 'Please choose a JPEG, PNG, or WebP image.';
    }
    if (file.size > 5 * 1024 * 1024) {
      return 'Image file size must be 5 MB or less.';
    }
    return null;
  };

  const handleFileProcess = (file: File) => {
    setAvatarError(null);
    const err = validateFile(file);
    if (err) {
      setAvatarError(err);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImageSrc(reader.result as string);
      setIsCropModalOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
    e.target.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setIsUploadingAvatar(true);
    try {
      const updatedUser = await authService.uploadAvatar(croppedBlob);
      updateUser(updatedUser);
      setIsCropModalOpen(false);
      setSelectedImageSrc(null);
      addToast('Profile photo updated', 'Your new profile photo has been saved.', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Could not upload profile photo.';
      addToast('Upload failed', msg, 'error');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    const ok = await confirm({
      title: 'Remove profile photo',
      description: 'Are you sure you want to remove your profile photo? This will revert to your initials.',
      confirmLabel: 'Remove photo',
      tone: 'danger',
    });
    if (!ok) return;

    setIsRemovingAvatar(true);
    try {
      const updatedUser = await authService.deleteAvatar();
      updateUser(updatedUser);
      addToast('Profile photo removed', 'Your profile photo has been removed.', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Could not remove profile photo.';
      addToast('Failed to remove photo', msg, 'error');
    } finally {
      setIsRemovingAvatar(false);
    }
  };

  const roleName = getRoleDisplayName(user?.role);
  const departmentLabel =
    user?.departments && user.departments.length > 0
      ? user.departments.join(', ')
      : user?.department || 'General';
  const formattedJoined = formatJoinedDate(user?.joining_date);
  const employmentTypeLabel = user?.employment_type
    ? user.employment_type === 'full_time'
      ? 'Full-time'
      : user.employment_type === 'contract'
      ? 'Contract'
      : user.employment_type === 'probation'
      ? 'Probation'
      : user.employment_type
    : '—';
  const shiftLabel =
    (user as any)?.shift ||
    (user as any)?.shift_name ||
    '';

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Personal details"
        description="Your photo, name, and contact details visible across the workspace."
      >
        {/* Profile photo block */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-6 mb-6 border-b border-border">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'relative group shrink-0 cursor-pointer rounded-full p-1 border-2 border-dashed transition-colors',
              isDragging
                ? 'border-accent bg-accent-soft/30'
                : 'border-border hover:border-accent/60'
            )}
            title="Click or drag to upload a profile photo"
          >
            <Avatar
              name={fullName || user?.name}
              src={user?.avatar_url}
              size={80}
              className="rounded-full shadow-xs"
            />
            <div className="absolute inset-1 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <Camera className="w-5 h-5 drop-shadow-sm" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar || isRemovingAvatar}
              >
                {user?.avatar_url ? 'Change photo' : 'Upload photo'}
              </Button>
              {user?.avatar_url && (
                <Button
                  type="button"
                  variant="destructive-outline"
                  size="sm"
                  onClick={handleRemoveAvatar}
                  loading={isRemovingAvatar}
                  loadingText="Removing…"
                  disabled={isUploadingAvatar || isRemovingAvatar}
                >
                  Remove
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            <p className="text-caption text-fg-muted">
              Recommended: square image, at least 512×512 px. JPG, PNG or WebP, up to 5 MB.
            </p>
            {avatarError && (
              <p className="text-small text-danger-fg flex items-center gap-1.5 pt-0.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {avatarError}
              </p>
            )}
          </div>
        </div>

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

          {shiftLabel ? (
            <div className="sm:col-span-2 p-3 rounded-lg border border-border bg-subtle/50">
              <span className="block text-caption text-fg-muted font-medium">Assigned shift</span>
              <span className="block text-sm font-semibold text-fg mt-0.5">{shiftLabel}</span>
            </div>
          ) : null}
        </div>
      </SettingsCard>

      <StickySaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onDiscard={handleDiscard}
        onSave={handleSave}
        errorMessage={errorMessage}
      />

      <AvatarCropModal
        isOpen={isCropModalOpen}
        imageSrc={selectedImageSrc}
        onClose={() => {
          setIsCropModalOpen(false);
          setSelectedImageSrc(null);
        }}
        onCropComplete={handleCropComplete}
        isUploading={isUploadingAvatar}
      />
    </div>
  );
};
