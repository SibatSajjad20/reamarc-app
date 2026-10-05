import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, AlertCircle, Calendar } from 'lucide-react';
import type { ContentCalendarItem, ContentCalendarConstants } from '../../types/contentCalendar';
import { contentCalendarService } from '../../services/contentCalendarService';
import { CustomSelect } from '../ui/CustomSelect';
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
      setFormData({
        ...item,
        client_name: effectiveClientName,
        workspace_id: effectiveWsId,
        design_owner: detectStageOwner(item.stage),
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
        content_pillar: '',
        content_concept: '',
        offer: '',
        production_direction: '',
        primary_text: '',
        headlines_hooks: '',
        content_on_creative: '',
        cta: '',
        captions_hashtags: '',
        design_owner: detectStageOwner('Content'),
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
      const autoOwner = detectStageOwner(formData.stage);
      await onSave({
        ...formData,
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
    <div className="fixed inset-0 z-50 overflow-y-auto select-none flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      <div className="relative bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/90 dark:bg-[#151722]/90 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Calendar className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {item ? `Edit Campaign Item: ${item.serial}` : 'Create New Campaign Item'}
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Configure campaign strategy, copy, schedule, and assets
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 select-text">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section: Identity & Strategy */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Identity & Strategy
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
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
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Creative Type *
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
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Campaign Type
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cold audience awareness"
                  value={formData.campaign_type || ''}
                  onChange={(e) => setFormData({ ...formData, campaign_type: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Content Pillar / Theme
                </label>
                <input
                  type="text"
                  placeholder="e.g. Production advantage"
                  value={formData.content_pillar || ''}
                  onChange={(e) => setFormData({ ...formData, content_pillar: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Content Concept / Headline *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. The Hidden Cost of an Unreliable Production Partner"
                value={formData.content_concept || ''}
                onChange={(e) => setFormData({ ...formData, content_concept: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Offer
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sample pack"
                  value={formData.offer || ''}
                  onChange={(e) => setFormData({ ...formData, offer: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  CTA
                </label>
                <input
                  type="text"
                  placeholder="e.g. Request your sample pack"
                  value={formData.cta || ''}
                  onChange={(e) => setFormData({ ...formData, cta: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Section: Copywriting & Production */}
          <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Copywriting & Production
            </h3>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Primary Text (Ad Copy — Versions A, B, C) *
              </label>
              <textarea
                rows={4}
                required
                placeholder="--- Version A ---\nAd copy...\n\n--- Version B ---"
                value={formData.primary_text || ''}
                onChange={(e) => setFormData({ ...formData, primary_text: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-indigo-500 font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Headlines / Hooks Library
              </label>
              <textarea
                rows={3}
                placeholder="Hook 1: ...\nHook 2: ..."
                value={formData.headlines_hooks || ''}
                onChange={(e) => setFormData({ ...formData, headlines_hooks: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-indigo-500 font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Content On Creative (Overlay Text & Script) *
              </label>
              <textarea
                rows={3}
                required
                placeholder="Opening (0–5 sec)\nVisual: ...\nVO: ..."
                value={formData.content_on_creative || ''}
                onChange={(e) => setFormData({ ...formData, content_on_creative: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-indigo-500 font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Production Direction
              </label>
              <textarea
                rows={2}
                placeholder="Industrial documentary style, 60–75s..."
                value={formData.production_direction || ''}
                onChange={(e) => setFormData({ ...formData, production_direction: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Captions / Hashtags / Keywords
              </label>
              <input
                type="text"
                placeholder="#dtftransfers #decorators #apextransfers"
                value={formData.captions_hashtags || ''}
                onChange={(e) => setFormData({ ...formData, captions_hashtags: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono"
              />
            </div>
          </div>

          {/* Section: Workflow & Statuses */}
          <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Workflow & Statuses
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Design Due *
                </label>
                <input
                  type="date"
                  required
                  min={!item ? todayStr : undefined}
                  value={formData.design_due || ''}
                  onChange={(e) => setFormData({ ...formData, design_due: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-numeric font-medium cursor-pointer focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Publish Date *
                </label>
                <input
                  type="date"
                  required
                  min={!item ? todayStr : undefined}
                  value={formData.publish_date || ''}
                  onChange={(e) => setFormData({ ...formData, publish_date: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-numeric font-medium cursor-pointer focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Approval Status
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
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Draft / Preview Link
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={formData.draft_preview_link || ''}
                  onChange={(e) => setFormData({ ...formData, draft_preview_link: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Final Asset Link
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={formData.final_asset_link || ''}
                  onChange={(e) => setFormData({ ...formData, final_asset_link: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Comments
              </label>
              <textarea
                rows={2}
                placeholder="Additional comments or production feedback..."
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Saving...' : item ? 'Update Item' : 'Create Item'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
