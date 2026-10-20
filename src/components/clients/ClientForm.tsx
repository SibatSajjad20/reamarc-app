import React, { useRef } from 'react';
import { AlertCircle, Calendar, CheckCircle2, Download, ExternalLink, FileText, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { SegmentedControl } from '../ui/SegmentedControl';
import { cn } from '../../lib/utils';
import { downloadFileAttachment, openFileAttachment } from '../../utils/fileUrl';
import { ClientLogoField } from './ClientLogoField';
import {
  AVAILABLE_SERVICES, BRAND_PRESETS, HEALTH_OPTIONS, PRIORITIES, PROJECT_CYCLES, type useClientForm,
} from '../../hooks/useClientForm';
import type { Workspace } from '../../types';

type FormApi = ReturnType<typeof useClientForm>;
const inputClass = 'w-full bg-subtle border border-border focus:border-accent rounded-lg px-3.5 py-2.5 text-xs font-semibold text-fg placeholder:text-fg-muted focus:outline-hidden';

interface Props {
  form: FormApi;
  workspace: Workspace | null;
  canManage: boolean;
  onWorkspacePatched?: (ws: Workspace) => void;
  sectionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
}

export const ClientForm: React.FC<Props> = ({ form, workspace, canManage, onWorkspacePatched, sectionRefs }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { values, patch, fieldErrors, hasAttemptedSubmit, setFieldErrors } = form;
  const setSection = (id: string) => (el: HTMLElement | null) => { sectionRefs.current[id] = el; };

  return (
    <div className="space-y-4">
      <section ref={setSection('basics')} id="section-basics" className="bg-surface border border-border rounded-xl p-[18px] space-y-4">
        <div><h2 className="text-sm font-semibold text-fg">Basics</h2><p className="text-xs text-fg-muted">Name, status, contract and services.</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="workspace-name" className="block text-xs font-medium text-fg mb-1.5">Client Name / Brand Name <span className="text-danger-fg">*</span></label>
            <input id="workspace-name" value={values.name} aria-invalid={Boolean(fieldErrors.name)} className={cn(inputClass, fieldErrors.name && 'border-danger-dot')} onChange={(e) => {
              patch({ name: e.target.value });
              if (hasAttemptedSubmit && e.target.value.trim()) setFieldErrors((p) => { const c = { ...p }; delete c.name; return c; });
            }} />
            {fieldErrors.name && <p role="alert" className="text-small text-danger-fg mt-1 flex items-center gap-1"><AlertCircle size={14} />{fieldErrors.name}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-fg mb-1.5">Initials</label>
            <input maxLength={4} value={values.initials} onChange={(e) => patch({ initials: e.target.value.toUpperCase() })} className={cn(inputClass, 'uppercase font-mono text-center')} />
          </div>
        </div>
        <SegmentedControl
          block
          value={values.status}
          onValueChange={(v) => patch({ status: v as 'active' | 'inactive' })}
          options={[
            { value: 'active', label: 'Active · visible to team' },
            { value: 'inactive', label: 'Inactive · operations only' },
          ]}
          aria-label="Workspace status"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CustomSelect label="Project cycle" value={values.projectCycle} onChange={(v) => patch({ projectCycle: v as any })} options={PROJECT_CYCLES} />
          <CustomSelect label="Priority" value={values.priority} onChange={(v) => patch({ priority: v as any })} options={PRIORITIES} />
          <CustomSelect label="Account health" value={values.health} onChange={(v) => patch({ health: v as any })} options={HEALTH_OPTIONS} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-fg mb-1.5"><Calendar className="w-3.5 h-3.5 inline" /> Contract start *</label>
            <CustomDatePicker value={values.contractStartDate} error={fieldErrors.contractStartDate} onChange={(val) => { patch({ contractStartDate: val }); if (hasAttemptedSubmit && val.trim()) setFieldErrors((p) => { const c = { ...p }; delete c.contractStartDate; return c; }); }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg mb-1.5">Contract end *</label>
            <CustomDatePicker value={values.contractEndDate} error={fieldErrors.contractEndDate} minDate={values.contractStartDate} onChange={(val) => { patch({ contractEndDate: val }); if (hasAttemptedSubmit && val.trim()) setFieldErrors((p) => { const c = { ...p }; delete c.contractEndDate; return c; }); }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_SERVICES.map((s) => {
            const on = values.selectedServices.includes(s);
            return <button key={s} type="button" onClick={() => form.toggleService(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${on ? 'bg-accent text-accent-fg' : 'bg-subtle text-fg-muted border border-border'}`}>{on && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />}{s}</button>;
          })}
        </div>
        {fieldErrors.services && <p role="alert" className="text-small text-danger-fg">{fieldErrors.services}</p>}
      </section>

      <section ref={setSection('logo')} id="section-logo" className="bg-surface border border-border rounded-xl p-[18px] space-y-4">
        <div><h2 className="text-sm font-semibold text-fg">Logo & colour</h2><p className="text-xs text-fg-muted">Used for initials when there&apos;s no logo.</p></div>
        <ClientLogoField workspaceId={workspace?.id} name={values.name} brandColor={values.brandColor} initials={values.initials} logoUrl={workspace?.logo_url} canManage={canManage} pendingFile={form.pendingLogoFile} localPreviewUrl={form.pendingLogoPreview} onPendingFile={form.setPendingLogo} onWorkspacePatched={onWorkspacePatched} />
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-subtle border border-border">
          {BRAND_PRESETS.map((c) => (
            <button key={c.value} type="button" title={c.name} onClick={() => patch({ brandColor: c.value })} style={{ backgroundColor: c.value }} className={`w-7 h-7 rounded-lg border-2 ${values.brandColor.toLowerCase() === c.value.toLowerCase() ? 'border-white ring-2 ring-accent' : 'border-transparent'}`} />
          ))}
          <input type="color" value={values.brandColor.length === 7 ? values.brandColor : '#4f46e5'} onChange={(e) => patch({ brandColor: e.target.value })} className="w-8 h-8" />
          <input maxLength={7} value={values.brandColor} onChange={(e) => patch({ brandColor: e.target.value })} className="w-24 px-2 py-1 text-xs font-mono border border-border rounded-lg" />
        </div>
      </section>

      <section ref={setSection('contacts')} id="section-contacts" className="bg-surface border border-border rounded-xl p-[18px] space-y-4">
        <div><h2 className="text-sm font-semibold text-fg">Contacts</h2><p className="text-xs text-fg-muted">Hidden from team members</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <input className={inputClass} placeholder="POC name" value={values.pocName} onChange={(e) => patch({ pocName: e.target.value })} />
          <input className={inputClass} placeholder="POC email" value={values.pocEmail} onChange={(e) => patch({ pocEmail: e.target.value })} />
          <input className={inputClass} placeholder="POC phone" value={values.pocPhone} onChange={(e) => patch({ pocPhone: e.target.value })} />
          <input className={inputClass} placeholder="Billing name" value={values.billingName} onChange={(e) => patch({ billingName: e.target.value })} />
          <input className={inputClass} placeholder="Billing email" value={values.billingEmail} onChange={(e) => patch({ billingEmail: e.target.value })} />
          <input className={inputClass} placeholder="Billing phone" value={values.billingPhone} onChange={(e) => patch({ billingPhone: e.target.value })} />
        </div>
      </section>

      <section ref={setSection('proposal')} id="section-proposal" className="bg-surface border border-border rounded-xl p-[18px] space-y-3">
        <h2 className="text-sm font-semibold text-fg">Proposal / agreement</h2>
        {form.uploadError && <div className="text-xs text-danger-fg">{form.uploadError}</div>}
        {values.proposalUrl ? (
          <div className="flex items-center justify-between p-3 rounded-xl bg-subtle border border-border text-xs">
            <span className="flex items-center gap-2 min-w-0"><FileText className="w-4 h-4" /><span className="truncate">{values.proposalName || 'Proposal'}</span></span>
            <span className="flex gap-1">
              <button type="button" onClick={() => openFileAttachment(values.proposalUrl, values.proposalName)}><ExternalLink className="w-4 h-4" /></button>
              <button type="button" onClick={() => downloadFileAttachment(values.proposalUrl, values.proposalName)}><Download className="w-4 h-4" /></button>
              <button type="button" onClick={() => patch({ proposalUrl: '', proposalName: '', proposalSize: undefined })}><Trash2 className="w-4 h-4" /></button>
            </span>
          </div>
        ) : (
          <>
            <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xlsx,.xls,.zip,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) void form.handleProposalFileUpload(f); e.target.value = ''; }} />
            <button type="button" disabled={form.isUploadingProposal} onClick={() => fileInputRef.current?.click()} className="w-full py-4 border border-dashed border-border rounded-xl text-xs text-fg-muted">
              {form.isUploadingProposal ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</span> : <span className="inline-flex items-center gap-2"><UploadCloud className="w-5 h-5" /> Click to upload (max 25MB)</span>}
            </button>
          </>
        )}
      </section>
    </div>
  );
};
