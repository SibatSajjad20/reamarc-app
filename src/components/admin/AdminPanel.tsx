import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { adminService } from '../../services/adminService';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { AdminSidebarNav } from './AdminSidebarNav';
import type { AdminSectionType } from './AdminSidebarNav';
import { UserManagementSection } from './sections/UserManagementSection';
import { ComplianceRemindersSection } from './sections/ComplianceRemindersSection';
import { AttendancePoliciesSection } from './sections/AttendancePoliciesSection';
import { WorkspacesSection } from './sections/WorkspacesSection';
import { AdAccountsSection } from './sections/AdAccountsSection';
import { AddMemberModal } from './AddMemberModal';
import { EditMemberModal } from './EditMemberModal';
import { WorkspaceModal } from '../modals/WorkspaceModal';
import { AdAccountModal } from '../modals/AdAccountModal';
import { AdAccountCredentialsModal } from '../modals/AdAccountCredentialsModal';
import type {
  AdminMember,
  CreateMemberPayload,
  UpdateMemberPayload,
  MemberActivity,
  AdAccount,
  CreateAdAccountPayload,
  UpdateAdAccountPayload,
} from '../../types/admin';
import type { Workspace } from '../../types';

export const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isOperations = user?.role === 'operations';

  const canManageMembers = isAdmin || isHR;
  const canManageWorkspaces = isAdmin || isOperations;
  const canManageAdAccounts = isAdmin;

  const [activeSection, setActiveSection] = useState<AdminSectionType>('directory');

  // Members & Activities
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [activities, setActivities] = useState<Record<string, MemberActivity>>({});
  const [isLoadingMembers, setIsLoadingMembers] = useState<boolean>(true);
  const [isSendingReminder, setIsSendingReminder] = useState<Record<string, boolean>>({});

  // Workspaces (from hook)
  const { workspaces, saveWorkspace, refetch: refetchWorkspaces } = useWorkspaces();

  // Ad Accounts (separate collection & state)
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);

  // Modals for Members
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<AdminMember | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<AdminMember | null>(null);

  // Modals for Workspaces
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [workspaceToEdit, setWorkspaceToEdit] = useState<Workspace | null>(null);

  // Modals for Ad Accounts
  const [isAdAccountModalOpen, setIsAdAccountModalOpen] = useState(false);
  const [adAccountToEdit, setAdAccountToEdit] = useState<AdAccount | null>(null);
  const [adAccountToDelete, setAdAccountToDelete] = useState<AdAccount | null>(null);

  // Credentials Modal for Ad Account
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [selectedAdAccountForCreds, setSelectedAdAccountForCreds] = useState<AdAccount | null>(null);

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
        addToast('Error', 'Failed to load team members directory', 'warning');
      }

      if (activitiesRes.status === 'fulfilled') {
        const actMap: Record<string, MemberActivity> = {};
        activitiesRes.value.forEach((a) => {
          actMap[a.user_id] = a;
        });
        setActivities(actMap);
      }
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to load administrative data', 'warning');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const fetchAdAccounts = useCallback(async () => {
    try {
      const accounts = await adminService.getAdAccounts();
      setAdAccounts(accounts || []);
    } catch (err: any) {
      console.error('Failed to load ad accounts:', err);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
    fetchAdAccounts();
  }, [fetchAdAccounts]);

  // --- Member Handlers ---
  const handleCreateMember = async (payload: CreateMemberPayload) => {
    await adminService.createMember(payload);
    addToast('Member Created', `${payload.full_name} has been added to directory.`, 'success');
    await fetchMembers();
  };

  const handleUpdateMember = async (userId: string, payload: UpdateMemberPayload) => {
    await adminService.updateMember(userId, payload);
    addToast('Profile Updated', 'Team member details successfully saved.', 'success');
    await fetchMembers();
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;
    try {
      await adminService.deleteMember(memberToDelete.id);
      addToast('Member Removed', `${memberToDelete.full_name} was removed from directory.`, 'info');
      setMemberToDelete(null);
      await fetchMembers();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to delete member', 'warning');
    }
  };

  const handleSendReminder = async (
    userId: string,
    channel: 'email' | 'in_app' | 'all' = 'email',
    customMessage?: string
  ) => {
    try {
      setIsSendingReminder((prev) => ({ ...prev, [userId]: true }));
      const res = await adminService.sendMemberReminder(userId, { channel, custom_message: customMessage });
      addToast('Reminder Dispatched', res.message, 'success');
      await fetchMembers();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to dispatch reminder', 'warning');
    } finally {
      setIsSendingReminder((prev) => ({ ...prev, [userId]: false }));
    }
  };

  // --- Workspace Handlers ---
  const handleSaveWorkspace = async (data: any) => {
    await saveWorkspace(workspaceToEdit, data);
    addToast('Workspace Saved', 'Client workspace profile successfully saved.', 'success');
    setIsWorkspaceModalOpen(false);
    setWorkspaceToEdit(null);
    await refetchWorkspaces();
  };

  const handleToggleWorkspaceStatus = async (workspace: Workspace) => {
    const newStatus = workspace.status === 'inactive' ? 'active' : 'inactive';
    try {
      await saveWorkspace(workspace, { status: newStatus });
      addToast('Status Updated', `${workspace.name} is now ${newStatus}.`, 'success');
      await refetchWorkspaces();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to update workspace status', 'warning');
    }
  };

  // --- Ad Account Handlers ---
  const handleSaveAdAccount = async (
    payload: CreateAdAccountPayload | UpdateAdAccountPayload,
    accountId?: string
  ) => {
    if (accountId) {
      await adminService.updateAdAccount(accountId, payload as UpdateAdAccountPayload);
      addToast('Ad Account Updated', 'Advertising account details saved.', 'success');
    } else {
      await adminService.createAdAccount(payload as CreateAdAccountPayload);
      addToast('Ad Account Created', 'New advertising account created.', 'success');
    }
    setIsAdAccountModalOpen(false);
    setAdAccountToEdit(null);
    await fetchAdAccounts();
  };

  const handleDeleteAdAccount = async () => {
    if (!adAccountToDelete) return;
    try {
      await adminService.deleteAdAccount(adAccountToDelete.id);
      addToast('Ad Account Removed', `${adAccountToDelete.name} was removed.`, 'info');
      setAdAccountToDelete(null);
      await fetchAdAccounts();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to delete ad account', 'warning');
    }
  };

  const missingLogsCount = useMemo(() => {
    return Object.values(activities).filter(
      (a) =>
        a.role !== 'admin' &&
        a.role !== 'hr' &&
        a.role !== 'operations' &&
        a.role !== 'client' &&
        (!a.logged_today || a.days_missed > 0)
    ).length;
  }, [activities]);

  return (
    <div className="flex flex-col h-full w-full bg-zinc-50 dark:bg-[#090a0f] overflow-hidden">
      <AdminSidebarNav
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        memberCount={members.length}
        workspaceCount={workspaces.length}
        adAccountCount={adAccounts.length}
        missingLogsCount={missingLogsCount}
        isAdmin={isAdmin}
        userRole={user?.role}
      />

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      {activeSection === 'directory' && (
        <UserManagementSection
          members={members}
          isLoading={isLoadingMembers}
          onAddMember={() => setIsAddModalOpen(true)}
          onEditMember={(m) => {
            setMemberToEdit(m);
            setIsEditModalOpen(true);
          }}
          onDeleteMember={(m) => setMemberToDelete(m)}
          canManageMembers={canManageMembers}
        />
      )}

      {activeSection === 'compliance' && (
        <ComplianceRemindersSection
          activities={activities}
          isLoading={isLoadingMembers}
          onSendReminder={handleSendReminder}
          isSendingReminder={isSendingReminder}
        />
      )}

      {activeSection === 'workspaces' && (
        <WorkspacesSection
          workspaces={workspaces}
          adAccounts={adAccounts}
          onAddWorkspace={() => {
            setWorkspaceToEdit(null);
            setIsWorkspaceModalOpen(true);
          }}
          onEditWorkspace={(ws) => {
            setWorkspaceToEdit(ws);
            setIsWorkspaceModalOpen(true);
          }}
          onToggleStatus={handleToggleWorkspaceStatus}
          canManageWorkspaces={canManageWorkspaces}
        />
      )}

      {activeSection === 'ad_accounts' && (
        <AdAccountsSection
          adAccounts={adAccounts}
          workspaces={workspaces}
          onAddAccount={() => {
            setAdAccountToEdit(null);
            setIsAdAccountModalOpen(true);
          }}
          onEditAccount={(acc) => {
            setAdAccountToEdit(acc);
            setIsAdAccountModalOpen(true);
          }}
          onDeleteAccount={(acc) => setAdAccountToDelete(acc)}
          canManageAdAccounts={canManageAdAccounts}
        />
      )}

      {activeSection === 'attendance_policies' && (
        <AttendancePoliciesSection />
      )}
      </div>

      {/* ─── MODALS ─── */}

      {/* Member Modals */}
      {isAddModalOpen && (
        <AddMemberModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={handleCreateMember}
        />
      )}

      {isEditModalOpen && memberToEdit && (
        <EditMemberModal
          isOpen={isEditModalOpen}
          member={memberToEdit}
          onClose={() => {
            setIsEditModalOpen(false);
            setMemberToEdit(null);
          }}
          onSubmit={handleUpdateMember}
        />
      )}

      {/* Workspace Modal */}
      {isWorkspaceModalOpen && (
        <WorkspaceModal
          isOpen={isWorkspaceModalOpen}
          workspaceToEdit={workspaceToEdit}
          onClose={() => {
            setIsWorkspaceModalOpen(false);
            setWorkspaceToEdit(null);
          }}
          onSave={handleSaveWorkspace}
        />
      )}

      {/* Ad Account Modal */}
      {isAdAccountModalOpen && (
        <AdAccountModal
          isOpen={isAdAccountModalOpen}
          adAccountToEdit={adAccountToEdit}
          workspaces={workspaces}
          onClose={() => {
            setIsAdAccountModalOpen(false);
            setAdAccountToEdit(null);
          }}
          onSave={handleSaveAdAccount}
        />
      )}

      {/* API Credentials Modal */}
      {isCredsModalOpen && selectedAdAccountForCreds && (
        <AdAccountCredentialsModal
          isOpen={isCredsModalOpen}
          selectedWorkspace={
            selectedAdAccountForCreds.workspace_id
              ? workspaces.find((w) => w.id === selectedAdAccountForCreds.workspace_id) || null
              : null
          }
          workspaces={workspaces}
          onClose={() => {
            setIsCredsModalOpen(false);
            setSelectedAdAccountForCreds(null);
          }}
        />
      )}

      {/* Delete Member Confirmation */}
      {memberToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Remove {memberToDelete.full_name}?
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              This will permanently revoke access and remove the user account from the directory.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMemberToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMember}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs"
              >
                Delete Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Ad Account Confirmation */}
      {adAccountToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Delete Ad Account "{adAccountToDelete.name}"?
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              This will remove this advertising account configuration and platform credentials.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdAccountToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAdAccount}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs"
              >
                Delete Ad Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
