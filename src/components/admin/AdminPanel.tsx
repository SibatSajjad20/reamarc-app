import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  UserPlus,
  Plus,
  Shield,
  Search,
  Edit2,
  Trash2,
  Loader2,
  Layers,
  ChevronDown,
  Briefcase,
  Check,
  Settings2,
  Bell,
  Mail,
  MessageSquare,
  Clock,
  Phone,
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useDesignations } from '../../hooks/useDesignations';
import { useToast } from '../../context/ToastContext';
import { AddMemberModal } from './AddMemberModal';
import { EditMemberModal } from './EditMemberModal';
import { ManageDesignationsModal } from './ManageDesignationsModal';
import { WorkspaceModal } from '../modals/WorkspaceModal';
import { AdAccountCredentialsModal } from '../modals/AdAccountCredentialsModal';
import type { AdminMember, CreateMemberPayload, UpdateMemberPayload, MemberActivity } from '../../types/admin';
import type { Workspace } from '../../types';
import type { UserRole } from '../../types/auth';

export const AdminPanel: React.FC = () => {
  const { designations } = useDesignations();
  const [activeTab, setActiveTab] = useState<'members' | 'ad_accounts'>('members');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'member'>('all');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('All Designations');
  const [isDesignationMenuOpen, setIsDesignationMenuOpen] = useState(false);
  const designationMenuRef = useRef<HTMLDivElement>(null);

  const [members, setMembers] = useState<AdminMember[]>([]);
  const [activities, setActivities] = useState<Record<string, MemberActivity>>({});
  const [isLoadingMembers, setIsLoadingMembers] = useState<boolean>(true);
  const [isSendingReminder, setIsSendingReminder] = useState<Record<string, boolean>>({});
  const [openReminderMenuId, setOpenReminderMenuId] = useState<string | null>(null);
  const reminderMenuRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [accountSearchQuery, setAccountSearchQuery] = useState('');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<AdminMember | null>(null);
  const [isManageDesignationsOpen, setIsManageDesignationsOpen] = useState(false);
  const [addModalDefaultRole, setAddModalDefaultRole] = useState<UserRole>('member');

  // Ad Account modals
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<Workspace | null>(null);

  const { workspaces, saveWorkspace, deleteWorkspace, refetch: refetchWorkspaces } = useWorkspaces();
  const { addToast } = useToast();

  const fetchMembers = async () => {
    try {
      setIsLoadingMembers(true);
      const [membersRes, activitiesRes] = await Promise.allSettled([
        adminService.getMembers(),
        adminService.getMembersActivity(7),
      ]);

      if (membersRes.status === 'fulfilled') {
        setMembers(membersRes.value);
      } else {
        addToast('Error', 'Failed to load team members', 'warning');
      }

      if (activitiesRes.status === 'fulfilled') {
        const actMap: Record<string, MemberActivity> = {};
        activitiesRes.value.forEach((a) => {
          actMap[a.user_id] = a;
        });
        setActivities(actMap);
      }
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to load directory data', 'warning');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  // Click outside listener for custom dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (designationMenuRef.current && !designationMenuRef.current.contains(event.target as Node)) {
        setIsDesignationMenuOpen(false);
      }
      if (reminderMenuRef.current && !reminderMenuRef.current.contains(event.target as Node)) {
        setOpenReminderMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const handleOpenEditMember = (member: AdminMember) => {
    setMemberToEdit(member);
    setIsEditModalOpen(true);
  };

  const handleUpdateMember = async (userId: string, payload: UpdateMemberPayload) => {
    try {
      const updated = await adminService.updateMember(userId, payload);
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, ...updated } : m)));
      addToast('Success', `Account details for "${updated.full_name}" updated!`, 'success');
      fetchMembers();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to update member details', 'warning');
      throw err;
    }
  };

  const handleDeleteMember = async (member: AdminMember) => {
    if (member.role === 'admin') {
      addToast('Prohibited', 'Master Administrator accounts are protected and cannot be deleted.', 'warning');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete member "${member.full_name}"?`)) {
      return;
    }
    try {
      await adminService.deleteMember(member.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      addToast('Deleted', `Team member "${member.full_name}" has been removed from database.`, 'info');
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to delete team member', 'warning');
    }
  };

  const handleSendEmailReminder = async (member: AdminMember) => {
    try {
      setIsSendingReminder((prev) => ({ ...prev, [member.id]: true }));
      setOpenReminderMenuId(null);
      const res = await adminService.sendMemberReminder(member.id, { channel: 'email' });
      addToast('Email Dispatched', res.message || `Reminder email sent to ${member.email}`, 'success');
    } catch (err: any) {
      addToast('Reminder Failed', err.message || 'Failed to dispatch email reminder', 'warning');
    } finally {
      setIsSendingReminder((prev) => ({ ...prev, [member.id]: false }));
    }
  };

  const handleRemindWhatsApp = (member: AdminMember) => {
    setOpenReminderMenuId(null);
    const act = activities[member.id];
    const missingStr = act?.missing_dates?.length ? act.missing_dates.join(', ') : 'today';
    const text = `Hi ${member.full_name}, this is a reminder from Reamarc Workspace to submit your Daily Work Log for ${missingStr}. Please log your entries here: ${window.location.origin}/daily-log`;

    if (member.phone && member.phone.trim()) {
      const cleanPhone = member.phone.replace(/[^0-9]/g, '');
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
      addToast('WhatsApp Opened', `Opening WhatsApp chat with ${member.full_name}`, 'info');
    } else {
      const phoneInput = window.prompt(
        `No phone number on file for ${member.full_name}.\nEnter phone with country code (e.g. 923001234567) to open WhatsApp, or cancel to copy text:`,
        ''
      );
      if (phoneInput && phoneInput.trim()) {
        const cleanPhone = phoneInput.replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
      } else {
        navigator.clipboard.writeText(text);
        addToast('Copied to Clipboard', 'Reminder text copied! You can paste it into WhatsApp.', 'info');
      }
    }
  };

  const handleOpenCreateAccount = () => {
    setIsCredsModalOpen(true);
  };

  const handleOpenEditAccount = (acc: Workspace) => {
    setAccountToEdit(acc);
    setIsAccountModalOpen(true);
  };

  const handleSaveAccountModal = async (data: { name: string; initials?: string; brandColor?: string; industry?: string; platform?: string }) => {
    try {
      const res = await saveWorkspace(accountToEdit, data);
      addToast('Success', res.isNew ? `Ad Account "${data.name}" added!` : `Ad Account "${data.name}" updated!`, 'success');
      refetchWorkspaces();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to save ad account', 'warning');
    }
  };

  const handleDeleteAccountItem = async (acc: Workspace) => {
    if (!window.confirm(`Are you sure you want to remove Ad Account "${acc.name}"?`)) {
      return;
    }
    try {
      await deleteWorkspace(acc.id);
      addToast('Deleted', `Ad Account "${acc.name}" removed`, 'info');
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to delete ad account', 'warning');
    }
  };

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        m.full_name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.phone && m.phone.toLowerCase().includes(q)) ||
        (m.designation && m.designation.toLowerCase().includes(q));

      const matchesRole = roleFilter === 'all' || m.role === roleFilter;

      const matchesDesignation =
        selectedDesignation === 'All Designations' ||
        (m.designation && m.designation.toLowerCase() === selectedDesignation.toLowerCase());

      return matchesSearch && matchesRole && matchesDesignation;
    });
  }, [members, searchQuery, roleFilter, selectedDesignation]);

  // Filtered ad accounts (Sorted Alphabetically A-Z)
  const filteredAccounts = useMemo(() => {
    const list = workspaces.filter(
      (ws) =>
        ws.name.toLowerCase().includes(accountSearchQuery.toLowerCase()) ||
        (ws.industry && ws.industry.toLowerCase().includes(accountSearchQuery.toLowerCase())) ||
        (ws.platform && ws.platform.toLowerCase().includes(accountSearchQuery.toLowerCase())) ||
        ws.id.toLowerCase().includes(accountSearchQuery.toLowerCase())
    );
    return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [workspaces, accountSearchQuery]);

  const adminCount = members.filter((m) => m.role === 'admin').length;
  const memberCount = members.filter((m) => m.role === 'member').length;

  const allDesignationFilterOptions = ['All Designations', ...designations];

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
              Manage organization team members, designations, activity reminders, and client ad accounts.
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
            <span>Team Directory ({members.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ad_accounts')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'ad_accounts'
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Ad Accounts & Brands ({workspaces.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: TEAM MEMBERS */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {/* Controls Bar: Role Tabs, Designation Filter, Search, and Add Member CTA */}
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

              {/* Modern Designation Dropdown Popover with Edit/Manage Button */}
              <div className="relative" ref={designationMenuRef}>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsDesignationMenuOpen(!isDesignationMenuOpen)}
                    className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-xl px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-all shadow-2xs cursor-pointer select-none"
                  >
                    <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{selectedDesignation}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-150 ${isDesignationMenuOpen ? 'rotate-180 text-indigo-500' : ''}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsManageDesignationsOpen(true)}
                    className="p-2 text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-xl transition shadow-2xs cursor-pointer"
                    title="Edit / Add Designations"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isDesignationMenuOpen && (
                  <div className="absolute left-0 top-full mt-1.5 z-50 w-56 bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-1.5 space-y-0.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
                    <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
                      {allDesignationFilterOptions.map((d) => {
                        const isSelected = selectedDesignation === d;
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              setSelectedDesignation(d);
                              setIsDesignationMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <span className="truncate">{d}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>

                    <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800/80 mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDesignationMenuOpen(false);
                          setIsManageDesignationsOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition cursor-pointer"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        <span>Manage Designations...</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Search & Add Member Button */}
            <div className="flex items-center gap-2.5 flex-1 sm:flex-initial min-w-[260px] justify-end">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name, email, phone, designation..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all shadow-2xs"
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
                <span className="text-xs font-medium">Loading team directory & activity...</span>
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
                      <th className="px-6 py-3.5">Designation</th>
                      <th className="px-6 py-3.5">Activity / Log Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                    {filteredMembers.map((m) => {
                      const act = activities[m.id];
                      const isReminderSending = isSendingReminder[m.id];
                      const isMenuOpen = openReminderMenuId === m.id;

                      return (
                        <tr key={m.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition">
                          {/* Member Identity */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 uppercase shadow-2xs">
                                {m.full_name.slice(0, 2)}
                              </div>
                              <div>
                                <p className="font-bold text-zinc-900 dark:text-zinc-100">{m.full_name}</p>
                                <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
                                  <span>{m.email}</span>
                                  {m.phone && (
                                    <span className="flex items-center gap-0.5 text-zinc-400">
                                      <Phone className="w-2.5 h-2.5" />
                                      <span>{m.phone}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Role Badge */}
                          <td className="px-6 py-4">
                            {m.role === 'admin' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-400/30 shadow-2xs">
                                <Shield className="w-3 h-3" />
                                <span>Admin</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-2xs">
                                <Users className="w-3 h-3" />
                                <span>Member</span>
                              </span>
                            )}
                          </td>

                          {/* Designation / Job Title */}
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-2xs">
                              {m.designation || 'Web Development'}
                            </span>
                          </td>

                          {/* Activity / Last Logged Status */}
                          <td className="px-6 py-4">
                            {m.role === 'admin' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/50">
                                <span>Exempt (Admin)</span>
                              </span>
                            ) : act ? (
                              act.logged_today ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-2xs">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  <span>Logged Today</span>
                                </span>
                              ) : act.days_missed === 1 ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shadow-2xs">
                                  <Clock className="w-3 h-3 text-amber-500" />
                                  <span>1 Day Missed</span>
                                </span>
                              ) : act.days_missed > 1 ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 shadow-2xs">
                                  <Clock className="w-3 h-3 text-rose-500" />
                                  <span>{act.days_missed} Days Missed</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800/60">
                                  Up to date
                                </span>
                              )
                            ) : (
                              <span className="text-zinc-400 text-xs">—</span>
                            )}
                          </td>

                          {/* Row Actions: Remind, Edit & Delete */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Remind Action Popover (for members with missing logs) */}
                              {m.role !== 'admin' && (
                                <div className="relative" ref={isMenuOpen ? reminderMenuRef : undefined}>
                                  <button
                                    type="button"
                                    onClick={() => setOpenReminderMenuId(isMenuOpen ? null : m.id)}
                                    disabled={isReminderSending}
                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50 ${
                                      act && !act.logged_today
                                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 border border-amber-500/30'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                    }`}
                                    title="Send Daily Log Reminder"
                                  >
                                    {isReminderSending ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                    ) : (
                                      <Bell className="w-3.5 h-3.5" />
                                    )}
                                    <span>Remind</span>
                                    <ChevronDown className="w-3 h-3" />
                                  </button>

                                  {isMenuOpen && (
                                    <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-1.5 space-y-1 text-left backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
                                      <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                        Send Reminder Via
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleSendEmailReminder(m)}
                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer"
                                      >
                                        <Mail className="w-3.5 h-3.5 text-indigo-500" />
                                        <span>Email Reminder</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemindWhatsApp(m)}
                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer"
                                      >
                                        <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                                        <span>1-Click WhatsApp</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Edit Button */}
                              <button
                                type="button"
                                onClick={() => handleOpenEditMember(m)}
                                className="p-1.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition cursor-pointer"
                                title={`Edit ${m.full_name}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              {/* Delete Button (Protected for Admin) */}
                              {m.role === 'admin' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800/60 shadow-2xs">
                                  <Shield className="w-3 h-3" />
                                  <span>Protected Admin</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMember(m)}
                                  className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                  title={`Delete member ${m.full_name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: AD ACCOUNTS & CLIENT BRANDS */}
      {activeTab === 'ad_accounts' && (
        <div className="space-y-6">
          {/* Ad Accounts Search & Create CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
            <div className="relative w-full sm:max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search ad accounts by brand, platform, or industry..."
                value={accountSearchQuery}
                onChange={(e) => setAccountSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all shadow-2xs"
              />
            </div>
            <button
              type="button"
              onClick={handleOpenCreateAccount}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-all shadow-sm shadow-indigo-600/20 hover:shadow-md hover:shadow-indigo-600/30 cursor-pointer shrink-0 select-none"
            >
              <Plus className="w-4 h-4" />
              <span>Connect Ad Account</span>
            </button>
          </div>

          {/* Ad Accounts Grid */}
          {filteredAccounts.length === 0 ? (
            <div className="p-16 text-center text-xs text-zinc-400 bg-white dark:bg-[#12141c] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
              No ad accounts match your search query.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="p-5 bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs space-y-4 flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl ${
                          acc.brandColor || 'bg-indigo-600'
                        } text-white flex items-center justify-center font-bold text-sm shadow-2xs`}
                      >
                        {acc.initials || acc.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{acc.name}</h3>
                        <p className="text-[11px] text-zinc-400">{acc.industry || 'General B2B'}</p>
                      </div>
                    </div>
                    {acc.isDefault && (
                      <span className="px-2 py-0.5 text-[10px] font-extrabold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-md border border-indigo-500/20">
                        Default
                      </span>
                    )}
                  </div>

                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                    <div>
                      {(() => {
                        const nameLower = (acc.name || '').toLowerCase();
                        const pLower = (acc.platform || '').toLowerCase();
                        const isMulti =
                          (pLower.includes('google') && pLower.includes('meta')) ||
                          nameLower.includes('ed&c') ||
                          nameLower.includes('ednc') ||
                          nameLower.includes('elegant design');

                        if (isMulti) {
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                                Meta Ads
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                Google Ads
                              </span>
                            </div>
                          );
                        }

                        if (pLower.includes('google')) {
                          return (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                              Google Ads
                            </span>
                          );
                        }

                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                            Meta Ads
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditAccount(acc)}
                        className="p-1.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                        title="Edit Ad Account"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAccountItem(acc)}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                        title="Delete Ad Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
        defaultRole={addModalDefaultRole}
      />

      {/* Edit Member Modal */}
      <EditMemberModal
        isOpen={isEditModalOpen}
        member={memberToEdit}
        onClose={() => {
          setIsEditModalOpen(false);
          setMemberToEdit(null);
        }}
        onSubmit={handleUpdateMember}
      />

      {/* Manage Designations Modal */}
      <ManageDesignationsModal
        isOpen={isManageDesignationsOpen}
        onClose={() => setIsManageDesignationsOpen(false)}
      />

      {/* Edit Ad Account Modal */}
      <WorkspaceModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onSave={handleSaveAccountModal}
        workspaceToEdit={accountToEdit}
      />

      {/* Connect Ad Account / Credentials Modal */}
      <AdAccountCredentialsModal
        isOpen={isCredsModalOpen}
        onClose={() => {
          setIsCredsModalOpen(false);
          refetchWorkspaces();
        }}
        workspaces={workspaces}
      />
    </div>
  );
};
