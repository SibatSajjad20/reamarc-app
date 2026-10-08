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
import { useConfirm } from '../../ui/ConfirmProvider';
import type { SystemRole } from '../../../services/systemConfigService';

export const SystemSettingsSection: React.FC = () => {
  const confirm = useConfirm();
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
    const ok = await confirm({
      title: `Delete the ${name} department?`,
      confirmLabel: 'Delete department',
      tone: 'danger',
    });
    if (!ok) return;
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
    const ok = await confirm({
      title: `Delete the ${role.label} role?`,
      confirmLabel: 'Delete role',
      tone: 'danger',
    });
    if (!ok) return;
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
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-canvas">
      {/* Header */}
      <div className="p-5 border-b border-border bg-surface">
        <div className="flex items-center gap-2.5">
          <h1 className="text-base font-semibold text-fg">System & Schema Settings</h1>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-subtle text-fg-2 border border-border">
            Dynamic Schema
          </span>
        </div>
        <p className="text-xs text-fg-muted mt-0.5">
          Manage agency departments and organizational role scopes
        </p>
      </div>

      {/* Notifications */}
      {saveSuccessMsg && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-success-bg border border-success-bd flex items-center gap-2 text-xs text-success-fg">
          <CheckCircle2 className="w-4 h-4 text-success-fg shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-danger-bg border border-danger-bd flex items-center justify-between gap-2 text-xs text-danger-fg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-danger-fg shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-danger-fg hover:opacity-80 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-4xl">
        {/* 1. Departments Manager */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent" />
                <span>Agency Departments ({departments.length})</span>
              </h3>
              <p className="text-xs text-fg-muted mt-0.5">
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-medium transition cursor-pointer select-none"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add Department</span>
              </button>
            )}
          </div>

          {/* Inline Add Department Input */}
          {isAddingDept && (
            <div className="p-3 bg-subtle border border-accent/40 rounded-lg flex items-center gap-2 animate-in fade-in duration-150">
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
                className="flex-1 px-3 py-1.5 bg-surface border border-border-strong rounded-md text-xs text-fg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
              <button
                type="button"
                onClick={handleAddDepartment}
                disabled={isSaving || !newDeptName.trim()}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-medium transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAddingDept(false)}
                className="p-1.5 text-fg-muted hover:text-fg rounded-md transition cursor-pointer"
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
                    className="p-2.5 rounded-lg bg-accent-soft border border-accent/40 flex items-center gap-1.5"
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
                      className="flex-1 px-2.5 py-1 bg-surface border border-border-strong rounded-md text-xs text-fg focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEditDept(idx)}
                      disabled={isSaving}
                      className="p-1.5 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent-hover transition cursor-pointer"
                      title="Save"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDeptIdx(null)}
                      className="p-1.5 text-fg-muted hover:text-fg rounded-md transition cursor-pointer"
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
                  className="group p-3 rounded-lg bg-subtle border border-border flex items-center justify-between hover:border-border-strong transition-all"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
                    <span className="text-xs font-medium text-fg truncate">{dept}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDeptIdx(idx);
                        setEditDeptName(dept);
                        setErrorMsg(null);
                      }}
                      className="p-1.5 text-fg-muted hover:text-accent hover:bg-hover rounded-md transition cursor-pointer"
                      title="Rename department"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDepartment(idx)}
                      className="p-1.5 text-fg-muted hover:text-danger-fg hover:bg-danger-bg rounded-md transition cursor-pointer"
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
        <div className="bg-surface border border-border rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent" />
                <span>Organizational Roles & Scopes ({roles.length})</span>
              </h3>
              <p className="text-xs text-fg-muted mt-0.5">
                Access tier roles defining security boundaries and log view capabilities
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenAddRole}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-medium transition cursor-pointer select-none"
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
                className="group p-3.5 rounded-lg bg-subtle border border-border flex items-center justify-between gap-3 hover:border-border-strong transition-all"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-fg">{r.label}</span>
                    <span className="text-[10px] font-numeric px-1.5 py-0.5 rounded bg-surface border border-border text-fg-muted">
                      {r.id}
                    </span>
                  </div>
                  <p className="text-xs text-fg-muted mt-0.5 leading-snug">{r.description || 'No description provided.'}</p>
                </div>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenEditRole(r, idx)}
                    className="p-1.5 text-fg-muted hover:text-accent hover:bg-hover rounded-md transition cursor-pointer"
                    title="Edit role"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {r.id !== 'admin' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRole(idx)}
                      className="p-1.5 text-fg-muted hover:text-danger-fg hover:bg-danger-bg rounded-md transition cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl max-w-md w-full p-5 shadow-lg space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-accent-soft border border-accent/20 text-accent flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-fg">
                  {roleModalMode === 'create' ? 'Add New Role' : 'Edit Role'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRoleModalOpen(false)}
                className="p-1 text-fg-muted hover:text-fg rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-fg mb-1">
                  Role Title <span className="text-danger-solid">*</span>
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
                  className="w-full px-3 py-2 text-xs bg-surface border border-border-strong rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>

              {roleModalMode === 'create' && (
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">
                    Role Key (Identifier)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. project_manager"
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                    className="w-full px-3 py-2 text-xs font-numeric bg-surface border border-border-strong rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-fg mb-1">
                  Description / Access Scope
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief description of this role's purpose..."
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-surface border border-border-strong rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-fg-2 hover:bg-hover border border-border rounded-md transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !roleLabel.trim()}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
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

