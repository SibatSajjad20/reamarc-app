import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Building2, UserCheck, Plus, Search, ShieldCheck } from 'lucide-react';
import type { AdminUser } from '../../types/admin';
import type { Workspace } from '../../types';

interface WorkspaceAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: Workspace | null;
  allUsers: AdminUser[];
  onAssign: (userId: string, workspaceId: string, action: 'assign' | 'remove') => Promise<void>;
}

export const WorkspaceAssignModal: React.FC<WorkspaceAssignModalProps> = ({
  isOpen,
  onClose,
  workspace,
  allUsers,
  onAssign,
}) => {
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Lock body scroll when modal is open and revert to auto on close/unmount
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

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

  if (!isOpen || !workspace) return null;

  const handleToggle = async (user: AdminUser) => {
    const isAssigned = (user.workspace_ids || []).includes(workspace.id);
    const action = isAssigned ? 'remove' : 'assign';

    try {
      setLoadingUserId(user.id);
      await onAssign(user.id, workspace.id, action);
    } finally {
      setLoadingUserId(null);
    }
  };

  const assignableUsers = allUsers.filter((u) => u.role !== 'admin');
  const filteredUsers = assignableUsers.filter(
    (u) =>
      u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center w-screen h-screen bg-black/60 backdrop-blur-xs animate-fadeIn p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Manage Workspace Access</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span className="font-semibold text-slate-700 dark:text-slate-300">{workspace.name}</span>
                {(workspace as any).client_name && <span>• {(workspace as any).client_name}</span>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800/60 bg-white dark:bg-slate-900">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search team members by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* User List Container with Inner Scrolling */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 max-h-[calc(90vh-160px)] custom-scrollbar">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
              Team Access Matrix (Editors & Viewers)
            </h4>
            <span className="text-[11px] text-slate-400 font-mono">
              {filteredUsers.filter((u) => (u.workspace_ids || []).includes(workspace.id)).length} Assigned
            </span>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="py-8 text-center bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {searchQuery ? 'No matching team members found.' : 'No non-admin team members available.'}
              </p>
            </div>
          ) : (
            filteredUsers.map((user) => {
              const isAssigned = (user.workspace_ids || []).includes(workspace.id);
              const isLoading = loadingUserId === user.id;

              return (
                <div
                  key={user.id}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                    isAssigned
                      ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50 shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center font-bold text-xs text-indigo-700 dark:text-indigo-300 shrink-0">
                      {user.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {user.full_name}
                        </p>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 uppercase">
                          {user.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggle(user)}
                    disabled={isLoading}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 ${
                      isAssigned
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border border-red-200 dark:border-red-900/40'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs'
                    }`}
                  >
                    {isAssigned ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        Assigned
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        Assign
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Click outside or press <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px] font-mono text-slate-700 dark:text-slate-300">Esc</kbd> to exit.
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
