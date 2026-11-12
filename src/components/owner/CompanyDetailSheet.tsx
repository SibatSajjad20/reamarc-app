import React, { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { FormFooter } from '@/components/ui/FormFooter';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyMark } from './CompanyMark';
import { ownerService, type Company, type OwnerMember } from '@/services/ownerService';
import { getRoleDisplayName } from '@/lib/roleLabel';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Palette, Settings2, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Callout } from '@/components/ui/Callout';
import { COMPANY_MODULE_KEYS, COMPANY_MODULE_LABELS, type CompanyModuleKey } from '@/utils/companyModules';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { DEFAULT_TIMEZONE, getTimezoneOptions } from '@/utils/timezones';

export function formatCreatedDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

interface CompanyDetailSheetProps {
  companyId: string | null;
  isOpen: boolean;
  onClose: () => void;
  currentUserCompanyId?: string;
  memberCompanyIds?: Set<string>;
  members?: OwnerMember[];
  onGiveAccess?: (company: Company) => void;
  onOpenBranding: (company: Company) => void;
  onSignEveryoneOut: (company: Company) => void;
  onTogglePause: (company: Company) => void;
  onManageInMembers?: (companyId: string) => void;
  onCompanyUpdated?: (company: Company) => void;
}

export const CompanyDetailSheet: React.FC<CompanyDetailSheetProps> = ({
  companyId,
  isOpen,
  onClose,
  currentUserCompanyId,
  memberCompanyIds = new Set(),
  members = [],
  onGiveAccess,
  onOpenBranding,
  onSignEveryoneOut,
  onTogglePause,
  onManageInMembers,
  onCompanyUpdated,
}) => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit details modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTimezone, setEditTimezone] = useState(DEFAULT_TIMEZONE);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const timezoneOptions = getTimezoneOptions();
  const [moduleDraft, setModuleDraft] = useState<string[]>([...COMPANY_MODULE_KEYS]);
  const [modulesDefault, setModulesDefault] = useState(true);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [modulesSaving, setModulesSaving] = useState(false);

  const loadDetail = async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ownerService.getCompany(id);
      setCompany(data);
      setEditTimezone(data.timezone || DEFAULT_TIMEZONE);
      setModulesLoading(true);
      try {
        const mods = await ownerService.getCompanyModules(id);
        setModulesDefault(mods.is_default);
        setModuleDraft(mods.enabled_modules ? [...mods.enabled_modules] : [...COMPANY_MODULE_KEYS]);
      } catch {
        setModulesDefault(true);
        setModuleDraft([...COMPANY_MODULE_KEYS]);
      } finally {
        setModulesLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load company details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && companyId) {
      loadDetail(companyId);
    } else {
      setCompany(null);
      setError(null);
    }
  }, [isOpen, companyId]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setIsSavingEdit(true);
    try {
      const updated = await ownerService.updateCompany(company.id, {
        timezone: editTimezone,
      });
      setCompany((prev) => (prev ? { ...prev, ...updated } : updated));
      onCompanyUpdated?.(updated);
      setIsEditOpen(false);
      addToast('Details updated', undefined, 'success');
    } catch (err: any) {
      addToast("Couldn't update details", err.message, 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (!isOpen) return null;

  const isOwnCompany = company ? company.id === currentUserCompanyId : false;
  const isMember = company ? isOwnCompany || memberCompanyIds.has(company.id) : false;
  const isPaused = company?.status === 'suspended';

  // Map created_by to member if found
  const creatorMember = company?.created_by
    ? members.find((m) => m.id === company.created_by)
    : null;
  const creatorName = creatorMember ? creatorMember.name : null;

  const userList = company?.users || [];
  const displayUsers = userList.slice(0, 5);
  const remainingCount = Math.max(0, userList.length - 5);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col h-full bg-surface">
          {isLoading ? (
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-md" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
              </div>
              <div className="space-y-3 pt-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            </div>
          ) : error ? (
            <div className="p-6">
              <ErrorState
                title="Couldn't load company details"
                message={error}
                onRetry={() => companyId && loadDetail(companyId)}
              />
            </div>
          ) : company ? (
            <div className="flex flex-col h-full overflow-y-auto">
              {/* Header */}
              <div className="p-6 border-b border-border space-y-4">
                <div className="flex items-start justify-between gap-3 pr-8">
                  <div className="flex items-center gap-3 min-w-0">
                    <CompanyMark
                      name={company.name}
                      logoUrl={company.logo_url}
                      accentColor={company.accent_color}
                      size={40}
                    />
                    <div className="min-w-0">
                      <h2 className="text-h2 font-semibold text-fg tracking-tight truncate inline-flex items-center gap-1.5 flex-wrap">
                        <span className="truncate">{company.name}</span>
                        {isOwnCompany && <Badge variant="default">Current</Badge>}
                      </h2>
                      <p className="text-caption text-fg-muted mt-0.5 truncate">
                        Created {formatCreatedDate(company.created_at)}
                        {creatorName && ` by ${creatorName}`}
                      </p>
                    </div>
                  </div>
                  <StatusPill
                    variant={isPaused ? 'warning' : 'success'}
                    label={isPaused ? 'Paused' : 'Active'}
                  />
                </div>

                {/* Primary Action Buttons */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {!isMember && onGiveAccess ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onGiveAccess(company)}
                    >
                      Give access
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Palette}
                    onClick={() => onOpenBranding(company)}
                  >
                    Branding
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Settings2}
                    onClick={() => setIsEditOpen(true)}
                  >
                    Edit details
                  </Button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6 flex-1">
                {/* Details KV */}
                <div className="space-y-3">
                  <div className="text-small font-semibold text-fg tracking-tight">Details</div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-ui">
                    <div>
                      <dt className="text-caption text-fg-muted">People</dt>
                      <dd className="font-medium text-fg mt-0.5">
                        {company.user_count ?? userList.length}{' '}
                        {(company.user_count ?? userList.length) === 1 ? 'person' : 'people'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-fg-muted">Time zone</dt>
                      <dd className="font-medium text-fg mt-0.5">{company.timezone || 'Asia/Karachi'}</dd>
                    </div>
                    <div>
                      <dt className="text-caption text-fg-muted">Short name</dt>
                      <dd className="font-mono text-small text-fg-muted mt-0.5 truncate" title={company.slug}>
                        {company.slug}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Modules */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-small font-semibold text-fg tracking-tight">Modules</div>
                    {modulesDefault && <Badge>Default (all modules)</Badge>}
                  </div>
                  {modulesLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    <div className="space-y-2">
                      {COMPANY_MODULE_KEYS.map((key) => (
                        <div key={key} className="flex items-center justify-between gap-3 py-1">
                          <span className="text-ui text-fg">{COMPANY_MODULE_LABELS[key as CompanyModuleKey]}</span>
                          <ToggleSwitch
                            checked={moduleDraft.includes(key)}
                            onChange={(checked) => {
                              setModuleDraft((prev) => {
                                if (checked) return Array.from(new Set([...prev, key]));
                                if (prev.length <= 1) return prev;
                                return prev.filter((k) => k !== key);
                              });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <Callout variant="info">
                    Changes apply within about 90 seconds; people already signed in see them after a refresh.
                  </Callout>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={modulesSaving}
                      disabled={modulesLoading || moduleDraft.length < 1}
                      onClick={async () => {
                        if (!company) return;
                        setModulesSaving(true);
                        try {
                          const saved = await ownerService.setCompanyModules(company.id, moduleDraft);
                          setModulesDefault(saved.is_default);
                          setModuleDraft(saved.enabled_modules ? [...saved.enabled_modules] : [...COMPANY_MODULE_KEYS]);
                          addToast('Modules updated', undefined, 'success');
                        } catch (err: any) {
                          addToast("Couldn't update modules", err.message, 'error');
                        } finally {
                          setModulesSaving(false);
                        }
                      }}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={modulesLoading || modulesSaving}
                      onClick={async () => {
                        if (!company) return;
                        const confirmed = await confirm({
                          title: 'Turn on all modules?',
                          description: 'Reset to default turns ON every module for this company. People will see them after a refresh.',
                          confirmLabel: 'Turn on all modules',
                          tone: 'danger',
                        });
                        if (!confirmed) return;
                        setModulesSaving(true);
                        try {
                          const saved = await ownerService.setCompanyModules(company.id, [...COMPANY_MODULE_KEYS]);
                          setModulesDefault(saved.is_default);
                          setModuleDraft([...COMPANY_MODULE_KEYS]);
                          addToast('Modules reset to default', undefined, 'success');
                        } catch (err: any) {
                          addToast("Couldn't reset modules", err.message, 'error');
                        } finally {
                          setModulesSaving(false);
                        }
                      }}
                    >
                      Reset to default
                    </Button>
                  </div>
                </div>

                {/* People with access */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-small font-semibold text-fg tracking-tight">
                      People with access ({userList.length})
                    </span>
                    {onManageInMembers && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onManageInMembers(company.id);
                        }}
                        className="text-xs text-accent hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Manage in Members</span>
                        <ArrowRight size={12} />
                      </button>
                    )}
                  </div>

                  {userList.length === 0 ? (
                    <p className="text-caption text-fg-muted py-2">No people found in this company.</p>
                  ) : (
                    <div className="space-y-2">
                      {displayUsers.map((u: any) => (
                        <div key={u.id || u.email} className="flex items-center justify-between gap-2 py-1.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar name={u.full_name || u.name} size={28} />
                            <div className="min-w-0">
                              <div className="text-ui font-medium text-fg truncate">
                                {u.full_name || u.name || u.email}
                              </div>
                              <div className="text-caption text-fg-muted truncate">
                                {getRoleDisplayName(u.role)}
                              </div>
                            </div>
                          </div>
                          {u.needs_setup && (
                            <StatusPill variant="warning" dot={false} label="Needs setup" />
                          )}
                        </div>
                      ))}
                      {remainingCount > 0 && (
                        <p className="text-caption text-fg-muted pt-1">
                          + {remainingCount} more
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Careful Section */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="text-small font-semibold text-danger-fg tracking-tight">Careful</div>
                  <div className="rounded-lg border border-danger-bd bg-danger-bg/25 p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-ui font-medium text-fg">Sign everyone out</div>
                        <div className="text-caption text-fg-muted mt-0.5 leading-normal">
                          Everyone has to log in again. Nothing is deleted.
                        </div>
                      </div>
                      <Button
                        variant="destructive-outline"
                        size="sm"
                        onClick={() => onSignEveryoneOut(company)}
                      >
                        Sign everyone out
                      </Button>
                    </div>

                    <div className="border-t border-danger-bd/60 pt-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-ui font-medium text-fg">
                          {isPaused ? 'Resume company' : 'Pause company'}
                        </div>
                        <div className="text-caption text-fg-muted mt-0.5 leading-normal">
                          {isOwnCompany
                            ? "You can't pause your own company."
                            : isPaused
                            ? 'People can log in again.'
                            : 'Nobody can log in until resumed.'}
                        </div>
                      </div>
                      <Button
                        variant="destructive-outline"
                        size="sm"
                        disabled={isOwnCompany}
                        onClick={() => onTogglePause(company)}
                      >
                        {isPaused ? 'Resume company' : 'Pause company'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Edit Details Small Modal */}
      {isEditOpen && (
        <Modal
          isOpen={isEditOpen}
          onClose={() => !isSavingEdit && setIsEditOpen(false)}
          title="Edit company details"
          maxWidth="sm"
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <FormField label="Time zone">
              {({ id }) => (
                <CustomSelect
                  id={id}
                  aria-label="Time zone"
                  value={editTimezone}
                  onChange={setEditTimezone}
                  options={timezoneOptions}
                  searchable
                  searchPlaceholder="Search time zones"
                />
              )}
            </FormField>

            <FormFooter className="-mx-5 -mb-5 sm:-mx-6 sm:-mb-6 rounded-b-lg">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsEditOpen(false)}
                disabled={isSavingEdit}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={isSavingEdit}>
                Save changes
              </Button>
            </FormFooter>
          </form>
        </Modal>
      )}
    </>
  );
};
