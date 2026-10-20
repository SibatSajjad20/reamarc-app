import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import type { Workspace } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useBreadcrumb } from '../layout/BreadcrumbContext';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useClientForm, type WorkspaceFormSeed } from '../../hooks/useClientForm';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { ClientForm } from '../clients/ClientForm';
import { ClientAvatar } from '../ui/ClientAvatar';
import { Button } from '../ui/button';
import { ErrorState } from '../ui/ErrorState';
import { workspaceService } from '../../services/workspaceService';
import { crmService } from '../../services/crmService';
import { useConfirm } from '../ui/ConfirmProvider';

export type ClientPageReturn = 'active-clients' | 'admin-workspaces' | 'crm' | 'marketing';
export interface ClientPageState {
  mode: 'new' | 'edit';
  id?: string;
  fromLead?: string | null;
  returnTo: ClientPageReturn;
  crmSection?: string;
}

interface Props {
  page: ClientPageState;
  seed?: WorkspaceFormSeed | null;
  onNavigate: (path: string, options?: { replace?: boolean }) => void;
  registerGuard: (fn: (() => Promise<boolean>) | null) => void;
}

const RETURN_PATH: Record<ClientPageReturn, (page: ClientPageState) => string> = {
  'active-clients': () => '/clients',
  'admin-workspaces': () => '/admin/workspaces',
  marketing: () => '/marketing',
  crm: (page) => `/crm/${page.crmSection || 'board'}`,
};

export const ClientPage: React.FC<Props> = ({ page, seed, onNavigate, registerGuard }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const { setTrail } = useBreadcrumb();
  const { workspaces, saveWorkspace, isLoading, error, refetch } = useWorkspaces();
  const canManage = user?.role === 'admin' || user?.role === 'operations';
  const workspace = useMemo(
    () => (page.mode === 'edit' && page.id ? workspaces.find((w) => w.id === page.id) || null : null),
    [page, workspaces]
  );
  const form = useClientForm(workspace, seed);
  const [liveWorkspace, setLiveWorkspace] = useState<Workspace | null>(workspace);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeSection, setActiveSection] = useState('basics');

  useEffect(() => {
    setLiveWorkspace(workspace);
    if (workspace) form.resetFrom(workspace, seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  const { confirmDiscard } = useUnsavedChangesGuard(form.isDirty);
  const dirtyRef = useRef(form.isDirty);
  dirtyRef.current = form.isDirty;
  useEffect(() => {
    registerGuard(async () => confirmDiscard());
    return () => registerGuard(null);
  }, [confirmDiscard, registerGuard]);

  useEffect(() => {
    const onPop = () => {
      if (!dirtyRef.current) return;
      window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`);
      void confirmDiscard().then((ok) => {
        if (ok) onNavigate(RETURN_PATH[page.returnTo](page));
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [confirmDiscard, onNavigate, page]);

  const leave = async (path: string) => {
    if (await confirmDiscard()) onNavigate(path);
  };

  useEffect(() => {
    const isAdmin = page.returnTo === 'admin-workspaces';
    const name = liveWorkspace?.name || form.values.name;
    setTrail([
      { label: isAdmin ? 'Admin' : 'Active clients', onClick: () => void leave(RETURN_PATH[page.returnTo](page)) },
      ...(isAdmin ? [{ label: 'Workspaces', onClick: () => void leave('/admin/workspaces') }] : []),
      ...(page.mode === 'new' ? [{ label: 'New client' }] : [{ label: name || 'Client' }, { label: 'Edit' }]),
    ]);
    return () => setTrail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.mode, page.returnTo, liveWorkspace?.name, form.values.name]);

  const handleSave = async () => {
    if (!form.runValidation() || form.isUploadingProposal) return;
    form.setIsSubmitting(true);
    form.setServerError(null);
    setLogoUploadError(null);
    try {
      if (page.fromLead) {
        const saved = await crmService.registerClient(page.fromLead, form.payload() as any);
        addToast('Active client created', saved.company || saved.name, 'success');
        form.markClean();
        onNavigate(RETURN_PATH.crm(page));
        return;
      }
      const res = await saveWorkspace(liveWorkspace, form.payload());
      let next = res.workspace;
      if (form.pendingLogoFile) {
        try {
          next = await workspaceService.uploadLogo(next.id, form.pendingLogoFile);
        } catch (err: any) {
          setLogoUploadError(err?.message || "The logo didn't upload.");
          addToast("Client created, but the logo didn't upload. Try again from this page.", '', 'warning');
          form.markClean(form.values);
          setLiveWorkspace(next);
          onNavigate(`/clients/${next.id}/edit`, { replace: true });
          return;
        }
      }
      setLiveWorkspace(next);
      form.resetFrom(next);
      if (res.isNew) {
        addToast('Client created', next.name, 'success');
        onNavigate(`/clients/${next.id}/edit${page.returnTo === 'admin-workspaces' ? '?return=admin-workspaces' : ''}`, { replace: true });
      } else {
        addToast('Changes saved', next.name, 'success');
      }
    } catch (err: any) {
      form.setServerError(err.message || 'Failed to save workspace.');
    } finally {
      form.setIsSubmitting(false);
    }
  };

  if (!canManage) {
    return <div className="flex-1 flex items-center justify-center p-8"><ErrorState title="You don't have access to edit clients" message="Only operations and admin can add or edit client workspaces." onRetry={() => onNavigate('/clients')} retryLabel="Back to Active clients" /></div>;
  }
  if (page.mode === 'edit' && isLoading && !workspace) {
    return <div className="flex-1 p-6 space-y-4"><div className="h-10 w-64 bg-skel rounded-lg" /><div className="h-40 bg-skel rounded-xl" /></div>;
  }
  if (error && page.mode === 'edit' && !workspace) {
    return <div className="flex-1 flex items-center justify-center p-8"><ErrorState title="Couldn't load this client" message={error} onRetry={() => void refetch()} /></div>;
  }
  if (page.mode === 'edit' && !isLoading && !workspace) {
    return <div className="flex-1 flex items-center justify-center p-8"><ErrorState title="Client not found" message="This client isn’t in your workspace list." onRetry={() => onNavigate(RETURN_PATH[page.returnTo](page))} retryLabel="Back" /></div>;
  }

  const title = page.mode === 'new' && !liveWorkspace ? 'New client' : liveWorkspace?.name || form.values.name || 'Client';
  const sections = [
    { id: 'basics', label: 'Basics', errorKeys: ['name', 'contractStartDate', 'contractEndDate', 'services'] },
    { id: 'logo', label: 'Logo & colour', errorKeys: [] as string[] },
    { id: 'contacts', label: 'Contacts', errorKeys: [] as string[] },
    { id: 'proposal', label: 'Proposal', errorKeys: [] as string[] },
    ...(page.mode === 'edit' ? [{ id: 'danger', label: 'Danger zone', errorKeys: [] as string[] }] : []),
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-canvas">
      <div className="shrink-0 px-4 md:px-6 py-4 border-b border-border bg-surface flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => void leave(RETURN_PATH[page.returnTo](page))} aria-label="Back"><ArrowLeft className="w-4 h-4" /></Button>
          <ClientAvatar name={form.values.name || 'Client'} logoUrl={form.pendingLogoPreview || liveWorkspace?.logo_url} clientId={liveWorkspace?.id} brandColor={form.values.brandColor} initials={form.values.initials} size={40} />
          <div className="min-w-0"><h1 className="text-base font-semibold text-fg truncate">{title}</h1><p className="text-xs text-fg-muted">{page.mode === 'new' && !liveWorkspace ? 'Add a client workspace' : ''}</p></div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void leave(RETURN_PATH[page.returnTo](page))}>Cancel</Button>
          <Button variant="primary" size="sm" icon={CheckCircle2} loading={form.isSubmitting} disabled={form.isSubmitting || form.isUploadingProposal} onClick={() => void handleSave()}>{page.mode === 'new' && !liveWorkspace ? 'Create client' : 'Save changes'}</Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex gap-6 max-w-[1100px] mx-auto w-full px-4 md:px-6 py-5 pb-24">
          <nav className="hidden lg:block w-[180px] shrink-0 sticky top-4 self-start space-y-1">
            {sections.map((s) => (
              <button key={s.id} type="button" onClick={() => { setActiveSection(s.id); sectionRefs.current[s.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium ${activeSection === s.id ? 'bg-subtle text-fg' : 'text-fg-muted'}`}>
                {s.label}{s.errorKeys.some((k) => form.fieldErrors[k]) && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-danger-fg" />}
              </button>
            ))}
          </nav>
          <div className="flex-1 max-w-[760px] min-w-0">
            <ClientForm form={form} workspace={liveWorkspace} canManage={canManage} onWorkspacePatched={setLiveWorkspace} sectionRefs={sectionRefs} />
            {page.mode === 'edit' && liveWorkspace && (
              <section ref={(el) => { sectionRefs.current.danger = el; }} id="section-danger" className="mt-4 bg-surface border border-danger-bd rounded-xl p-[18px] space-y-3">
                <h2 className="text-sm font-semibold text-fg">Danger zone</h2>
                <p className="text-xs text-fg-muted">Hides this client from team members. Clients can&apos;t be deleted.</p>
                <Button variant="danger-secondary" size="sm" onClick={async () => {
                  const nextStatus = liveWorkspace.status === 'inactive' ? 'active' : 'inactive';
                  const ok = await confirm({ title: nextStatus === 'inactive' ? `Hides ${liveWorkspace.name} from team members. Clients can't be deleted.` : `Mark ${liveWorkspace.name} as active?`, confirmLabel: nextStatus === 'inactive' ? 'Mark as inactive' : 'Mark as active', tone: nextStatus === 'inactive' ? 'danger' : 'default' });
                  if (!ok) return;
                  const updated = await saveWorkspace(liveWorkspace, { status: nextStatus });
                  setLiveWorkspace(updated.workspace);
                  form.patch({ status: nextStatus });
                  form.markClean();
                  addToast('Changes saved', updated.workspace.name, 'success');
                }}>{liveWorkspace.status === 'inactive' ? 'Mark as active' : 'Mark as inactive'}</Button>
              </section>
            )}
          </div>
        </div>
      </div>
      <div className="sticky bottom-0 z-[var(--z-sticky)] bg-surface border-t border-border px-4 md:px-6 py-3 flex items-center justify-between gap-3">
        <p className="text-xs text-danger-fg truncate">{form.serverError || logoUploadError || (form.errorCount ? `${form.errorCount} fields need attention` : form.isDirty ? 'Unsaved changes' : '')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void leave(RETURN_PATH[page.returnTo](page))}>Cancel</Button>
          <Button variant="primary" size="sm" icon={CheckCircle2} loading={form.isSubmitting} disabled={form.isSubmitting || form.isUploadingProposal} onClick={() => void handleSave()}>{page.mode === 'new' && !liveWorkspace ? 'Create client' : 'Save changes'}</Button>
        </div>
      </div>
    </div>
  );
};

export type { WorkspaceFormSeed };
