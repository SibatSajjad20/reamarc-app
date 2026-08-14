import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  UserPlus,
  Shield,
  User,
  Mail,
  Key,
  Briefcase,
  Building,
  Send,
  Lock,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import type { UserRole } from '../../types/auth';
import type { Workspace } from '../../types';
import type { CreateMemberPayload } from '../../types/admin';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateMemberPayload) => Promise<void>;
  workspaces: Workspace[];
  defaultRole?: UserRole;
}

const DEPARTMENTS = [
  'Engineering',
  'AI',
  'Design',
  'QA',
  'Marketing',
  'Operations',
];

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  workspaces,
  defaultRole = 'member',
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [department, setDepartment] = useState('Engineering');
  const [customDepartment, setCustomDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [passwordMode, setPasswordMode] = useState<'invite' | 'manual'>('invite');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedWsIds, setSelectedWsIds] = useState<string[]>(() =>
    workspaces.length > 0 ? [workspaces[0].id] : []
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFullName('');
      setEmail('');
      setRole(defaultRole);
      setDepartment('Engineering');
      setCustomDepartment('');
      setDesignation('');
      setPasswordMode('invite');
      setTemporaryPassword('');
      setIsActive(true);
      setSelectedWsIds(workspaces.length > 0 ? [workspaces[0].id] : []);
      setErrorMsg(null);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, defaultRole, workspaces]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleWs = (id: string) => {
    setSelectedWsIds((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  };

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    let pwd = '';
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setTemporaryPassword(pwd);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg('Full Name is required');
      return;
    }
    if (!email.trim()) {
      setErrorMsg('Work Email is required');
      return;
    }
    if (passwordMode === 'manual') {
      if (!temporaryPassword.trim()) {
        setErrorMsg('Please enter a temporary password or switch to invite email');
        return;
      }
      if (temporaryPassword.trim().length < 8) {
        setErrorMsg('Password must be at least 8 characters long');
        return;
      }
    }

    const finalDept = department === 'Other' ? customDepartment.trim() : department;

    try {
      setIsSubmitting(true);
      await onSubmit({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role,
        department: finalDept || undefined,
        designation: designation.trim() || undefined,
        temporary_password: passwordMode === 'manual' ? temporaryPassword.trim() : undefined,
        send_invite_email: passwordMode === 'invite',
        is_active: isActive,
        workspace_ids: role === 'admin' ? workspaces.map((w) => w.id) : selectedWsIds,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create team member');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center w-screen h-screen bg-black/60 backdrop-blur-xs animate-fadeIn p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col bg-white dark:bg-[#12141c] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-scaleIn overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Add Team Member</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Create member account, assign roles and workspace access</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs font-medium text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-900">
              {errorMsg}
            </div>
          )}

          {/* Row 1: Full Name & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-500" />
                <span>Full Name <span className="text-rose-500">*</span></span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Sarah Jenkins"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-indigo-500" />
                <span>Work Email <span className="text-rose-500">*</span></span>
              </label>
              <input
                type="email"
                required
                placeholder="sarah@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all"
              />
            </div>
          </div>

          {/* Row 2: Role Selection (Two-Tier: Member vs Admin) */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-500" />
              <span>Role Permission</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                {
                  id: 'member' as UserRole,
                  label: 'Member',
                  badge: 'Standard Access',
                  desc: 'Internal team logging, submits own daily work logs, isolated view.',
                },
                {
                  id: 'admin' as UserRole,
                  label: 'Admin',
                  badge: 'Full Privileges',
                  desc: 'Full system management, view/edit all logs, manage users & workspace settings.',
                },
              ].map((r) => {
                const isSelected = role === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRole(r.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-500/10 border-indigo-500/50 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <Shield className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`} />
                        <span>{r.label}</span>
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        isSelected
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}>
                        {r.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">{r.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Department & Designation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-indigo-500" />
                <span>Department</span>
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 cursor-pointer"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d} className="bg-white dark:bg-zinc-900">
                    {d}
                  </option>
                ))}
                <option value="Other" className="bg-white dark:bg-zinc-900">Other (Custom)</option>
              </select>
              {department === 'Other' && (
                <input
                  type="text"
                  placeholder="Enter department name..."
                  value={customDepartment}
                  onChange={(e) => setCustomDepartment(e.target.value)}
                  className="w-full mt-2 px-3.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                <span>Designation / Job Title</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Full-Stack Developer, AI Engineer"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all"
              />
            </div>
          </div>

          {/* Row 4: Initial Password / Invite Option */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-indigo-500" />
              <span>Initial Credentials & Invitation</span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPasswordMode('invite')}
                className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                  passwordMode === 'invite'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Invite Email</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPasswordMode('manual');
                  if (!temporaryPassword) handleGeneratePassword();
                }}
                className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                  passwordMode === 'manual'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Set Temporary Password</span>
              </button>
            </div>

            {passwordMode === 'manual' ? (
              <div className="space-y-1.5 pt-1">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    required
                    placeholder="Enter min. 8 characters"
                    value={temporaryPassword}
                    onChange={(e) => setTemporaryPassword(e.target.value)}
                    className="w-full pl-3 pr-24 py-2 font-mono text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="absolute right-1.5 px-2.5 py-1 text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 rounded-md border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                  >
                    Generate
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400">Share this temporary password with the team member upon onboarding.</p>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                A secure onboarding invitation with initial sign-in credentials will be automatically dispatched to <span className="font-semibold text-zinc-800 dark:text-zinc-200">{email || 'their email'}</span>.
              </p>
            )}
          </div>

          {/* Row 5: Active Status Toggle */}
          <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <div>
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">Active Member Status</span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {isActive ? 'User can log in and submit daily work logs immediately.' : 'Account is disabled until activated by an administrator.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer ${
                isActive ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform ring-0 transition duration-200 ease-in-out ${
                  isActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Row 6: Workspaces Selection (for Members) */}
          {role === 'admin' ? (
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs flex items-center gap-2 font-medium">
              <Shield className="w-4 h-4 shrink-0" />
              <span>Admins automatically have global access across all current and future workspaces.</span>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Assigned Workspaces
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-800">
                {workspaces.map((ws) => {
                  const isSelected = selectedWsIds.includes(ws.id);
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => toggleWs(ws.id)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span className="truncate">{ws.name}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </form>

        {/* Modal Actions Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition shadow-sm shadow-indigo-600/20 hover:shadow-md hover:shadow-indigo-600/30 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed select-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Creating Member...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
