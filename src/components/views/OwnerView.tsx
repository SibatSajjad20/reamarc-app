import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button, IconButton } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/ErrorState';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  ownerService,
  type Company,
  type OwnerAuditEvent,
  type OwnerMember,
} from '@/services/ownerService';
import { OwnerCompaniesTab } from '@/components/owner/OwnerCompaniesTab';
import { OwnerMembersTab } from '@/components/owner/OwnerMembersTab';
import { OwnerActivityTab } from '@/components/owner/OwnerActivityTab';
import { CreateCompanyDialog } from '@/components/owner/CreateCompanyDialog';
import { NewMemberDialog } from '@/components/owner/NewMemberDialog';
import { GiveAccessDialog } from '@/components/owner/GiveAccessDialog';
import { SetStartingPasswordDialog } from '@/components/owner/SetStartingPasswordDialog';
import { CompanyDetailSheet } from '@/components/owner/CompanyDetailSheet';
import { CompanyBrandingSheet } from '@/components/owner/CompanyBrandingSheet';
import { Plus, UserPlus } from 'lucide-react';
import { companiesPathForTab, companiesTabFromPath } from '@/utils/companiesRoutes';

export const OwnerView: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();

  const getInitialTab = (): 'companies' | 'members' | 'activity' => {
    if (typeof window !== 'undefined') {
      return companiesTabFromPath(window.location.pathname);
    }
    return 'companies';
  };

  const [activeTab, setActiveTab] = useState<'companies' | 'members' | 'activity'>(getInitialTab);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [auditLogs, setAuditLogs] = useState<OwnerAuditEvent[]>([]);
  const [members, setMembers] = useState<OwnerMember[]>([]);
  const [hasMembersSupport, setHasMembersSupport] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auditLimit, setAuditLimit] = useState<number>(50);
  const [isLoadingMoreAudit, setIsLoadingMoreAudit] = useState<boolean>(false);

  const [isCreateCompanyOpen, setIsCreateCompanyOpen] = useState(false);
  const [isNewMemberOpen, setIsNewMemberOpen] = useState(false);
  const [giveAccessUser, setGiveAccessUser] = useState<OwnerMember | null>(null);
  const [giveAccessPresetCompanyId, setGiveAccessPresetCompanyId] = useState<string | undefined>();
  const [setPasswordUser, setSetPasswordUser] = useState<OwnerMember | null>(null);
  const [detailCompanyId, setDetailCompanyId] = useState<string | null>(null);
  const [brandingSheetCompany, setBrandingSheetCompany] = useState<Company | null>(null);

  const [presetMemberCompanyFilter, setPresetMemberCompanyFilter] = useState<string | null>(null);
  const [highlightUserId, setHighlightUserId] = useState<string | null>(null);

  const currentUserMember = useMemo(
    () => members.find((m) => m.id === user?.id) || null,
    [members, user?.id]
  );

  const memberCompanyIds = useMemo(() => {
    const ids = new Set<string>();
    if (user?.company_id) ids.add(user.company_id);
    if (user?.company?.id) ids.add(user.company.id);
    (currentUserMember?.memberships || [])
      .filter((m) => m.status === 'active')
      .forEach((m) => ids.add(m.company_id));
    (user?.companies || []).forEach((c) => ids.add(c.id));
    return ids;
  }, [user, currentUserMember]);

  const handleTabChange = (val: string) => {
    const nextTab = val as 'companies' | 'members' | 'activity';
    setActiveTab(nextTab);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', companiesPathForTab(nextTab));
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getInitialTab());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [comps, logs] = await Promise.all([
        ownerService.getCompanies(),
        ownerService.getAuditLog(50),
      ]);
      setCompanies(comps);
      setAuditLogs(logs);

      try {
        const mems = await ownerService.getMembers();
        setMembers(mems || []);
        setHasMembersSupport(true);
      } catch (err: any) {
        if (err?.status === 404 || err?.response?.status === 404) {
          setHasMembersSupport(false);
          setMembers([]);
        } else {
          setMembers([]);
        }
      }
    } catch (err: any) {
      setLoadError(err.message || 'Check your connection and try again. Nothing was changed.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleLoadMoreAudit = async () => {
    const nextLimit = Math.min(200, auditLimit + 50);
    setIsLoadingMoreAudit(true);
    try {
      const moreLogs = await ownerService.getAuditLog(nextLimit);
      setAuditLogs(moreLogs);
      setAuditLimit(nextLimit);
    } catch (err: any) {
      addToast("Couldn't load more activity", err.message, 'error');
    } finally {
      setIsLoadingMoreAudit(false);
    }
  };

  const openGiveAccess = (member: OwnerMember, companyId?: string) => {
    setGiveAccessPresetCompanyId(companyId);
    setGiveAccessUser(member);
  };

  const handleGiveAccessForCompany = (company: Company) => {
    if (!currentUserMember && !user) return;
    const member: OwnerMember = currentUserMember || {
      id: user!.id,
      email: user!.email,
      name: user!.name || user!.full_name || user!.email,
      full_name: user!.full_name || user!.name || user!.email,
      is_active: true,
      is_super_admin: true,
      company_id: user!.company_id,
      memberships: [],
    };
    openGiveAccess(member, company.id);
  };

  const handleNewMemberCreated = ({ userId, companyId }: { userId: string; companyId: string }) => {
    setPresetMemberCompanyFilter(companyId);
    setActiveTab('members');
    window.history.replaceState(null, '', companiesPathForTab('members'));
    setHighlightUserId(userId);
    setTimeout(() => setHighlightUserId(null), 2000);
    void loadData();
  };

  const headerAction =
    activeTab === 'companies' ? (
      <>
        <Button
          variant="primary"
          size="md"
          icon={Plus}
          onClick={() => setIsCreateCompanyOpen(true)}
          className="hidden sm:inline-flex"
        >
          New company
        </Button>
        <IconButton
          variant="primary"
          size="md"
          icon={Plus}
          label="New company"
          onClick={() => setIsCreateCompanyOpen(true)}
          className="sm:hidden"
        />
      </>
    ) : activeTab === 'members' && hasMembersSupport ? (
      <>
        <Button
          variant="primary"
          size="md"
          icon={UserPlus}
          onClick={() => setIsNewMemberOpen(true)}
          className="hidden sm:inline-flex"
        >
          New member
        </Button>
        <IconButton
          variant="primary"
          size="md"
          icon={UserPlus}
          label="New member"
          onClick={() => setIsNewMemberOpen(true)}
          className="sm:hidden"
        />
      </>
    ) : null;

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-canvas overflow-y-auto">
      <div className="max-w-[1400px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <PageHeader
          title="Companies"
          description="Companies on this platform and who can access them. Only you can see this page."
          actions={headerAction}
        />

        {loadError ? (
          <div className="py-12">
            <ErrorState
              title="Couldn't load companies"
              message="Check your connection and try again. Nothing was changed."
              onRetry={loadData}
              retryLabel="Try again"
            />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList>
              <TabsTrigger
                value="companies"
                count={isLoading ? undefined : companies.length}
              >
                Companies
              </TabsTrigger>

              {hasMembersSupport && (
                <TabsTrigger
                  value="members"
                  count={isLoading ? undefined : members.length}
                >
                  Members
                </TabsTrigger>
              )}

              <TabsTrigger value="activity">Activity log</TabsTrigger>
            </TabsList>

            <TabsContent value="companies" className="pt-2">
              <OwnerCompaniesTab
                companies={companies}
                isLoading={isLoading}
                currentUserCompanyId={user?.company_id || user?.company?.id}
                memberCompanyIds={memberCompanyIds}
                onSelectCompany={(cid) => setDetailCompanyId(cid)}
                onGiveAccess={handleGiveAccessForCompany}
                onOpenCreateModal={() => setIsCreateCompanyOpen(true)}
                onRefreshData={loadData}
              />
            </TabsContent>

            {hasMembersSupport && (
              <TabsContent value="members" className="pt-2">
                <OwnerMembersTab
                  members={members}
                  companies={companies}
                  isLoading={isLoading}
                  onRefreshData={loadData}
                  onOpenGiveAccess={(m) => openGiveAccess(m)}
                  onOpenSetPassword={(m) => setSetPasswordUser(m)}
                  onOpenNewMemberModal={() => setIsNewMemberOpen(true)}
                  highlightUserId={highlightUserId}
                  presetCompanyFilter={presetMemberCompanyFilter}
                />
              </TabsContent>
            )}

            <TabsContent value="activity" className="pt-2">
              <OwnerActivityTab
                logs={auditLogs}
                companies={companies}
                members={members}
                isLoading={isLoading}
                onLoadMore={handleLoadMoreAudit}
                canLoadMore={auditLogs.length >= auditLimit && auditLimit < 200}
                isLoadingMore={isLoadingMoreAudit}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <CreateCompanyDialog
        isOpen={isCreateCompanyOpen}
        onClose={() => setIsCreateCompanyOpen(false)}
        onSuccess={async (createdComp) => {
          await loadData();
          setDetailCompanyId(createdComp.id);
        }}
      />

      <CompanyDetailSheet
        companyId={detailCompanyId}
        isOpen={Boolean(detailCompanyId)}
        onClose={() => setDetailCompanyId(null)}
        currentUserCompanyId={user?.company_id || user?.company?.id}
        memberCompanyIds={memberCompanyIds}
        members={members}
        onGiveAccess={handleGiveAccessForCompany}
        onOpenBranding={(comp) => {
          setDetailCompanyId(null);
          setBrandingSheetCompany(comp);
        }}
        onSignEveryoneOut={async (comp) => {
          try {
            await ownerService.resetTokenVersion(comp.id);
            addToast(`Everyone in ${comp.name} was signed out`, undefined, 'success');
          } catch (err: any) {
            addToast(`Couldn't sign everyone out of ${comp.name}`, err.message, 'error');
          }
        }}
        onTogglePause={async (comp) => {
          const isPaused = comp.status === 'suspended';
          try {
            await ownerService.updateCompany(comp.id, {
              status: isPaused ? 'active' : 'suspended',
            });
            addToast(isPaused ? `${comp.name} resumed` : `${comp.name} paused`, undefined, 'success');
            await loadData();
          } catch (err: any) {
            addToast(`Couldn't update ${comp.name}`, err.message, 'error');
          }
        }}
        onManageInMembers={(cid) => {
          setPresetMemberCompanyFilter(cid);
          setActiveTab('members');
          window.history.replaceState(null, '', companiesPathForTab('members'));
        }}
        onCompanyUpdated={async () => {
          await loadData();
        }}
      />

      <GiveAccessDialog
        user={giveAccessUser}
        companies={companies}
        isOpen={Boolean(giveAccessUser)}
        presetCompanyId={giveAccessPresetCompanyId}
        onClose={() => {
          setGiveAccessUser(null);
          setGiveAccessPresetCompanyId(undefined);
        }}
        onSuccess={async () => {
          await loadData();
        }}
      />

      <SetStartingPasswordDialog
        user={setPasswordUser}
        isOpen={Boolean(setPasswordUser)}
        onClose={() => setSetPasswordUser(null)}
        onSuccess={async () => {
          await loadData();
        }}
      />

      <NewMemberDialog
        companies={companies}
        isOpen={isNewMemberOpen}
        onClose={() => setIsNewMemberOpen(false)}
        onSuccess={handleNewMemberCreated}
      />

      <CompanyBrandingSheet
        company={brandingSheetCompany}
        onClose={() => setBrandingSheetCompany(null)}
        onSaved={loadData}
      />
    </div>
  );
};
