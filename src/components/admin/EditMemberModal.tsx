import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  User,
  Mail,
  Key,
  Briefcase,
  Shield,
  Loader2,
  Copy,
  Check,
  Code,
  Edit2,
  Plus,
} from 'lucide-react';
import { useDesignations } from '../../hooks/useDesignations';
import type { UserRole } from '../../types/auth';
import type { AdminMember, UpdateMemberPayload } from '../../types/admin';

interface EditMemberModalProps {
  isOpen: boolean;
  member: AdminMember | null;
  onClose: () => void;
  onSubmit: (userId: string, payload: UpdateMemberPayload) => Promise<void>;
}

const generateRandomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
};

export const EditMemberModal: React.FC<EditMemberModalProps> = ({
  isOpen,
  member,
  onClose,
  onSubmit,
}) => {
  const { designations, addDesignation } = useDesignations();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [designation, setDesignation] = useState('');
  const [password, setPassword] = useState('');
  const [isAddingNewDesignation, setIsAddingNewDesignation] = useState(false);
  const [newDesignationInput, setNewDesignationInput] = useState('');
  const [copied, setCopied] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && member) {
      setFullName(member.full_name || '');
      setEmail(member.email || '');
      setPhone(member.phone || '');
      setRole(member.role || 'member');
      setDesignation(member.designation || designations[0] || 'Web Development');
      setPassword('');
      setIsAddingNewDesignation(false);
      setNewDesignationInput('');
      setCopied(false);
      setErrorMsg(null);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, member, designations]);

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

  if (!isOpen || !member) return null;

  const handleGeneratePassword = () => {
    const pwd = generateRandomPassword();
    setPassword(pwd);
    setCopied(false);
  };

  const handleCopyPassword = () => {
    if (!password) return;
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddNewDesignation = () => {
    if (!newDesignationInput.trim()) return;
    const trimmed = newDesignationInput.trim();
    addDesignation(trimmed);
    setDesignation(trimmed);
    setNewDesignationInput('');
    setIsAddingNewDesignation(false);
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
    if (password.trim() && password.trim().length < 8) {
      setErrorMsg('New password must be at least 8 characters long');
      return;
    }

    const payload: UpdateMemberPayload = {
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || undefined,
      designation: designation.trim() || designations[0] || 'Web Development',
      role,
    };

    if (password.trim()) {
      payload.password = password.trim();
    }

    try {
      setIsSubmitting(true);
      await onSubmit(member.id, payload);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update member details');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMasterAdmin = member.role === 'admin';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center w-screen h-screen bg-black/60 backdrop-blur-xs animate-fadeIn p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-[#12141c] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-scaleIn overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Edit Member Details</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Update account credentials, profile, and roles</p>
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

          {/* Full Name & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-500" />
                <span>Full Name <span className="text-rose-500">*</span></span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Haris"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all shadow-2xs"
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
                placeholder="haris@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all shadow-2xs"
              />
            </div>
          </div>

          {/* Phone Number (WhatsApp) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <span>Phone / WhatsApp Number</span>
              </label>
              <span className="text-[10px] text-zinc-400">Optional (for 1-click WhatsApp reminders)</span>
            </div>
            <input
              type="tel"
              placeholder="+92 300 1234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all shadow-2xs font-mono"
            />
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-500" />
              <span>Role Permission</span>
            </label>
            {isMasterAdmin ? (
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-400/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <div>
                    <p className="text-xs font-bold text-purple-900 dark:text-purple-200">Master Administrator</p>
                    <p className="text-[10px] text-purple-700/70 dark:text-purple-300/70">Full system governance and team access</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white shadow-2xs">
                  Fixed Role
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  {
                    id: 'member' as UserRole,
                    label: 'Member',
                    badge: 'Standard',
                    desc: 'Isolated daily log view & submissions.',
                  },
                  {
                    id: 'admin' as UserRole,
                    label: 'Admin',
                    badge: 'Full Access',
                    desc: 'Manage all logs, team members & brands.',
                  },
                ].map((r) => {
                  const isSelected = role === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer shadow-2xs ${
                        isSelected
                          ? 'bg-indigo-500/10 border-indigo-500/60 ring-2 ring-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                          : 'bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">{r.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          {r.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-snug">{r.desc}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Designation Dynamic Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                <span>Designation</span>
              </label>
              <button
                type="button"
                onClick={() => setIsAddingNewDesignation(!isAddingNewDesignation)}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add New</span>
              </button>
            </div>

            {isAddingNewDesignation && (
              <div className="flex items-center gap-2 mb-2 p-2 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                <input
                  type="text"
                  placeholder="New designation name..."
                  value={newDesignationInput}
                  onChange={(e) => setNewDesignationInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewDesignation();
                    }
                  }}
                  autoFocus
                  className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddNewDesignation}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNewDesignation(false);
                    setNewDesignationInput('');
                  }}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
              {designations.map((d) => {
                const isSelected = designation === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDesignation(d)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer shadow-2xs ${
                      isSelected
                        ? 'bg-indigo-500/10 border-indigo-500/60 ring-2 ring-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                        : 'bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-indigo-600 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                          <Code className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold truncate">{d}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Change Password (Optional) */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-indigo-500" />
                <span>Reset Password</span>
              </label>
              <span className="text-[10px] text-zinc-400">Leave blank to keep existing password</span>
            </div>

            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Enter new password or click generate"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setCopied(false);
                }}
                className="w-full pl-3 pr-36 py-2 font-mono text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs"
              />
              <div className="absolute right-1.5 flex items-center gap-1">
                {password && (
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    className="px-2 py-1 text-[11px] font-bold bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 rounded-md transition cursor-pointer flex items-center gap-1"
                    title="Copy new password"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-zinc-500" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="px-2 py-1 text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-md border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>
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
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
