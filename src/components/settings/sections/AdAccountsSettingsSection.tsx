import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '@/services/adminService';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useToast } from '@/context/ToastContext';
import { AdAccountsSection } from '@/components/admin/sections/AdAccountsSection';
import { AdAccountModal } from '@/components/modals/AdAccountModal';
import { AdAccountCredentialsModal } from '@/components/modals/AdAccountCredentialsModal';
import type {
  AdAccount,
  CreateAdAccountPayload,
  UpdateAdAccountPayload,
} from '@/types/admin';

export const AdAccountsSettingsSection: React.FC = () => {
  const { addToast } = useToast();
  const { workspaces } = useWorkspaces();

  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [isAdAccountModalOpen, setIsAdAccountModalOpen] = useState(false);
  const [adAccountToEdit, setAdAccountToEdit] = useState<AdAccount | null>(null);

  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [selectedAdAccountForCreds, setSelectedAdAccountForCreds] = useState<AdAccount | null>(null);

  const fetchAdAccounts = useCallback(async () => {
    try {
      const res = await adminService.getAdAccounts();
      setAdAccounts(res || []);
    } catch {
      // Failed to load
    }
  }, []);

  useEffect(() => {
    void fetchAdAccounts();
  }, [fetchAdAccounts]);

  const handleSaveAdAccount = async (
    payload: CreateAdAccountPayload | UpdateAdAccountPayload,
    accountId?: string
  ) => {
    try {
      if (accountId) {
        await adminService.updateAdAccount(accountId, payload as UpdateAdAccountPayload);
        addToast('Ad account updated', 'Advertising account details saved.', 'success');
      } else {
        await adminService.createAdAccount(payload as CreateAdAccountPayload);
        addToast('Ad account created', 'New advertising account created.', 'success');
      }
      setIsAdAccountModalOpen(false);
      setAdAccountToEdit(null);
      await fetchAdAccounts();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to save ad account', 'error');
    }
  };

  const handleDeleteAdAccount = async (account: AdAccount) => {
    try {
      await adminService.deleteAdAccount(account.id);
      addToast('Ad account removed', `${account.name} was removed.`, 'info');
      await fetchAdAccounts();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to delete ad account', 'error');
    }
  };

  return (
    <div className="space-y-6">
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
        onDeleteAccount={handleDeleteAdAccount}
        onOpenCredentials={(acc) => {
          setSelectedAdAccountForCreds(acc);
          setIsCredsModalOpen(true);
        }}
        canManageAdAccounts={true}
      />

      {isAdAccountModalOpen && (
        <AdAccountModal
          isOpen={isAdAccountModalOpen}
          onClose={() => {
            setIsAdAccountModalOpen(false);
            setAdAccountToEdit(null);
          }}
          adAccountToEdit={adAccountToEdit}
          workspaces={workspaces}
          onSave={handleSaveAdAccount}
        />
      )}

      {isCredsModalOpen && selectedAdAccountForCreds && (
        <AdAccountCredentialsModal
          isOpen={isCredsModalOpen}
          onClose={() => {
            setIsCredsModalOpen(false);
            setSelectedAdAccountForCreds(null);
          }}
          selectedWorkspace={selectedAdAccountForCreds}
        />
      )}
    </div>
  );
};
