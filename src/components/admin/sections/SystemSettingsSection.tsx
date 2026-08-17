import React, { useState } from 'react';
import {
  Layers,
  Shield,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useSystemConfig } from '../../../hooks/useSystemConfig';
import type { SystemRole } from '../../../services/systemConfigService';

export const SystemSettingsSection: React.FC = () => {
  const { departments, roles, saveConfig } = useSystemConfig();

  // Department State
  const [isAddingDept, setIsAddingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [editingDeptIdx, setEditingDeptIdx] = useState<number | null>(null);
  const [editDeptName, setEditDeptName] = useState('');

  // Role Modal State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [roleModalMode, setRoleModalMode] = useState<'create' | 'edit'>('create');
  const [editingRoleIdx, setEditingRoleIdx] = useState<number | null>(null);
  const [roleLabel, setRoleLabel] = useState('');
  const [roleId, setRoleId] = useState('');
  const [roleDescription, setRoleDescription] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // --- Department Handlers ---
  const handleAddDepartment = async () => {
    const trimmed = newDeptName.trim();
    if (!trimmed) return;
    if (departments.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg('A department with this name already exists.');
      return;
    }
    const updated = [...departments, trimmed];
    try {
      setIsSaving(true);
      await saveConfig(updated, roles);
      setNewDeptName('');
      setIsAddingDept(false);
      setErrorMsg(null);
      showNotification(`Added department "${trimmed}".`);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to save department.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEditDept = async (index: number) => {
    const trimmed = editDeptName.trim();
    if (!trimmed) return;
    const oldName = departments[index];
    if (
      trimmed.toLowerCase() !== oldName.toLowerCase() &&
      departments.some((d) => d.toLowerCase() === trimmed.toLowerCase())
    ) {
      setErrorMsg('A department with this name already exists.');
      return;
    }
    const updated = [...departments];
    updated[index] = trimmed;
    try {
      setIsSaving(true);
      await saveConfig(updated, roles);
      setEditingDeptIdx(null);
      setErrorMsg(null);
      showNotification(`Updated department to "${trimmed}".`);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to update department.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDepartment = async (index: number) => {
    const name = departments[index];
    if (departments.length <= 1) {
      setErrorMsg('At least one department must remain.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete the "${name}" department?`)) {
      return;
    }
    const updated = departments.filter((_, i) => i !== index);
    try {
      setIsSaving(true);
      await saveConfig(updated, roles);
      setErrorMsg(null);
      showNotification(`Deleted department "${name}".`);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to delete department.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Role Handlers ---
  const handleOpenAddRole = () => {
    setRoleModalMode('create');
    setEditingRoleIdx(null);
    setRoleLabel('');
    setRoleId('');
    setRoleDescription('');
    setErrorMsg(null);
    setIsRoleModalOpen(true);
  };

  const handleOpenEditRole = (role: SystemRole, index: number) => {
    setRoleModalMode('edit');
    setEditingRoleIdx(index);
    setRoleLabel(role.label);
    setRoleId(role.id);
    setRoleDescription(role.description || '');
    setErrorMsg(null);
    setIsRoleModalOpen(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = roleLabel.trim();
    if (!cleanLabel) return;
    const cleanId = (roleId.trim() || cleanLabel.toLowerCase().replace(/\s+/g, '_')).toLowerCase();

    const updatedRoles = [...roles];
    if (roleModalMode === 'create') {
      if (roles.some((r) => r.id === cleanId || r.label.toLowerCase() === cleanLabel.toLowerCase())) {
        setErrorMsg('A role with this key or label already exists.');
        return;
      }
      updatedRoles.push({
        id: cleanId,
        label: cleanLabel,
        description: roleDescription.trim(),
      });
    } else if (editingRoleIdx !== null) {
      updatedRoles[editingRoleIdx] = {
        ...updatedRoles[editingRoleIdx],
        label: cleanLabel,
        description: roleDescription.trim(),
      };
    }

    try {
      setIsSaving(true);
      await saveConfig(departments, updatedRoles);
      setIsRoleModalOpen(false);
      setErrorMsg(null);
      showNotification(`Saved role "${cleanLabel}".`);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to save role.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRole = async (index: number) => {
    const role = roles[index];
    if (role.id === 'admin') {
      setErrorMsg('The Admin role cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete the "${role.label}" role?`)) {
      return;
    }
    const updated = roles.filter((_, i) => i !== index);
    try {
      setIsSaving(true);
      await saveConfig(departments, updated);
      setErrorMsg(null);
      showNotification(`Deleted role "${role.label}".`);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to delete role.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-50/50 dark:bg-[#0c0d12]">
      {/* Header */}
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#10121a]">
        <div className="flex items-center gap-2.5">
          <h1 className="text-base font-bold text-zinc-950 dark:text-zinc-50">System & Schema Settings</h1>
          <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            Dynamic Schema
          </span>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
          Manage agency departments and organizational role scopes
        </p>
      </div>

      {/* Notifications */}
      {saveSuccessMsg && (
        <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-2 text-xs text-rose-700 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-4xl">
        {/* 1. Departments Manager */}
        <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-500" />
                <span>Agency Departments ({departments.length})</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Functional units used across daily logs, team lead filtering, and member directories
              </p>
            </div>

            {!isAddingDept && (
              <button
                type="button"
                onClick={() => {
                  setIsAddingDept(true);
                  setNewDeptName('');
                  setErrorMsg(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer select-none"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add Department</span>
              </button>
            )}
          </div>

          {/* Inline Add Department Input */}
          {isAddingDept && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-indigo-500/30 rounded-xl flex items-center gap-2 animate-in fade-in duration-150">
              <input
                type="text"
                autoFocus
                placeholder="Department name (e.g. Mobile Apps)..."
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddDepartment();
                  if (e.key === 'Escape') setIsAddingDept(false);
                }}
                className="flex-1 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={handleAddDepartment}
                disabled={isSaving || !newDeptName.trim()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAddingDept(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Department Tiles Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {departments.map((dept, idx) => {
              const isEditing = editingDeptIdx === idx;

              if (isEditing) {
                return (
                  <div
                    key={dept}
                    className="p-2.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-500/40 flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      autoFocus
                      value={editDeptName}
                      onChange={(e) => setEditDeptName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEditDept(idx);
                        if (e.key === 'Escape') setEditingDeptIdx(null);
                      }}
                      className="flex-1 px-2.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEditDept(idx)}
                      disabled={isSaving}
                      className="p-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition cursor-pointer"
                      title="Save"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDeptIdx(null)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg transition cursor-pointer"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={dept}
                  className="group p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-all shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">{dept}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDeptIdx(idx);
                        setEditDeptName(dept);
                        setErrorMsg(null);
                      }}
                      className="p-1.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                      title="Rename department"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDepartment(idx)}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
                      title="Delete department"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Roles Manager */}
        <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-500" />
                <span>Organizational Roles & Scopes ({roles.length})</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Access tier roles defining security boundaries and log view capabilities
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenAddRole}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer select-none"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Add Role</span>
            </button>
          </div>

          {/* Roles List */}
          <div className="space-y-2.5">
            {roles.map((r, idx) => (
              <div
                key={r.id}
                className="group p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all shadow-2xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{r.label}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {r.id}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{r.description || 'No description provided.'}</p>
                </div>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenEditRole(r, idx)}
                    className="p-1.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                    title="Edit role"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {r.id !== 'admin' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRole(idx)}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
                      title="Delete role"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Role Create / Edit Modal */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {roleModalMode === 'create' ? 'Add New Role' : 'Edit Role'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRoleModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Role Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Project Manager"
                  value={roleLabel}
                  onChange={(e) => {
                    setRoleLabel(e.target.value);
                    if (roleModalMode === 'create' && !roleId) {
                      setRoleId(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                    }
                  }}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {roleModalMode === 'create' && (
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Role Key (Identifier)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. project_manager"
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                    className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Description / Access Scope
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief description of this role's purpose..."
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !roleLabel.trim()}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Role</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
