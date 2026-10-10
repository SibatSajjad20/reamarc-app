import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Save, AlertCircle, Calendar } from 'lucide-react';
import type { ContentCalendarItem, ContentCalendarConstants } from '../../types/contentCalendar';
import { contentCalendarService } from '../../services/contentCalendarService';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import {
  detectStageOwner,
  getApprovalStatusesForStage,
} from '../../utils/contentCalendarWorkflow';
import { focusFirstError } from '../../utils/formFocus';
import { FormErrorSummaryButton } from '../../hooks/useFormValidation';


interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<ContentCalendarItem>) => Promise<void>;
  item?: ContentCalendarItem | null;
  constants?: ContentCalendarConstants | null;
  activeClients?: Array<{ id: string; name: string }>;
}

export function findMatchingClient(
  clientName: string | undefined | null,
  clients: Array<{ id: string; name: string }> = []
): { id: string; name: string } | undefined {
  if (!clientName || !clients.length) return undefined;
  const target = clientName.trim().toLowerCase();
  const exact = clients.find((c) => c.name.toLowerCase() === target);
  if (exact) return exact;
  const cleanTarget = target.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const c of clients) {
    const cleanC = c.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanC === cleanTarget) return c;
  }
  const words = cleanTarget.split(' ').filter((w) => w.length > 2);
  return clients.find((c) => {
    const cleanC = c.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanC.includes(cleanTarget) || cleanTarget.includes(cleanC)) return true;
    return words.length >= 2 && words.every((w) => cleanC.includes(w));
  });
}

export const ContentCalendarModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  item,
  constants,
  activeClients = [],
}) => {
  const [formData, setFormData] = useState<Partial<ContentCalendarItem>>({
    serial: '',
    client_name: 'Apex Transfers LLC',
    campaign_type: '',
    creative_type: 'Video',
    content_type: 'Scheduled',
    creative_category: 'Organic Creative',
    posting_type: 'Organic Creative',
    content_pillar: '',
    content_concept: '',
    offer: '',
    production_direction: '',
    primary_text: '',
    headlines_hooks: '',
    content_on_creative: '',
    cta: '',
    captions_hashtags: '',
    design_owner: 'Content',
    design_due: '',
    publish_date: '',
    draft_preview_link: '',
    final_asset_link: '',
    approval_status: 'Content Draft',
    setup_status: 'Not Started',
    stage: 'Content',
    notes: '',
  });

  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const clientOptions = useMemo(() => {
    const base = activeClients && activeClients.length > 0
      ? activeClients.map((c) => ({ value: c.name, label: c.name }))
      : [{ value: 'Apex Transfers LLC', label: 'Apex Transfers LLC' }];
    if (formData.client_name && !base.some((o) => o.value === formData.client_name)) {
      return [{ value: formData.client_name, label: formData.client_name }, ...base];
    }
    return base;
  }, [activeClients, formData.client_name]);

  const creativeTypeOptions = useMemo(() => {
    const baseList = constants?.creative_types || ['Video', 'Reel', 'Carousel', 'Static', 'Story', 'UGC'];
    const current = formData.creative_type;
    const list = current && !baseList.includes(current) ? [...baseList, current] : baseList;
    return list.map((ct) => ({ value: ct, label: ct }));
  }, [constants?.creative_types, formData.creative_type]);

  const contentTypeOptions = useMemo(() => [
    { value: 'Scheduled', label: 'Scheduled Content' },
    { value: 'Runtime', label: 'Runtime Content' },
  ], []);

  const creativeCategoryOptions = useMemo(() => [
    { value: 'Organic Creative', label: 'Organic Creative (Social Media Team)' },
    { value: 'Ad Creative', label: 'Ad Creative (Performance Marketing Team)' },
  ], []);

  const approvalStatusOptions = useMemo(() => {
    const stageList = getApprovalStatusesForStage(formData.stage);
    const current = formData.approval_status;
    const list = current && !stageList.includes(current) ? [current, ...stageList] : stageList;
    return list.map((st) => ({ value: st, label: st }));
  }, [formData.stage, formData.approval_status]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (item) {
      const matchedWs = findMatchingClient(item.client_name, activeClients);
      const effectiveClientName = matchedWs ? matchedWs.name : (item.client_name || 'Apex Transfers LLC');
      const effectiveWsId = item.workspace_id || matchedWs?.id;
      const effectiveCategory = item.creative_category || item.posting_type || 'Organic Creative';
      setFormData({
        ...item,
        client_name: effectiveClientName,
        workspace_id: effectiveWsId,
        content_type: item.content_type || 'Scheduled',
        creative_category: effectiveCategory,
        posting_type: effectiveCategory,
        design_owner: detectStageOwner(item.stage, effectiveCategory),
      });
    } else {
      const defaultClient = activeClients && activeClients.length > 0 ? activeClients[0].name : 'Apex Transfers LLC';
      const defaultWsId = activeClients && activeClients.length > 0 ? activeClients[0].id : undefined;
      setFormData({
        serial: '',
        client_name: defaultClient,
        workspace_id: defaultWsId,
        campaign_type: '',
        creative_type: 'Video',
        content_type: 'Scheduled',
        creative_category: 'Organic Creative',
        posting_type: 'Organic Creative',
        content_pillar: '',
        content_concept: '',
        offer: '',
        production_direction: '',
        primary_text: '',
        headlines_hooks: '',
        content_on_creative: '',
        cta: '',
        captions_hashtags: '',
        design_owner: detectStageOwner('Content', 'Organic Creative'),
        design_due: '',
        publish_date: '',
        draft_preview_link: '',
        final_asset_link: '',
        approval_status: 'Content Draft',
        setup_status: 'Not Started',
        stage: 'Content',
        notes: '',
      });

      // Auto-generate serial formatted as C + Client Abbr + Number
      contentCalendarService
        .getNextSerial(defaultClient)
        .then((res) => {
          if (res?.serial) {
            setFormData((prev) => ({ ...prev, serial: res.serial }));
          }
        })
        .catch(() => {
          setFormData((prev) => ({ ...prev, serial: 'CAT-001' }));
        });
    }
    setFieldErrors({});
    setServerError(null);
    setHasSubmitted(false);
  }, [item, isOpen, activeClients]);

  const handleClientChange = (clientName: string) => {
    const matchedWs = findMatchingClient(clientName, activeClients);
    const resolvedName = matchedWs ? matchedWs.name : clientName;
    setFormData((prev) => ({
      ...prev,
      client_name: resolvedName,
      workspace_id: matchedWs?.id || prev.workspace_id,
    }));

    if (item && resolvedName === item.client_name) {
      setFormData((prev) => ({ ...prev, serial: item.serial }));
    } else {
      contentCalendarService
        .getNextSerial(resolvedName)
        .then((res) => {
          if (res?.serial) {
            setFormData((prev) => ({ ...prev, serial: res.serial }));
          }
        })
        .catch(() => {});
    }
  };

  if (!isOpen) return null;

  const validate = (data: typeof formData): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!data.client_name?.trim()) {
      errs.client_name = 'Client (Active) is required';
    }
    if (!data.creative_type?.trim()) {
      errs.creative_type = 'Creative Type is required';
    }
    if (!data.content_type?.trim()) {
      errs.content_type = 'Content Type (Scheduled / Runtime) is required';
    }
    if (!data.creative_category?.trim()) {
      errs.creative_category = 'Creative Category (Organic / Ad Creative) is required';
    }
    const concept = data.content_concept?.trim() || '';
    if (!concept) {
      errs.content_concept = 'Content concept / headline is required';
    } else if (concept.length > 300) {
      errs.content_concept = 'Content concept must be 300 characters or fewer';
    }
    if (!data.primary_text?.trim()) {
      errs.primary_text = 'Primary Text (Ad Copy — Versions A, B, C) is required';
    }
    if (!data.content_on_creative?.trim()) {
      errs.content_on_creative = 'Content On Creative (Overlay Text & Script) is required';
    }
    if (!data.design_due) {
      errs.design_due = 'Design Due date is required';
    } else if ((!item || data.design_due !== item.design_due) && data.design_due < todayStr) {
      errs.design_due = 'Design Due cannot be a past date; please select today or a future date';
    }
    if (!data.publish_date) {
      errs.publish_date = 'Publish Date is required';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.publish_date)) {
      errs.publish_date = 'Publish date must be a real calendar date';
    } else if ((!item || data.publish_date !== item.publish_date) && data.publish_date < todayStr) {
      errs.publish_date = 'Publish Date cannot be a past date; please select today or a future date';
    }

    for (const [field, label, value] of [
      ['draft_preview_link', 'Draft link', data.draft_preview_link],
      ['final_asset_link', 'Final asset link', data.final_asset_link],
    ] as const) {
      const link = (value || '').trim();
      if (!link) continue;
      try {
        const url = new URL(link);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          errs[field] = `${label} must start with http:// or https://`;
        }
      } catch {
        errs[field] = `${label} must be a full http or https URL`;
      }
    }
    return errs;
  };

  const updateField = (field: keyof typeof formData, value: any) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    if (hasSubmitted) {
      const currentErrs = validate(next);
      setFieldErrors((prev) => {
        const updated = { ...prev };
        if (currentErrs[field]) {
          updated[field] = currentErrs[field];
        } else {
          delete updated[field];
        }
        return updated;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);
    setServerError(null);

    const errs = validate(formData);
    setFieldErrors(errs);

    if (Object.keys(errs).length > 0) {
      setTimeout(() => {
        if (formRef.current) focusFirstError(formRef.current);
      }, 50);
      return;
    }

    setIsSubmitting(true);
    try {
      const concept = formData.content_concept?.trim() || '';
      const autoOwner = detectStageOwner(formData.stage, formData.creative_category);
      await onSave({
        ...formData,
        content_type: formData.content_type?.trim(),
        creative_category: formData.creative_category?.trim(),
        posting_type: formData.creative_category?.trim(),
        content_concept: concept,
        primary_text: formData.primary_text?.trim(),
        content_on_creative: formData.content_on_creative?.trim(),
        design_owner: autoOwner,
        serial: formData.serial?.trim() || undefined,
        draft_preview_link: formData.draft_preview_link?.trim() || undefined,
        final_asset_link: formData.final_asset_link?.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setServerError(err?.message || 'Failed to save item');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent maxWidth="lg" className="p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0">
              <Calendar className="w-4.5 h-4.5" />
            </div>
            <div>
              <DialogTitle className="text-ui font-semibold text-fg">
                {item ? `Edit campaign item: ${item.serial}` : 'Create new campaign item'}
              </DialogTitle>
              <DialogDescription className="text-caption text-fg-muted mt-0.5">
                Configure campaign strategy, copy, schedule, and assets
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Modal Form */}
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto p-6 space-y-5 select-text flex flex-col">
          {/* Section: Identity & Strategy */}
          <div className="space-y-3">
            <h3 className="text-micro font-semibold text-fg-muted uppercase tracking-wider">
              Identity & strategy
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Client (Active) *
                </label>
                <CustomSelect
                  size="sm"
                  name="client_name"
                  value={formData.client_name || 'Apex Transfers LLC'}
                  onChange={(val) => {
                    handleClientChange(val);
                    updateField('client_name', val);
                  }}
                  options={clientOptions}
                  error={fieldErrors.client_name}
                />
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Creative type *
                </label>
                <CustomSelect
                  size="sm"
                  name="creative_type"
                  value={formData.creative_type || 'Video'}
                  onChange={(val) => updateField('creative_type', val)}
                  options={creativeTypeOptions}
                  error={fieldErrors.creative_type}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Content type (Scheduled / Runtime) *
                </label>
                <CustomSelect
                  size="sm"
                  name="content_type"
                  value={formData.content_type || 'Scheduled'}
                  onChange={(val) => updateField('content_type', val)}
                  options={contentTypeOptions}
                  error={fieldErrors.content_type}
                />
                <p className="text-micro text-fg-muted mt-1">
                  Execution schedule: Scheduled vs Runtime task content
                </p>
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Creative category (Organic / Ad) *
                </label>
                <CustomSelect
                  size="sm"
                  name="creative_category"
                  value={formData.creative_category || 'Organic Creative'}
                  onChange={(val) => {
                    const next = {
                      ...formData,
                      creative_category: val,
                      posting_type: val,
                      design_owner: detectStageOwner(formData.stage, val),
                    };
                    setFormData(next);
                    if (hasSubmitted) {
                      const cur = validate(next);
                      setFieldErrors(cur);
                    }
                  }}
                  options={creativeCategoryOptions}
                  error={fieldErrors.creative_category}
                />
                <p className="text-micro text-fg-muted mt-1">
                  Routes posting to Social Media (Organic) or Performance Marketing (Ad)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Campaign type
                </label>
                <input
                  type="text"
                  name="campaign_type"
                  placeholder="e.g. Cold audience awareness"
                  value={formData.campaign_type || ''}
                  onChange={(e) => updateField('campaign_type', e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Content pillar / theme
                </label>
                <input
                  type="text"
                  name="content_pillar"
                  placeholder="e.g. Production advantage"
                  value={formData.content_pillar || ''}
                  onChange={(e) => updateField('content_pillar', e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-caption font-medium text-fg mb-1">
                Content concept / headline *
              </label>
              <input
                type="text"
                name="content_concept"
                placeholder="e.g. The Hidden Cost of an Unreliable Production Partner"
                value={formData.content_concept || ''}
                onChange={(e) => updateField('content_concept', e.target.value)}
                aria-invalid={!!fieldErrors.content_concept}
                className={`w-full px-3 py-1.5 rounded-md text-xs bg-subtle border text-fg placeholder:text-fg-muted focus:outline-hidden ${
                  fieldErrors.content_concept ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border focus:border-accent'
                }`}
              />
              {fieldErrors.content_concept && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-status-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{fieldErrors.content_concept}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Offer
                </label>
                <input
                  type="text"
                  name="offer"
                  placeholder="e.g. Sample pack"
                  value={formData.offer || ''}
                  onChange={(e) => updateField('offer', e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  CTA
                </label>
                <input
                  type="text"
                  name="cta"
                  placeholder="e.g. Request your sample pack"
                  value={formData.cta || ''}
                  onChange={(e) => updateField('cta', e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section: Copywriting & Production */}
          <div className="space-y-3 pt-3 border-t border-border">
            <h3 className="text-micro font-semibold text-fg-muted uppercase tracking-wider">
              Copywriting & production
            </h3>

            <div>
              <label className="block text-caption font-medium text-fg mb-1">
                Primary text (Ad copy — Versions A, B, C) *
              </label>
              <textarea
                rows={4}
                name="primary_text"
                placeholder="--- Version A ---\nAd copy...\n\n--- Version B ---"
                value={formData.primary_text || ''}
                onChange={(e) => updateField('primary_text', e.target.value)}
                aria-invalid={!!fieldErrors.primary_text}
                className={`w-full px-3 py-2 rounded-md text-xs bg-subtle border text-fg placeholder:text-fg-muted focus:outline-hidden font-sans ${
                  fieldErrors.primary_text ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border focus:border-accent'
                }`}
              />
              {fieldErrors.primary_text && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-status-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{fieldErrors.primary_text}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-caption font-medium text-fg mb-1">
                Headlines / hooks library
              </label>
              <textarea
                rows={3}
                name="headlines_hooks"
                placeholder="Hook 1: ...\nHook 2: ..."
                value={formData.headlines_hooks || ''}
                onChange={(e) => updateField('headlines_hooks', e.target.value)}
                className="w-full px-3 py-2 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden font-sans"
              />
            </div>

            <div>
              <label className="block text-caption font-medium text-fg mb-1">
                Content on creative (Overlay text & script) *
              </label>
              <textarea
                rows={3}
                name="content_on_creative"
                placeholder="Opening (0–5 sec)\nVisual: ...\nVO: ..."
                value={formData.content_on_creative || ''}
                onChange={(e) => updateField('content_on_creative', e.target.value)}
                aria-invalid={!!fieldErrors.content_on_creative}
                className={`w-full px-3 py-2 rounded-md text-xs bg-subtle border text-fg placeholder:text-fg-muted focus:outline-hidden font-sans ${
                  fieldErrors.content_on_creative ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border focus:border-accent'
                }`}
              />
              {fieldErrors.content_on_creative && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-status-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{fieldErrors.content_on_creative}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-caption font-medium text-fg mb-1">
                Production direction
              </label>
              <textarea
                rows={2}
                name="production_direction"
                placeholder="Industrial documentary style, 60–75s..."
                value={formData.production_direction || ''}
                onChange={(e) => updateField('production_direction', e.target.value)}
                className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-caption font-medium text-fg mb-1">
                Captions / hashtags / keywords
              </label>
              <input
                type="text"
                name="captions_hashtags"
                placeholder="#dtftransfers #decorators #apextransfers"
                value={formData.captions_hashtags || ''}
                onChange={(e) => updateField('captions_hashtags', e.target.value)}
                className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden font-mono"
              />
            </div>
          </div>

          {/* Section: Workflow & Statuses */}
          <div className="space-y-3 pt-3 border-t border-border">
            <h3 className="text-micro font-semibold text-fg-muted uppercase tracking-wider">
              Workflow & statuses
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Design due *
                </label>
                <CustomDatePicker
                  name="design_due"
                  value={formData.design_due || ''}
                  onChange={(val) => updateField('design_due', val)}
                  minDate={!item ? todayStr : undefined}
                  error={fieldErrors.design_due}
                />
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Publish date *
                </label>
                <CustomDatePicker
                  name="publish_date"
                  value={formData.publish_date || ''}
                  onChange={(val) => updateField('publish_date', val)}
                  minDate={!item ? todayStr : undefined}
                  error={fieldErrors.publish_date}
                />
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Approval status
                </label>
                <CustomSelect
                  size="sm"
                  name="approval_status"
                  value={formData.approval_status || 'Content Draft'}
                  onChange={(val) => updateField('approval_status', val)}
                  options={approvalStatusOptions}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Draft / preview link
                </label>
                <input
                  type="url"
                  name="draft_preview_link"
                  placeholder="https://..."
                  value={formData.draft_preview_link || ''}
                  onChange={(e) => updateField('draft_preview_link', e.target.value)}
                  aria-invalid={!!fieldErrors.draft_preview_link}
                  className={`w-full px-3 py-1.5 rounded-md text-xs bg-subtle border text-fg placeholder:text-fg-muted focus:outline-hidden ${
                    fieldErrors.draft_preview_link ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border focus:border-accent'
                  }`}
                />
                {fieldErrors.draft_preview_link && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-status-danger-fg" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{fieldErrors.draft_preview_link}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Final asset link
                </label>
                <input
                  type="url"
                  name="final_asset_link"
                  placeholder="https://..."
                  value={formData.final_asset_link || ''}
                  onChange={(e) => updateField('final_asset_link', e.target.value)}
                  aria-invalid={!!fieldErrors.final_asset_link}
                  className={`w-full px-3 py-1.5 rounded-md text-xs bg-subtle border text-fg placeholder:text-fg-muted focus:outline-hidden ${
                    fieldErrors.final_asset_link ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border focus:border-accent'
                  }`}
                />
                {fieldErrors.final_asset_link && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-status-danger-fg" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{fieldErrors.final_asset_link}</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-caption font-medium text-fg mb-1">
                Comments
              </label>
              <textarea
                rows={2}
                name="notes"
                placeholder="Additional comments or production feedback..."
                value={formData.notes || ''}
                onChange={(e) => updateField('notes', e.target.value)}
                className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
              />
            </div>
          </div>

          {/* Sticky Modal Footer */}
          <div className="sticky bottom-0 bg-surface -mx-6 -mb-6 p-4 px-6 border-t border-border flex items-center justify-between gap-2.5 mt-auto z-10">
            <div className="flex items-center gap-3">
              <FormErrorSummaryButton
                count={Object.keys(fieldErrors).length}
                onClick={() => {
                  if (formRef.current) focusFirstError(formRef.current);
                }}
              />
              {serverError && (
                <div className="flex items-center gap-1.5 text-xs text-status-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2.5 ml-auto">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                <span>{isSubmitting ? 'Saving...' : item ? 'Update item' : 'Create item'}</span>
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
