import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  UserPlus,
  User,
  Mail,
  Phone,
  Key,
  Layers,
  Shield,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import type { UserRole } from '../../types/auth';
import type { CreateMemberPayload } from '../../types/admin';

export const DEPARTMENTS = [
  'Website',
  'Creative',
  'Content',
  'SEO',
  'Performance Marketing',
  'AI',
  'Software Development',
  'HR',
] as const;

export const ROLES: { id: UserRole; label: string; description: string }[] = [
  { id: 'team_member', label: 'Team Member', description: 'Records own tasks & daily logs' },
  { id: 'team_lead', label: 'Team Lead', description: 'Leads department and oversees team logs' },
  { id: 'operations', label: 'Operations', description: 'Cross-department operations & workspaces' },
  { id: 'hr', label: 'HR', description: 'All departments logs & compliance access' },
  { id: 'client', label: 'Client', description: 'Sandbox Client Portal & Approvals only' },
];

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateMemberPayload) => Promise<void>;
  defaultRole?: UserRole;
}

const generateRandomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
};

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  defaultRole = 'team_member',
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [department, setDepartment] = useState<string>('Website');
  const [passwordMode, setPasswordMode] = useState<'invite' | 'manual'>('manual');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFullName('');
      setEmail('');
      setPhone('');
      setRole(defaultRole === 'member' ? 'team_member' : defaultRole);
      setDepartment('Website');
      setPasswordMode('manual');
      setTemporaryPassword(generateRandomPassword());
      setCopied(false);
      setErrorMsg(null);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, defaultRole]);

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

  const handleGeneratePassword = () => {
    setTemporaryPassword(generateRandomPassword());
    setCopied(false);
  };

  const handleCopyPassword = () => {
    if (!temporaryPassword) return;
    navigator.clipboard.writeText(temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg('Full Name is required');
      return;
    }
    if (!email.trim()) {
      setErrorMsg('Work Email is required');
      return;
    }
    if (!phone.trim()) {
      setErrorMsg('Phone Number is compulsory');
      return;
    }

    const finalPassword = temporaryPassword.trim() || generateRandomPassword();
    if (passwordMode === 'manual' && finalPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters long');
      return;
    }

    let deptValue: string | undefined = department;
    if (role === 'admin' || role === 'operations') {
      deptValue = 'All';
    } else if (role === 'hr') {
      deptValue = 'HR';
    } else if (role === 'client') {
      deptValue = undefined;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        role,
        department: deptValue,
        temporary_password: finalPassword,
        send_invite_email: passwordMode === 'invite',
        is_active: true,
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
        className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-[#12141c] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-scaleIn overflow-hidden"
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
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Onboard member to the agency directory</p>
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
                placeholder="John Doe"
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
                placeholder="name@reamarc.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all shadow-2xs"
              />
            </div>
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-500" />
              <span>Role Assignment <span className="text-rose-500">*</span></span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ROLES.map((r) => {
                const isSelected = role === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRole(r.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'bg-indigo-500/10 border-indigo-500 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20'
                        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{r.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-0.5 leading-tight line-clamp-1">{r.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Department Selection (Only for Team Lead & Team Member) */}
          {(role === 'team_lead' || role === 'team_member') && (
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>Department <span className="text-rose-500">*</span></span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DEPARTMENTS.map((dept) => {
                  const isSelected = department === dept;
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => setDepartment(dept)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center select-none ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/30'
                          : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700/80 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300'
                      }`}
                    >
                      {dept}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Department Note for Admin / HR / Operations */}
          {role === 'hr' && (
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 shrink-0" />
              <span>Department assigned as <strong>"HR"</strong> with full global directory & compliance management.</span>
            </div>
          )}
          {(role === 'admin' || role === 'operations') && (
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 shrink-0" />
              <span>Department will be assigned as <strong>"All"</strong> with global access.</span>
            </div>
          )}

          {/* Phone Number (Compulsory) */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-indigo-500" />
              <span>Phone / WhatsApp Number <span className="text-rose-500">*</span></span>
            </label>
            <input
              type="tel"
              required
              placeholder="+92 300 1234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all shadow-2xs font-mono"
            />
          </div>

          {/* Initial Password & Credentials */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-indigo-500" />
              <span>Initial Sign-In Password</span>
            </label>

            <div className="relative flex items-center">
              <input
                type="text"
                required
                placeholder="Enter min. 8 characters"
                value={temporaryPassword}
                onChange={(e) => {
                  setTemporaryPassword(e.target.value);
                  setCopied(false);
                }}
                className="w-full pl-3 pr-36 py-2 font-mono text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs"
              />
              <div className="absolute right-1.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="px-2 py-1 text-[11px] font-bold bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 rounded-md transition cursor-pointer flex items-center gap-1"
                  title="Copy temporary password"
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
