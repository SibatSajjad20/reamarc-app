import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Building2,
  UserPlus,
  Plus,
  Shield,
  ChevronRight,
  Search,
  Edit2,
  Trash2,
  Loader2,
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useToast } from '../../context/ToastContext';
import { AddMemberModal } from './AddMemberModal';
import { WorkspaceAssignModal } from './WorkspaceAssignModal';
import { WorkspaceModal } from '../modals/WorkspaceModal';
import type { AdminMember, CreateMemberPayload } from '../../types/admin';
import type { Workspace } from '../../types';
import type { UserRole } from '../../types/auth';

const DEPARTMENTS = ['All Departments', 'Engineering', 'AI', 'Design', 'QA', 'Marketing', 'Operations'];

export const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'members' | 'workspaces'>('members');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'member'>('all');
  const [selectedDept, setSelectedDept] = useState<string>('All Departments');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState('');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalDefaultRole, setAddModalDefaultRole] = useState<UserRole>('member');
  const [selectedWsForDrawer, setSelectedWsForDrawer] = useState<Workspace | null>(null);

  // Workspace modal
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [workspaceToEdit, setWorkspaceToEdit] = useState<Workspace | null>(null);

  const { workspaces, saveWorkspace, deleteWorkspace, refetch: refetchWorkspaces } = useWorkspaces();
  const { addToast } = useToast();

  const fetchMembers = async () => {
    try {
      setIsLoadingMembers(true);
      const data = await adminService.getMembers();
      setMembers(data);
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to load team members', 'warning');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleOpenAddModal = (role?: UserRole) => {
    setAddModalDefaultRole(role || (roleFilter !== 'all' ? roleFilter : 'member'));
    setIsAddModalOpen(true);
  };

  const handleCreateMember = async (payload: CreateMemberPayload) => {
    await adminService.createMember(payload);
    addToast('Success', `Team member account created for ${payload.email}`, 'success');
    fetchMembers();
  };

  const handleToggleMemberStatus = async (member: AdminMember) => {
    try {
      const updated = await adminService.updateMember(member.id, { is_active: !member.is_active });
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
      addToast('Updated', `Account status for ${member.full_name} changed`, 'info');
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to update member status', 'warning');
    }
  };

  const handleChangeRole = async (member: AdminMember, newRole: UserRole) => {
    try {
      const updated = await adminService.updateMember(member.id, { role: newRole });
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
      addToast('Role Updated', `${member.full_name} is now an ${newRole}`, 'success');
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
      await fetchMembers();
      addToast('Assigned', `Updated workspace access`, 'success');
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to update assignment', 'warning');
    }
  };

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        m.full_name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.designation && m.designation.toLowerCase().includes(q)) ||
        (m.department && m.department.toLowerCase().includes(q));

      const matchesRole = roleFilter === 'all' || m.role === roleFilter;

      const matchesDept =
        selectedDept === 'All Departments' ||
        (m.department && m.department.toLowerCase() === selectedDept.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && m.is_active) ||
        (statusFilter === 'inactive' && !m.is_active);

      return matchesSearch && matchesRole && matchesDept && matchesStatus;
    });
  }, [members, searchQuery, roleFilter, selectedDept, statusFilter]);

  // Filtered workspaces
  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter(
      (ws) =>
        ws.name.toLowerCase().includes(workspaceSearchQuery.toLowerCase()) ||
        (ws.industry && ws.industry.toLowerCase().includes(workspaceSearchQuery.toLowerCase())) ||
        ws.id.toLowerCase().includes(workspaceSearchQuery.toLowerCase())
    );
  }, [workspaces, workspaceSearchQuery]);

  const adminCount = members.filter((m) => m.role === 'admin').length;
  const memberCount = members.filter((m) => m.role === 'member').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fadeIn select-none p-2 sm:p-4">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-500/20">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-zinc-900 dark:text-zinc-100">
              Admin Operations Center
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Manage organization team members, roles, permissions, and workspace access.
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'members'
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Team Members ({members.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('workspaces')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'workspaces'
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Workspaces ({workspaces.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: TEAM MEMBERS */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {/* Controls Bar: Role Tabs, Department Filter, Status Filter, Search, and Add Member CTA */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
            {/* Left Filter Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Role Segmented Buttons */}
              <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                {[
                  { key: 'all', label: 'All Members', count: members.length },
                  { key: 'member', label: 'Members', count: memberCount },
                  { key: 'admin', label: 'Admins', count: adminCount },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setRoleFilter(tab.key as any)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                      roleFilter === tab.key
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                        roleFilter === tab.key
                          ? 'bg-white/20 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Department Dropdown */}
              <div className="relative">
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-2xs"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d} className="bg-white dark:bg-zinc-900">
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
                {[
                  { id: 'all', label: 'All Status' },
                  { id: 'active', label: 'Active' },
                  { id: 'inactive', label: 'Inactive' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStatusFilter(s.id as any)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      statusFilter === s.id
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs font-bold'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Search & Add Member Button */}
            <div className="flex items-center gap-2.5 flex-1 sm:flex-initial min-w-[260px] justify-end">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search name, email, role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all shadow-2xs"
                />
              </div>

              <button
                type="button"
                onClick={() => handleOpenAddModal()}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-all shadow-sm shadow-indigo-600/20 hover:shadow-md hover:shadow-indigo-600/30 cursor-pointer shrink-0 select-none"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Member</span>
              </button>
            </div>
          </div>

          {/* Members Data Table */}
          <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
            {isLoadingMembers ? (
              <div className="p-16 flex flex-col items-center justify-center gap-3 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                <span className="text-xs font-medium">Loading team directory...</span>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-16 text-center text-xs text-zinc-400">
                No team members found matching criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-600 dark:text-zinc-300">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/60 text-[11px] font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-6 py-3.5">Member Name</th>
                      <th className="px-6 py-3.5">Role</th>
                      <th className="px-6 py-3.5">Department</th>
                      <th className="px-6 py-3.5">Designation</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Assigned Workspaces</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                    {filteredMembers.map((m) => (
                      <tr key={m.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition">
                        {/* Member Identity */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 uppercase">
                              {m.full_name.slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-bold text-zinc-900 dark:text-zinc-100">{m.full_name}</p>
                              <p className="text-[11px] text-zinc-400 font-mono">{m.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role Badge / Selector */}
                        <td className="px-6 py-4">
                          {m.role === 'admin' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-400/30">
                              <Shield className="w-3 h-3" />
                              <span>Admin</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                              <Users className="w-3 h-3" />
                              <span>Member</span>
                            </span>
                          )}
                        </td>

                        {/* Department Badge */}
                        <td className="px-6 py-4">
                          {m.department ? (
                            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700">
                              {m.department}
                            </span>
                          ) : (
                            <span className="text-zinc-400 dark:text-zinc-600">—</span>
                          )}
                        </td>

                        {/* Designation / Job Title */}
                        <td className="px-6 py-4">
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">
                            {m.designation || 'Team Contributor'}
                          </span>
                        </td>

                        {/* Status (Active / Disabled) */}
                        <td className="px-6 py-4">
                          {m.role === 'admin' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span>Active</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleMemberStatus(m)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition cursor-pointer ${
                                m.is_active
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-300'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${m.is_active ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                              <span>{m.is_active ? 'Active' : 'Disabled'}</span>
                            </button>
                          )}
                        </td>

                        {/* Assigned Workspaces */}
                        <td className="px-6 py-4">
                          {m.role === 'admin' ? (
                            <span className="px-2.5 py-1 text-[11px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg border border-purple-500/20">
                              Global Access (All Workspaces)
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {(m.workspace_ids && m.workspace_ids.length > 0) ? (
                                m.workspace_ids.map((wsId) => {
                                  const ws = workspaces.find((w) => w.id === wsId);
                                  return (
                                    <span
                                      key={wsId}
                                      className="px-2 py-0.5 text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md border border-zinc-200 dark:border-zinc-700"
                                    >
                                      {ws?.name || wsId}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-[11px] text-zinc-400 italic">No workspace assigned</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Row Actions */}
                        <td className="px-6 py-4 text-right">
                          {m.role === 'admin' ? (
                            <span className="text-xs font-medium text-zinc-400 italic">Immutable Admin</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleChangeRole(m, 'admin')}
                                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                              >
                                Promote to Admin
                              </button>
                              <span className="text-zinc-300 dark:text-zinc-700">|</span>
                              <button
                                type="button"
                                onClick={() => handleToggleMemberStatus(m)}
                                className={`text-xs font-semibold hover:underline cursor-pointer ${
                                  m.is_active ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                {m.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
            <div className="relative w-full sm:max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search workspaces by name or industry..."
                value={workspaceSearchQuery}
                onChange={(e) => setWorkspaceSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all shadow-2xs"
              />
            </div>
            <button
              type="button"
              onClick={handleOpenCreateWorkspace}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-all shadow-sm shadow-indigo-600/20 hover:shadow-md hover:shadow-indigo-600/30 cursor-pointer shrink-0 select-none"
            >
              <Plus className="w-4 h-4" />
              <span>Create Workspace</span>
            </button>
          </div>

          {/* Workspaces List Grid */}
          {filteredWorkspaces.length === 0 ? (
            <div className="p-16 text-center text-xs text-zinc-400 bg-white dark:bg-[#12141c] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
              No workspaces match your search query.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredWorkspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="p-5 bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs space-y-4 flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl ${
                          ws.brandColor || 'bg-indigo-600'
                        } text-white flex items-center justify-center font-bold text-sm shadow-2xs`}
                      >
                        {ws.initials || ws.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{ws.name}</h3>
                        <p className="text-[11px] text-zinc-400">{ws.industry || 'General B2B'}</p>
                      </div>
                    </div>
                    {ws.isDefault && (
                      <span className="px-2 py-0.5 text-[10px] font-extrabold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-md border border-indigo-500/20">
                        Default
                      </span>
                    )}
                  </div>

                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditWorkspace(ws)}
                        className="p-1.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                        title="Edit Workspace"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteWorkspaceItem(ws)}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                        title="Delete Workspace"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedWsForDrawer(ws)}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      <span>Manage Access</span>
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
        onSubmit={handleCreateMember}
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
        allUsers={members}
        onAssign={handleAssignWorkspaceUser}
      />
    </div>
  );
};
