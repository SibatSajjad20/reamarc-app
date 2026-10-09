import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/adminService';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import type { AdminSectionType } from '../../types/admin';
import { UserManagementSection } from './sections/UserManagementSection';
import { ComplianceRemindersSection } from './sections/ComplianceRemindersSection';
import { WorkspacesSection } from './sections/WorkspacesSection';
import { AddMemberModal } from './AddMemberModal';
import { EditMemberModal } from './EditMemberModal';
import { WorkspaceModal } from '../modals/WorkspaceModal';
import type { UserRole } from '../../types/auth';
import type {
  AdminMember,
  CreateMemberPayload,
  UpdateMemberPayload,
  MemberActivity,
  AdAccount,
} from '../../types/admin';
import type { Workspace } from '../../types';

export interface AdminPanelProps {
  activeSection?: AdminSectionType;
  onSectionChange?: (section: AdminSectionType) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  activeSection: propActiveSection,
  onSectionChange,
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isOperations = user?.role === 'operations';

  const canManageMembers = isAdmin || isHR;
  const canManageWorkspaces = isAdmin || isOperations;

  const [activeSection, setActiveSection] = useState<AdminSectionType>(() => {
    return propActiveSection || 'directory';
  });

  useEffect(() => {
    if (propActiveSection && propActiveSection !== activeSection) {
      setActiveSection(propActiveSection);
    }
  }, [propActiveSection, activeSection]);

  useEffect(() => {
    if (isHR && activeSection !== 'directory') {
      setActiveSection('directory');
    } else if (isOperations && activeSection === 'compliance') {
      setActiveSection('directory');
    }
  }, [user?.role, activeSection, isHR, isOperations]);

  const initialMembers = adminService.getCachedMembers()?.data || [];
  const initialActivitiesList = adminService.getCachedActivities()?.data || [];
  const initialActMap: Record<string, MemberActivity> = {};
  initialActivitiesList.forEach((a) => {
    initialActMap[a.user_id] = a;
  });
  const initialAdAccounts = adminService.getCachedAdAccounts()?.data || [];
  const hasCached = adminService.hasInitialCache();

  // Members & Activities
  const [members, setMembers] = useState<AdminMember[]>(() => initialMembers);
  const [activities, setActivities] = useState<Record<string, MemberActivity>>(() => initialActMap);
  const [isLoadingMembers, setIsLoadingMembers] = useState<boolean>(!hasCached);
  const [isSendingReminder, setIsSendingReminder] = useState<Record<string, boolean>>({});

  // Workspaces (from hook)
  const { workspaces, saveWorkspace, refetch: refetchWorkspaces } = useWorkspaces();

  // Ad Accounts (read-only for KPI counts in directory)
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>(() => initialAdAccounts);

  // Modals for Members
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMemberDefaultRole, setAddMemberDefaultRole] = useState<UserRole>('team_member');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<AdminMember | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<AdminMember | null>(null);

  // Modals for Workspaces
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [workspaceToEdit, setWorkspaceToEdit] = useState<Workspace | null>(null);

  const { addToast } = useToast();

  const handleSelectSection = (section: AdminSectionType) => {
    setActiveSection(section);
    onSectionChange?.(section);
  };

  const fetchMembers = useCallback(async () => {
    try {
      const res = await adminService.getMembers();
      setMembers(res || []);
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to load members', 'error');
    }
  }, [addToast]);

  const fetchActivities = useCallback(async () => {
    try {
      const res = await adminService.getMembersActivity();
      const map: Record<string, MemberActivity> = {};
      (res || []).forEach((a: MemberActivity) => {
        map[a.user_id] = a;
      });
      setActivities(map);
    } catch {
      // Activity fetch failure non-fatal
    }
  }, []);

  const fetchAdAccounts = useCallback(async () => {
    try {
      const res = await adminService.getAdAccounts();
      setAdAccounts(res || []);
    } catch {
      // Ad accounts fetch failure non-fatal
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadAll = async () => {
      if (!hasCached) setIsLoadingMembers(true);
      await Promise.allSettled([fetchMembers(), fetchActivities(), fetchAdAccounts()]);
      if (isMounted) setIsLoadingMembers(false);
    };
    void loadAll();
    return () => {
      isMounted = false;
    };
  }, [fetchMembers, fetchActivities, fetchAdAccounts, hasCached]);

  // --- Member Handlers ---
  const handleCreateMember = async (payload: CreateMemberPayload) => {
    try {
      await adminService.createMember(payload);
      addToast('Member Added', `${payload.full_name} was invited successfully.`, 'success');
      setIsAddModalOpen(false);
      await fetchMembers();
    } catch (err: any) {
      addToast('Failed to Add Member', err.message || 'Please check the details.', 'error');
    }
  };

  const handleUpdateMember = async (userId: string, payload: UpdateMemberPayload) => {
    try {
      await adminService.updateMember(userId, payload);
      addToast('Member Updated', 'Profile changes saved.', 'success');
      setIsEditModalOpen(false);
      setMemberToEdit(null);
      await fetchMembers();
    } catch (err: any) {
      addToast('Update Failed', err.message || 'Could not save member.', 'error');
    }
  };

  const handleToggleMemberStatus = async (member: AdminMember) => {
    const nextState = !member.is_active;
    try {
      await adminService.updateMember(member.id, { is_active: nextState });
      addToast(
        nextState ? 'Member Activated' : 'Member Deactivated',
        `${member.full_name} is now ${nextState ? 'active' : 'inactive'}.`,
        nextState ? 'success' : 'warning'
      );
      await fetchMembers();
    } catch (err: any) {
      addToast('Status Change Failed', err.message, 'error');
    }
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;
    try {
      await adminService.deleteMember(memberToDelete.id);
      addToast('Member Removed', `${memberToDelete.full_name} has been removed.`, 'info');
      setMemberToDelete(null);
      await fetchMembers();
    } catch (err: any) {
      addToast('Deletion Failed', err.message, 'error');
    }
  };

  const handleSendReminder = async (userId: string) => {
    setIsSendingReminder((prev) => ({ ...prev, [userId]: true }));
    try {
      await adminService.sendMemberReminder(userId);
      addToast('Reminder Sent', 'Daily log compliance alert dispatched.', 'success');
    } catch (err: any) {
      addToast('Reminder Failed', err.message || 'Could not send reminder.', 'error');
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
      addToast('Error', err.message || 'Failed to update workspace status', 'error');
    }
  };

  return (
    <div className="flex h-full w-full bg-canvas text-fg overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeSection === 'directory' && (
          <UserManagementSection
            members={members}
            workspaces={workspaces}
            adAccounts={adAccounts}
            isLoading={isLoadingMembers}
            onAddMember={(role) => {
              setAddMemberDefaultRole(role || 'team_member');
              setIsAddModalOpen(true);
            }}
            onEditMember={(m) => {
              setMemberToEdit(m);
              setIsEditModalOpen(true);
            }}
            onDeleteMember={(m) => setMemberToDelete(m)}
            onToggleStatus={handleToggleMemberStatus}
            onNavigateSection={handleSelectSection}
            canManageMembers={canManageMembers}
          />
        )}

        {activeSection === 'compliance' && isAdmin && (
          <ComplianceRemindersSection
            activities={activities}
            isLoading={isLoadingMembers}
            onSendReminder={handleSendReminder}
            isSendingReminder={isSendingReminder}
          />
        )}

        {activeSection === 'workspaces' && (isAdmin || isOperations) && (
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
            members={members}
          />
        )}
      </div>

      {/* ─── MODALS ─── */}

      {/* Member Modals */}
      {isAddModalOpen && (
        <AddMemberModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={handleCreateMember}
          defaultRole={addMemberDefaultRole}
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

      {/* Delete Member Confirmation */}
      {memberToDelete && (
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl p-6 max-w-sm w-full shadow-lg space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-semibold text-fg">
              Remove {memberToDelete.full_name}?
            </h3>
            <p className="text-xs text-fg-muted leading-relaxed">
              This permanently deletes their account, Daily Log entries, Exception inbox items,
              attendance punches, and leave records. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMemberToDelete(null)}
                className="px-3 py-1.5 rounded-md border border-border text-xs font-medium text-fg hover:bg-hover transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMember}
                className="px-3 py-1.5 rounded-md bg-danger text-white text-xs font-medium hover:bg-danger/90 transition cursor-pointer shadow-xs"
              >
                Delete member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
