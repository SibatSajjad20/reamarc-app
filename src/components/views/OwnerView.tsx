import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { CompanyBrandingForm } from '@/components/settings/sections/CompanyBrandingForm';
import { ownerBrandingAdapter } from '@/services/companyBrandingService';
import { Plus, UserPlus, LogOut } from 'lucide-react';
import type { ViewType } from '@/types';

interface OwnerViewProps {
  onNavigateView?: (view: ViewType) => void;
}

export const OwnerView: React.FC<OwnerViewProps> = ({ onNavigateView }) => {
  const { user } = useAuth();
  const { addToast } = useToast();

  // Tab state synced with URL sub-path
  const getInitialTab = (): 'companies' | 'members' | 'activity' => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname.toLowerCase();
      if (pathname === '/owner/members' || pathname.endsWith('/members')) return 'members';
      if (pathname === '/owner/activity' || pathname.endsWith('/activity')) return 'activity';
    }
    return 'companies';
  };

  const [activeTab, setActiveTab] = useState<'companies' | 'members' | 'activity'>(getInitialTab);

  // Data state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [auditLogs, setAuditLogs] = useState<OwnerAuditEvent[]>([]);
  const [members, setMembers] = useState<OwnerMember[]>([]);
  const [hasMembersSupport, setHasMembersSupport] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auditLimit, setAuditLimit] = useState<number>(50);
  const [isLoadingMoreAudit, setIsLoadingMoreAudit] = useState<boolean>(false);

  // Modals & Sheets
  const [isCreateCompanyOpen, setIsCreateCompanyOpen] = useState(false);
  const [isNewMemberOpen, setIsNewMemberOpen] = useState(false);
  const [giveAccessUser, setGiveAccessUser] = useState<OwnerMember | null>(null);
  const [setPasswordUser, setSetPasswordUser] = useState<OwnerMember | null>(null);
  const [detailCompanyId, setDetailCompanyId] = useState<string | null>(null);
  const [brandingSheetCompany, setBrandingSheetCompany] = useState<Company | null>(null);

  // Member filter preset / highlight state
  const [presetMemberCompanyFilter, setPresetMemberCompanyFilter] = useState<string | null>(null);
  const [highlightUserId, setHighlightUserId] = useState<string | null>(null);

  // Sync tab change to URL
  const handleTabChange = (val: string) => {
    const nextTab = val as 'companies' | 'members' | 'activity';
    setActiveTab(nextTab);
    if (typeof window !== 'undefined') {
      const targetPath =
        nextTab === 'companies'
          ? '/owner'
          : nextTab === 'members'
          ? '/owner/members'
          : '/owner/activity';
      window.history.replaceState(null, '', targetPath);
    }
  };

  // Listen to popstate (browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getInitialTab());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Main data loader
  const loadData = useCallback(async () => {
    if (user?.impersonating) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const [comps, logs] = await Promise.all([
        ownerService.getCompanies(),
        ownerService.getAuditLog(50),
      ]);
      setCompanies(comps);
      setAuditLogs(logs);

      // Fetch members with fail-closed support check
      try {
        const mems = await ownerService.getMembers();
        setMembers(mems || []);
        setHasMembersSupport(true);
      } catch (err: any) {
        if (err?.status === 404 || err?.response?.status === 404) {
          setHasMembersSupport(false);
          setMembers([]);
        } else {
          // Keep members support enabled but keep list empty
          setMembers([]);
        }
      }
    } catch (err: any) {
      setLoadError(err.message || 'Check your connection and try again. Nothing was changed.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.impersonating]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Load more audit events (up to 200)
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

  // Impersonate / Enter company
  const handleEnterCompany = async (comp: Company) => {
    addToast(`Opening ${comp.name}…`, undefined, 'info');
    try {
      const res = await ownerService.enterCompany(comp.id, 'Inspection / Support', true);
      sessionStorage.setItem('reamarc_impersonation_token', res.impersonation_token);
      sessionStorage.removeItem('reamarc_impersonation_token');
      localStorage.removeItem('reamarc_impersonation_token');
      window.location.href = '/dashboard';
    } catch (err: any) {
      addToast(`Couldn't open ${comp.name}`, err.message, 'error');
    }
  };

  // Exit from banner inside OwnerView (if reached while impersonating)
  const handleExitImpersonation = async () => {
    try {
      await ownerService.exitCompany();
    } catch {
      // Ignore exit error and clear locally
    } finally {
      sessionStorage.removeItem('reamarc_impersonation_token');
      localStorage.removeItem('reamarc_impersonation_token');
      window.location.href = '/owner';
    }
  };

  // Handle new member creation callback
  const handleNewMemberCreated = ({ userId, companyId }: { userId: string; companyId: string }) => {
    setPresetMemberCompanyFilter(companyId);
    setActiveTab('members');
    setHighlightUserId(userId);
    setTimeout(() => setHighlightUserId(null), 2000);
    void loadData();
  };

  // If user is currently impersonating and opened OwnerView, guard with EmptyState
  if (user?.impersonating) {
    const compName = user.company?.name || user.company_id || 'the company';
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-canvas">
        <EmptyState
          title={`You're inside ${compName}`}
          description="Exit to use the owner console."
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={LogOut}
              onClick={handleExitImpersonation}
            >
              Exit
            </Button>
          }
        />
      </div>
    );
  }

  // Header primary action button based on current tab
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
        {/* PageHeader (A1) */}
        <PageHeader
          title="Owner console"
          description="Companies on this platform and who can open them. Only you can see this page."
          actions={headerAction}
        />

        {/* Global load error state */}
        {loadError ? (
          <div className="py-12">
            <ErrorState
              title="Couldn't load the owner console"
              message="Check your connection and try again. Nothing was changed."
              onRetry={loadData}
              retryLabel="Try again"
            />
          </div>
        ) : (
          /* Tabs (Radix Tabs from ui/tabs.tsx) */
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

            {/* Companies Tab */}
            <TabsContent value="companies" className="pt-2">
              <OwnerCompaniesTab
                companies={companies}
                isLoading={isLoading}
                currentUserCompanyId={user?.company_id}
                onSelectCompany={(cid) => setDetailCompanyId(cid)}
                onEnterCompany={handleEnterCompany}
                onOpenCreateModal={() => setIsCreateCompanyOpen(true)}
                onRefreshData={loadData}
                onNavigateToDashboard={() => onNavigateView?.('dashboard')}
              />
            </TabsContent>

            {/* Members Tab */}
            {hasMembersSupport && (
              <TabsContent value="members" className="pt-2">
                <OwnerMembersTab
                  members={members}
                  companies={companies}
                  isLoading={isLoading}
                  onRefreshData={loadData}
                  onOpenGiveAccess={(m) => setGiveAccessUser(m)}
                  onOpenSetPassword={(m) => setSetPasswordUser(m)}
                  onOpenNewMemberModal={() => setIsNewMemberOpen(true)}
                  highlightUserId={highlightUserId}
                  presetCompanyFilter={presetMemberCompanyFilter}
                />
              </TabsContent>
            )}

            {/* Activity Log Tab */}
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

      {/* Dialogs & Sheets */}

      {/* New Company Dialog */}
      <CreateCompanyDialog
        isOpen={isCreateCompanyOpen}
        onClose={() => setIsCreateCompanyOpen(false)}
        onSuccess={async (createdComp) => {
          await loadData();
          setDetailCompanyId(createdComp.id);
        }}
      />

      {/* Company Detail Sheet */}
      <CompanyDetailSheet
        companyId={detailCompanyId}
        isOpen={Boolean(detailCompanyId)}
        onClose={() => setDetailCompanyId(null)}
        currentUserId={user?.id}
        currentUserCompanyId={user?.company_id}
        members={members}
        onEnterCompany={handleEnterCompany}
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
        }}
        onCompanyUpdated={async () => {
          await loadData();
        }}
      />

      {/* Give Access Dialog */}
      <GiveAccessDialog
        user={giveAccessUser}
        companies={companies}
        isOpen={Boolean(giveAccessUser)}
        onClose={() => setGiveAccessUser(null)}
        onSuccess={async () => {
          await loadData();
        }}
      />

      {/* Set Starting Password Dialog */}
      <SetStartingPasswordDialog
        user={setPasswordUser}
        isOpen={Boolean(setPasswordUser)}
        onClose={() => setSetPasswordUser(null)}
        onSuccess={async () => {
          await loadData();
        }}
      />

      {/* New Member Dialog */}
      <NewMemberDialog
        companies={companies}
        isOpen={isNewMemberOpen}
        onClose={() => setIsNewMemberOpen(false)}
        onSuccess={handleNewMemberCreated}
      />

      {/* Branding Sheet (triggered from Company Detail Sheet) */}
      {brandingSheetCompany && (
        <Sheet
          open={Boolean(brandingSheetCompany)}
          onOpenChange={(open) => !open && setBrandingSheetCompany(null)}
        >
          <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col h-full bg-surface">
            <SheetHeader className="p-5 border-b border-border">
              <SheetTitle className="text-h2 font-semibold text-fg">
                {brandingSheetCompany.name} branding
              </SheetTitle>
              <SheetDescription className="text-small text-fg-muted">
                Logo, display name and accent colour for {brandingSheetCompany.name}.
              </SheetDescription>
            </SheetHeader>
            <div className="p-6 overflow-y-auto flex-1">
              <CompanyBrandingForm
                adapter={ownerBrandingAdapter(brandingSheetCompany.id)}
                onSaved={async () => {
                  await loadData();
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};
