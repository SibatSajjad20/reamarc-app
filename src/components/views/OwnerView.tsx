import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Building2,
  Users,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  History,
  Lock,
  PauseCircle,
  PlayCircle,
  X,
  Hash,
} from 'lucide-react';
import { ownerService, type Company, type OwnerAuditEvent } from '@/services/ownerService';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import type { ViewType } from '@/types';

interface OwnerViewProps {
  onNavigateView?: (view: ViewType) => void;
}

export const OwnerView: React.FC<OwnerViewProps> = ({ onNavigateView }) => {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [auditLogs, setAuditLogs] = useState<OwnerAuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'companies' | 'audit'>('companies');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Provision Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formName, setFormName] = useState<string>('');
  const [formSlug, setFormSlug] = useState<string>('');
  const [formPlan, setFormPlan] = useState<'starter' | 'pro' | 'enterprise'>('starter');
  const [formTimezone, setFormTimezone] = useState<string>('Asia/Karachi');
  const [formAccent, setFormAccent] = useState<string>('#6847E0');
  const [formAdminName, setFormAdminName] = useState<string>('');
  const [formAdminEmail, setFormAdminEmail] = useState<string>('');
  const [formAdminPassword, setFormAdminPassword] = useState<string>('');
  const [formMaxUsers, setFormMaxUsers] = useState<number>(50);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [comps, logs] = await Promise.all([
        ownerService.getCompanies(),
        ownerService.getAuditLog(50),
      ]);
      setCompanies(comps);
      setAuditLogs(logs);
    } catch (err: any) {
      addToast({
        title: 'Failed to load Owner Console',
        description: err.message || 'You may lack owner super-admin privileges.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleNameChange = (val: string) => {
    setFormName(val);
    if (!formSlug || formSlug === formName.toLowerCase().replace(/[^a-z0-9]/g, '-')) {
      const derived = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      setFormSlug(derived);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formSlug || !formAdminName || !formAdminEmail) {
      addToast({ title: 'Validation Error', description: 'Please fill in all required fields.', type: 'warning' });
      return;
    }
    setIsSubmitting(true);
    try {
      await ownerService.createCompany({
        name: formName,
        slug: formSlug,
        plan: formPlan,
        timezone: formTimezone,
        accent_color: formAccent,
        admin_name: formAdminName,
        admin_email: formAdminEmail,
        admin_password: formAdminPassword || undefined,
        max_users: formMaxUsers,
      });
      addToast({ title: 'Tenant Provisioned', description: `Successfully created ${formName}.`, type: 'success' });
      setIsModalOpen(false);
      // Reset form
      setFormName('');
      setFormSlug('');
      setFormAdminName('');
      setFormAdminEmail('');
      setFormAdminPassword('');
      void loadData();
    } catch (err: any) {
      addToast({ title: 'Provisioning Failed', description: err.message || 'Error creating company', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEnterCompany = async (comp: Company) => {
    try {
      const res = await ownerService.enterCompany(comp.id, 'Inspection via Owner Console', true);
      localStorage.setItem('reamarc_impersonation_token', res.impersonation_token);
      addToast({
        title: `Entering ${comp.name}`,
        description: 'Impersonation active in Read-Only mode.',
        type: 'info',
      });
      // Redirect to main application dashboard
      window.location.href = '/dashboard';
    } catch (err: any) {
      addToast({ title: 'Failed to enter company', description: err.message, type: 'error' });
    }
  };

  const handleToggleStatus = async (comp: Company) => {
    const nextStatus = comp.status === 'active' ? 'suspended' : 'active';
    const confirmMsg = nextStatus === 'suspended'
      ? `Are you sure you want to suspend ${comp.name}? All active sessions will be terminated.`
      : `Reactivate ${comp.name}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await ownerService.updateCompany(comp.id, { status: nextStatus });
      addToast({
        title: nextStatus === 'suspended' ? 'Company Suspended' : 'Company Activated',
        description: `${comp.name} is now ${nextStatus}.`,
        type: nextStatus === 'suspended' ? 'warning' : 'success',
      });
      void loadData();
    } catch (err: any) {
      addToast({ title: 'Status update failed', description: err.message, type: 'error' });
    }
  };

  const handleResetSessions = async (comp: Company) => {
    if (!window.confirm(`Revoke all current sessions for ${comp.name}? Users will have to sign in again.`)) return;
    try {
      await ownerService.resetTokenVersion(comp.id);
      addToast({ title: 'Sessions Revoked', description: `All tokens for ${comp.name} invalidated.`, type: 'success' });
      void loadData();
    } catch (err: any) {
      addToast({ title: 'Revocation failed', description: err.message, type: 'error' });
    }
  };

  const filteredCompanies = companies.filter((c) => {
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
  });

  const activeCount = companies.filter((c) => c.status === 'active').length;
  const suspendedCount = companies.filter((c) => c.status === 'suspended').length;
  const totalFleetUsers = companies.reduce((acc, c) => acc + (c.user_count || 0), 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas overflow-y-auto">
      {/* Top Header */}
      <div className="border-b border-border bg-surface px-6 py-6 sticky top-0 z-20 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Shield className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold tracking-tight">Owner Super-Admin Console</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                Fleet Controller
              </span>
            </div>
            <p className="text-xs text-muted-fg mt-1">
              Multi-tenant data isolation, tenant management, and single-click console impersonation.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => void loadData()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-surface hover:bg-surface-hover transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Provision Tenant
            </button>
          </div>
        </div>

        {/* Fleet Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-7xl mx-auto mt-6">
          <div className="p-3.5 rounded-xl border border-border bg-canvas/60">
            <div className="flex items-center gap-2 text-muted-fg text-xs">
              <Building2 className="w-4 h-4" />
              <span>Total Tenants</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-12 mt-1.5 rounded" />
            ) : (
              <div className="text-xl font-bold mt-1">{companies.length}</div>
            )}
          </div>
          <div className="p-3.5 rounded-xl border border-border bg-canvas/60">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
              <PlayCircle className="w-4 h-4" />
              <span>Active</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-12 mt-1.5 rounded" />
            ) : (
              <div className="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{activeCount}</div>
            )}
          </div>
          <div className="p-3.5 rounded-xl border border-border bg-canvas/60">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-medium">
              <PauseCircle className="w-4 h-4" />
              <span>Suspended</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-12 mt-1.5 rounded" />
            ) : (
              <div className="text-xl font-bold mt-1 text-amber-600 dark:text-amber-400">{suspendedCount}</div>
            )}
          </div>
          <div className="p-3.5 rounded-xl border border-border bg-canvas/60">
            <div className="flex items-center gap-2 text-muted-fg text-xs">
              <Users className="w-4 h-4" />
              <span>Fleet Users</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-12 mt-1.5 rounded" />
            ) : (
              <div className="text-xl font-bold mt-1">{totalFleetUsers}</div>
            )}
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-4 max-w-7xl mx-auto mt-6 border-b border-border -mb-6">
          <button
            onClick={() => setActiveTab('companies')}
            className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'companies'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-fg hover:text-fg'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Companies</span>
            <span className="text-[11px] font-mono text-muted-fg">({isLoading ? '…' : companies.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'audit'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-fg hover:text-fg'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Cryptographic Audit Chain</span>
            <span className="text-[11px] font-mono text-muted-fg">({isLoading ? '…' : auditLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-6">
        {activeTab === 'companies' ? (
          <div>
            {/* Search Bar */}
            <div className="mb-4 flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
                <input
                  type="text"
                  placeholder="Filter companies by name, slug, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-border bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            {/* Companies Grid */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Loading tenants">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex flex-col justify-between p-4 rounded-xl border border-border bg-surface shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <Skeleton className="w-3.5 h-3.5 rounded-full shrink-0" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-4 w-28 rounded" />
                            <Skeleton className="h-3 w-16 rounded" />
                          </div>
                        </div>
                        <Skeleton className="h-4 w-12 rounded-full" />
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-4 border-t border-border/50 pt-3">
                        <div className="space-y-1">
                          <Skeleton className="h-2.5 w-10 rounded" />
                          <Skeleton className="h-3.5 w-16 rounded" />
                        </div>
                        <div className="space-y-1">
                          <Skeleton className="h-2.5 w-10 rounded" />
                          <Skeleton className="h-3.5 w-14 rounded" />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Skeleton className="h-2.5 w-14 rounded" />
                          <Skeleton className="h-3.5 w-24 rounded" />
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-border flex items-center justify-between gap-2">
                      <Skeleton className="h-7 flex-1 rounded-md" />
                      <Skeleton className="h-7 w-7 rounded-md" />
                      <Skeleton className="h-7 w-7 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl bg-surface/50">
                <Building2 className="w-8 h-8 text-muted-fg mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium text-fg">No companies found</p>
                <p className="text-xs text-muted-fg mt-0.5">Try adjusting your search query</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCompanies.map((comp) => {
                  const isActive = comp.status === 'active';
                  const isCurrentCompany = comp.id === user?.company_id || comp.slug === 'reamarc';
                  return (
                    <div
                      key={comp.id}
                      className="flex flex-col justify-between p-4 rounded-xl border border-border bg-surface hover:border-border-hover transition-all shadow-xs"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs border border-white/20"
                              style={{ backgroundColor: comp.accent_color || '#6847E0' }}
                              title={`Accent: ${comp.accent_color}`}
                            />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h2 className="font-semibold text-sm leading-tight text-fg">{comp.name}</h2>
                                {isCurrentCompany && (
                                  <span className="inline-flex items-center px-1.5 py-0.2 text-[9px] font-bold rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                                    Current
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-fg font-mono mt-0.5">/{comp.slug}</p>
                            </div>
                          </div>

                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide capitalize ${
                              isActive
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {comp.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-muted-fg border-t border-border/50 pt-3">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider block">Plan</span>
                            <span className="capitalize font-medium text-fg">{comp.plan}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider block">Users</span>
                            <span className="font-medium text-fg">
                              {comp.user_count ?? 0} / {comp.limits?.max_users ?? 50}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider block">Timezone</span>
                            <span className="font-medium text-fg text-[11px] truncate block">
                              {comp.timezone || 'Asia/Karachi'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-border flex items-center justify-between gap-2">
                        {isCurrentCompany ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (onNavigateView) {
                                onNavigateView('dashboard');
                              } else {
                                window.location.href = '/dashboard';
                              }
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                            title="Currently active organization. Click to return to Dashboard."
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            Current Company
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleEnterCompany(comp)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Enter Console
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (isCurrentCompany) return;
                            void handleToggleStatus(comp);
                          }}
                          disabled={isCurrentCompany}
                          title={
                            isCurrentCompany
                              ? 'Root platform organization cannot be suspended'
                              : isActive
                              ? 'Suspend Company'
                              : 'Reactivate Company'
                          }
                          className={`p-1.5 rounded-md border text-xs transition-colors ${
                            isCurrentCompany
                              ? 'border-border/40 text-muted-fg/40 cursor-not-allowed opacity-50'
                              : isActive
                              ? 'border-border text-muted-fg hover:text-amber-600 hover:border-amber-300'
                              : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
                          }`}
                        >
                          {isActive ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleResetSessions(comp)}
                          title="Force Logout All Users"
                          className="p-1.5 rounded-md border border-border text-muted-fg hover:text-rose-600 hover:border-rose-300 transition-colors"
                        >
                          <Lock className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Cryptographic Audit Log Tab */
          <div className="p-4 rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div className="flex items-center gap-2 text-xs text-muted-fg">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>SHA-256 Tamper-Evident Hash Chain Verified</span>
              </div>
              <span className="text-xs text-muted-fg font-mono">Showing last 50 owner actions</span>
            </div>

            {isLoading ? (
              <div className="space-y-2.5" aria-label="Loading audit logs">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border border-border/70 bg-canvas/60 flex flex-col md:flex-row md:items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-3.5 w-28 rounded" />
                      <Skeleton className="h-3 w-20 rounded" />
                    </div>
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-3 w-24 rounded" />
                      <Skeleton className="h-3 w-32 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-10 text-muted-fg text-xs">No audit events recorded yet.</div>
            ) : (
              <div className="space-y-2.5">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg border border-border/70 bg-canvas/60 text-xs font-mono flex flex-col md:flex-row md:items-center justify-between gap-2 hover:bg-canvas transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold uppercase text-[10px]">
                        {log.action}
                      </span>
                      <span className="text-fg font-medium">
                        {log.target_company_id ? `Target: ${log.target_company_id}` : 'System'}
                      </span>
                      <span className="text-muted-fg text-[11px]">
                        by {log.actor_user_id || 'System'}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-muted-fg text-[11px]">
                      <span title={`Full Hash: ${log.hash}`} className="flex items-center gap-1">
                        <Hash className="w-3 h-3 text-muted-fg/70" />
                        {log.hash.slice(0, 12)}...
                      </span>
                      <span>{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Provision Tenant Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-sm">Provision New Tenant</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-md text-muted-fg hover:text-fg hover:bg-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCompany} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme Corporation"
                    value={formName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-canvas focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Slug *</label>
                  <input
                    type="text"
                    required
                    placeholder="acme-corp"
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-canvas font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Plan</label>
                  <select
                    value={formPlan}
                    onChange={(e) => setFormPlan(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-canvas focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Timezone</label>
                  <select
                    value={formTimezone}
                    onChange={(e) => setFormTimezone(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-canvas focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="Asia/Karachi">Asia/Karachi (PKT)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Europe/Berlin">Europe/Berlin (CET)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formAccent}
                      onChange={(e) => setFormAccent(e.target.value)}
                      className="w-8 h-8 rounded border border-border cursor-pointer p-0 bg-transparent"
                    />
                    <input
                      type="text"
                      value={formAccent}
                      onChange={(e) => setFormAccent(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md border border-border bg-canvas font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <span className="font-bold text-muted-fg block mb-2 uppercase text-[10px] tracking-wider">
                  Initial Tenant Administrator
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block font-semibold mb-1">Admin Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={formAdminName}
                      onChange={(e) => setFormAdminName(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-md border border-border bg-canvas focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block font-semibold mb-1">Admin Work Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="jane@acmecorp.com"
                      value={formAdminEmail}
                      onChange={(e) => setFormAdminEmail(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-md border border-border bg-canvas focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block font-semibold mb-1">Initial Password (Optional)</label>
                    <input
                      type="password"
                      placeholder="Leave blank to generate"
                      value={formAdminPassword}
                      onChange={(e) => setFormAdminPassword(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-md border border-border bg-canvas focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block font-semibold mb-1">Max Users Limit</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={formMaxUsers}
                      onChange={(e) => setFormMaxUsers(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-1.5 rounded-md border border-border bg-canvas focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-md border border-border text-muted-fg hover:bg-surface-hover transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-md bg-accent text-accent-fg font-semibold hover:opacity-90 transition-opacity"
                >
                  {isSubmitting ? 'Provisioning...' : 'Provision Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
