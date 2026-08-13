import React, { useState, useEffect } from 'react';
import { Users, Building2, UserPlus, Plus, Shield, CheckCircle, XCircle, ChevronRight, Search, Edit2, Trash2 } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useToast } from '../../context/ToastContext';
import { AddMemberModal } from './AddMemberModal';
import { WorkspaceAssignModal } from './WorkspaceAssignModal';
import { WorkspaceModal } from '../modals/WorkspaceModal';
import type { AdminUser, AdminCreateUserPayload } from '../../types/admin';
import type { Workspace } from '../../types';
import type { UserRole } from '../../types/auth';

export const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'workspaces'>('users');
  const [userRoleTab, setUserRoleTab] = useState<'all' | 'admin' | 'editor' | 'viewer' | 'client'>('all');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState('');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalDefaultRole, setAddModalDefaultRole] = useState<UserRole>('editor');
  const [selectedWsForDrawer, setSelectedWsForDrawer] = useState<Workspace | null>(null);

  // Workspace modal
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [workspaceToEdit, setWorkspaceToEdit] = useState<Workspace | null>(null);

  const { workspaces, saveWorkspace, deleteWorkspace, refetch: refetchWorkspaces } = useWorkspaces();
  const { addToast } = useToast();

  const fetchUsers = async () => {
    try {
      setIsLoadingUsers(true);
      const data = await adminService.getUsers();
      setUsers(data);
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to load team members', 'warning');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenAddModal = (role?: UserRole) => {
    setAddModalDefaultRole(role || (userRoleTab !== 'all' ? (userRoleTab as UserRole) : 'editor'));
    setIsAddModalOpen(true);
  };

  const handleCreateUser = async (payload: AdminCreateUserPayload) => {
    await adminService.createUser(payload);
    addToast('Success', `User account created for ${payload.email}`, 'success');
    fetchUsers();
  };

  const handleToggleUserStatus = async (user: AdminUser) => {
    try {
      const updated = await adminService.updateUser(user.id, { is_active: !user.is_active });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
      addToast('Updated', `Account status for ${user.full_name} changed`, 'info');
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to update user', 'warning');
    }
  };

  const handleChangeRole = async (user: AdminUser, newRole: UserRole) => {
    try {
      const updated = await adminService.updateUser(user.id, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
      addToast('Role Updated', `${user.full_name} is now a ${newRole}`, 'success');
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to update role', 'warning');
    }
  };

  const handleOpenCreateWorkspace = () => {
    setWorkspaceToEdit(null);
    setIsWorkspaceModalOpen(true);
  };

  const handleOpenEditWorkspace = (ws: Workspace) => {
    setWorkspaceToEdit(ws);
    setIsWorkspaceModalOpen(true);
  };

  const handleSaveWorkspaceModal = async (data: { name: string; initials?: string; brandColor?: string; industry?: string }) => {
    try {
      const res = await saveWorkspace(workspaceToEdit, data);
      addToast('Success', res.isNew ? `Workspace "${data.name}" created!` : `Workspace "${data.name}" updated!`, 'success');
      refetchWorkspaces();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to save workspace', 'warning');
    }
  };

  const handleDeleteWorkspaceItem = async (ws: Workspace) => {
    if (!window.confirm(`Are you sure you want to delete workspace "${ws.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteWorkspace(ws.id);
      addToast('Deleted', `Workspace "${ws.name}" removed`, 'info');
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to delete workspace', 'warning');
    }
  };

  const handleAssignWorkspaceUser = async (userId: string, workspaceId: string, action: 'assign' | 'remove') => {
    try {
      await adminService.assignWorkspace({ user_id: userId, workspace_id: workspaceId, action });
      await fetchUsers();
      addToast('Assigned', `Updated workspace access`, 'success');
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to update assignment', 'warning');
    }
  };

  // Filter users by search & active role tab
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = userRoleTab === 'all' || u.role === userRoleTab;
    return matchesSearch && matchesRole;
  });

  // Filter workspaces by search
  const filteredWorkspaces = workspaces.filter(
    (ws) =>
      ws.name.toLowerCase().includes(workspaceSearchQuery.toLowerCase()) ||
      (ws.industry && ws.industry.toLowerCase().includes(workspaceSearchQuery.toLowerCase())) ||
      ws.id.toLowerCase().includes(workspaceSearchQuery.toLowerCase())
  );

  const getAddButtonLabel = () => {
    switch (userRoleTab) {
      case 'admin':
        return 'Add Admin';
      case 'editor':
        return 'Add Editor';
      case 'viewer':
        return 'Add Viewer';
      case 'client':
        return 'Add Client';
      default:
        return 'Add Member';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Admin Operations Center</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage multi-tenant organization users, roles, and workspace access.
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'users'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            Team Members ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('workspaces')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'workspaces'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Workspaces ({workspaces.length})
          </button>
        </div>
      </div>

      {/* TAB 1: TEAM MEMBERS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Sub-tab Navigation for Roles */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
              {[
                { key: 'all', label: 'All Users', count: users.length },
                { key: 'admin', label: 'Admins', count: users.filter((u) => u.role === 'admin').length },
                { key: 'editor', label: 'Editors', count: users.filter((u) => u.role === 'editor').length },
                { key: 'viewer', label: 'Viewers', count: users.filter((u) => u.role === 'viewer').length },
                { key: 'client', label: 'Clients', count: users.filter((u) => u.role === 'client').length },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setUserRoleTab(tab.key as any)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 ${
                    userRoleTab === tab.key
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                      : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 text-[10px] rounded-full font-extrabold ${
                      userRoleTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => handleOpenAddModal()}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl transition shadow-md shadow-blue-600/20 shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              {getAddButtonLabel()}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search team members by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            {isLoadingUsers ? (
              <div className="p-12 text-center text-xs text-slate-400">Loading team directory...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">No team members match your criteria.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-3.5">User</th>
                      <th className="px-6 py-3.5">Role</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Assigned Workspaces</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                              {u.full_name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">{u.full_name}</p>
                              <p className="text-[11px] text-slate-400">{u.email}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          {u.role === 'admin' ? (
                            <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                              Admin
                            </span>
                          ) : (
                            <select
                              value={u.role}
                              onChange={(e) => handleChangeRole(u, e.target.value as UserRole)}
                              className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold capitalize text-slate-800 dark:text-slate-200 focus:outline-none"
                            >
                              <option value="admin">Admin</option>
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                              <option value="client">Client</option>
                            </select>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {u.role === 'admin' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle className="w-3 h-3" /> Active
                            </span>
                          ) : (
                            <button
                              onClick={() => handleToggleUserStatus(u)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition ${
                                u.is_active
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
                              }`}
                            >
                              {u.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {u.is_active ? 'Active' : 'Disabled'}
                            </button>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {u.role === 'admin' ? (
                            <span className="px-2.5 py-1 text-[11px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg border border-purple-500/20">
                              Global Access (All Workspaces)
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {(u.workspace_ids || []).map((wsId) => {
                                const ws = workspaces.find((w) => w.id === wsId);
                                return (
                                  <span
                                    key={wsId}
                                    className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700"
                                  >
                                    {ws?.name || wsId}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          {u.role === 'admin' ? (
                            <span className="text-xs font-medium text-slate-400 italic">Immutable Admin</span>
                          ) : (
                            <button
                              onClick={() => handleToggleUserStatus(u)}
                              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: WORKSPACES */}
      {activeTab === 'workspaces' && (
        <div className="space-y-6">
          {/* Workspaces Search Bar & Create Workspace Action */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="relative w-full sm:max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search workspaces by name or industry..."
                value={workspaceSearchQuery}
                onChange={(e) => setWorkspaceSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleOpenCreateWorkspace}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-xl transition shadow-md shadow-indigo-600/20 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              Create Workspace
            </button>
          </div>

          {/* Workspaces List Grid */}
          {filteredWorkspaces.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              No workspaces match your search query.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredWorkspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl ${
                          ws.brandColor || 'bg-indigo-600'
                        } text-white flex items-center justify-center font-bold text-sm shadow-sm`}
                      >
                        {ws.initials || ws.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{ws.name}</h3>
                        <p className="text-[11px] text-slate-400">{ws.industry || 'General B2B'}</p>
                      </div>
                    </div>
                    {ws.isDefault && (
                      <span className="px-2 py-0.5 text-[10px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md">
                        Default
                      </span>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditWorkspace(ws)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Edit Workspace"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteWorkspaceItem(ws)}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Delete Workspace"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => setSelectedWsForDrawer(ws)}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Manage Access
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Member Modal */}
      <AddMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleCreateUser}
        workspaces={workspaces}
        defaultRole={addModalDefaultRole}
      />

      {/* Workspace Creation & Edit Modal */}
      <WorkspaceModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSave={handleSaveWorkspaceModal}
        workspaceToEdit={workspaceToEdit}
      />

      {/* Manage Access Modal */}
      <WorkspaceAssignModal
        isOpen={Boolean(selectedWsForDrawer)}
        onClose={() => setSelectedWsForDrawer(null)}
        workspace={selectedWsForDrawer}
        allUsers={users}
        onAssign={handleAssignWorkspaceUser}
      />
    </div>
  );
};
