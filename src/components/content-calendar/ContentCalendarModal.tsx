import React, { useState, useEffect, useMemo } from 'react';
import { Save, AlertCircle, Calendar } from 'lucide-react';
import type { ContentCalendarItem, ContentCalendarConstants } from '../../types/contentCalendar';
import { contentCalendarService } from '../../services/contentCalendarService';
import { CustomSelect } from '../ui/CustomSelect';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import {
  detectStageOwner,
  getApprovalStatusesForStage,
} from '../../utils/contentCalendarWorkflow';


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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_name?.trim()) {
      setError('Client (Active) is required');
      return;
    }
    if (!formData.creative_type?.trim()) {
      setError('Creative Type is required');
      return;
    }
    if (!formData.content_type?.trim()) {
      setError('Content Type (Scheduled / Runtime) is required');
      return;
    }
    if (!formData.creative_category?.trim()) {
      setError('Creative Category (Organic / Ad Creative) is required');
      return;
    }
    const concept = formData.content_concept?.trim() || '';
    if (!concept) {
      setError('Content concept / headline is required');
      return;
    }
    if (concept.length > 300) {
      setError('Content concept must be 300 characters or fewer');
      return;
    }
    if (!formData.primary_text?.trim()) {
      setError('Primary Text (Ad Copy — Versions A, B, C) is required');
      return;
    }
    if (!formData.content_on_creative?.trim()) {
      setError('Content On Creative (Overlay Text & Script) is required');
      return;
    }
    if (!formData.design_due) {
      setError('Design Due date is required');
      return;
    }
    if ((!item || formData.design_due !== item.design_due) && formData.design_due < todayStr) {
      setError('Design Due cannot be a past date; please select today or a future date');
      return;
    }
    if (!formData.publish_date) {
      setError('Publish Date is required');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.publish_date)) {
      setError('Publish date must be a real calendar date');
      return;
    }
    if ((!item || formData.publish_date !== item.publish_date) && formData.publish_date < todayStr) {
      setError('Publish Date cannot be a past date; please select today or a future date');
      return;
    }
    for (const [label, value] of [
      ['Draft link', formData.draft_preview_link],
      ['Final asset link', formData.final_asset_link],
    ] as const) {
      const link = (value || '').trim();
      if (!link) continue;
      try {
        const url = new URL(link);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          setError(`${label} must start with http:// or https://`);
          return;
        }
      } catch {
        setError(`${label} must be a full http or https URL`);
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);
    try {
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
      setError(err?.message || 'Failed to save item');
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent maxWidth="lg" className="p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface">
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 select-text">
          {error && (
            <div className="p-3 rounded-md bg-status-danger-soft border border-status-danger-border flex items-center gap-2 text-xs text-status-danger-fg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

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
                  value={formData.client_name || 'Apex Transfers LLC'}
                  onChange={(val) => handleClientChange(val)}
                  options={clientOptions}
                />
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Creative type *
                </label>
                <CustomSelect
                  size="sm"
                  value={formData.creative_type || 'Video'}
                  onChange={(val) => setFormData({ ...formData, creative_type: val })}
                  options={creativeTypeOptions}
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
                  value={formData.content_type || 'Scheduled'}
                  onChange={(val) => setFormData({ ...formData, content_type: val })}
                  options={contentTypeOptions}
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
                  value={formData.creative_category || 'Organic Creative'}
                  onChange={(val) =>
                    setFormData({
                      ...formData,
                      creative_category: val,
                      posting_type: val,
                      design_owner: detectStageOwner(formData.stage, val),
                    })
                  }
                  options={creativeCategoryOptions}
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
                  placeholder="e.g. Cold audience awareness"
                  value={formData.campaign_type || ''}
                  onChange={(e) => setFormData({ ...formData, campaign_type: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Content pillar / theme
                </label>
                <input
                  type="text"
                  placeholder="e.g. Production advantage"
                  value={formData.content_pillar || ''}
                  onChange={(e) => setFormData({ ...formData, content_pillar: e.target.value })}
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
                required
                placeholder="e.g. The Hidden Cost of an Unreliable Production Partner"
                value={formData.content_concept || ''}
                onChange={(e) => setFormData({ ...formData, content_concept: e.target.value })}
                className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Offer
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sample pack"
                  value={formData.offer || ''}
                  onChange={(e) => setFormData({ ...formData, offer: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  CTA
                </label>
                <input
                  type="text"
                  placeholder="e.g. Request your sample pack"
                  value={formData.cta || ''}
                  onChange={(e) => setFormData({ ...formData, cta: e.target.value })}
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
                required
                placeholder="--- Version A ---\nAd copy...\n\n--- Version B ---"
                value={formData.primary_text || ''}
                onChange={(e) => setFormData({ ...formData, primary_text: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden font-sans"
              />
            </div>

            <div>
              <label className="block text-caption font-medium text-fg mb-1">
                Headlines / hooks library
              </label>
              <textarea
                rows={3}
                placeholder="Hook 1: ...\nHook 2: ..."
                value={formData.headlines_hooks || ''}
                onChange={(e) => setFormData({ ...formData, headlines_hooks: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden font-sans"
              />
            </div>

            <div>
              <label className="block text-caption font-medium text-fg mb-1">
                Content on creative (Overlay text & script) *
              </label>
              <textarea
                rows={3}
                required
                placeholder="Opening (0–5 sec)\nVisual: ...\nVO: ..."
                value={formData.content_on_creative || ''}
                onChange={(e) => setFormData({ ...formData, content_on_creative: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden font-sans"
              />
            </div>

            <div>
              <label className="block text-caption font-medium text-fg mb-1">
                Production direction
              </label>
              <textarea
                rows={2}
                placeholder="Industrial documentary style, 60–75s..."
                value={formData.production_direction || ''}
                onChange={(e) => setFormData({ ...formData, production_direction: e.target.value })}
                className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-caption font-medium text-fg mb-1">
                Captions / hashtags / keywords
              </label>
              <input
                type="text"
                placeholder="#dtftransfers #decorators #apextransfers"
                value={formData.captions_hashtags || ''}
                onChange={(e) => setFormData({ ...formData, captions_hashtags: e.target.value })}
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
                <input
                  type="date"
                  required
                  min={!item ? todayStr : undefined}
                  value={formData.design_due || ''}
                  onChange={(e) => setFormData({ ...formData, design_due: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg font-mono cursor-pointer focus:border-accent focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Publish date *
                </label>
                <input
                  type="date"
                  required
                  min={!item ? todayStr : undefined}
                  value={formData.publish_date || ''}
                  onChange={(e) => setFormData({ ...formData, publish_date: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg font-mono cursor-pointer focus:border-accent focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Approval status
                </label>
                <CustomSelect
                  size="sm"
                  value={formData.approval_status || 'Content Draft'}
                  onChange={(val) => setFormData({ ...formData, approval_status: val })}
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
                  placeholder="https://..."
                  value={formData.draft_preview_link || ''}
                  onChange={(e) => setFormData({ ...formData, draft_preview_link: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-caption font-medium text-fg mb-1">
                  Final asset link
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={formData.final_asset_link || ''}
                  onChange={(e) => setFormData({ ...formData, final_asset_link: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-caption font-medium text-fg mb-1">
                Comments
              </label>
              <textarea
                rows={2}
                placeholder="Additional comments or production feedback..."
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-1.5 rounded-md text-xs bg-subtle border border-border text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-border flex items-center justify-end gap-2.5">
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
        </form>
      </DialogContent>
    </Dialog>
  );
};
