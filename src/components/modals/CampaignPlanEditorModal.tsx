import React, { useState } from 'react';
import type { Campaign, DayPlan, PlatformType } from '../../types';
import { campaignService } from '../../services/campaignService';
import { useToast } from '../../context/ToastContext';
import { HasPermission } from '../HasPermission';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Sparkles,
  Save,
  RefreshCw,
} from 'lucide-react';

interface CampaignPlanEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign | null;
  onCampaignUpdated: (updatedCampaign: Campaign) => void;
}

const PLATFORM_OPTIONS: PlatformType[] = ['Instagram', 'LinkedIn', 'Facebook', 'Twitter'];

export const CampaignPlanEditorModal: React.FC<CampaignPlanEditorModalProps> = ({
  isOpen,
  onClose,
  campaign,
  onCampaignUpdated,
}) => {
  const { addToast } = useToast();
  const { role } = useAuth();
  const canEdit = role === 'admin' || role === 'member';

  const [activeDayEditing, setActiveDayEditing] = useState<number | null>(null);
  const [editingTopic, setEditingTopic] = useState('');
  const [editingPreview, setEditingPreview] = useState('');
  const [editingPlatform, setEditingPlatform] = useState<PlatformType>('LinkedIn');

  const [pendingEdits, setPendingEdits] = useState<{ [day: number]: DayPlan }>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [regeneratingDay, setRegeneratingDay] = useState<number | null>(null);

  if (!isOpen || !campaign) return null;

  const currentPlan: DayPlan[] = (campaign.plan || []).map((dp) =>
    pendingEdits[dp.day] ? pendingEdits[dp.day] : dp
  );

  const handleStartEdit = (dayItem: DayPlan) => {
    if (!canEdit) return;
    setActiveDayEditing(dayItem.day);
    setEditingTopic(dayItem.topic);
    setEditingPreview(dayItem.preview);
    setEditingPlatform(dayItem.platform || 'LinkedIn');
  };

  const handleSaveDayEdit = (day: number) => {
    if (!canEdit) return;
    if (!editingTopic.trim()) {
      addToast('Validation Warning', 'Topic title cannot be empty.', 'warning');
      return;
    }
    const updatedItem: DayPlan = {
      day,
      topic: editingTopic.trim(),
      preview: editingPreview.trim(),
      platform: editingPlatform,
    };
    setPendingEdits((prev) => ({ ...prev, [day]: updatedItem }));
    setActiveDayEditing(null);
    addToast(`Day ${day} Edit Staged`, 'Click "Save Changes" to commit updates.', 'info');
  };

  const handleRegenerateDay = async (day: number) => {
    if (!canEdit) return;
    setRegeneratingDay(day);
    try {
      const updatedCampaign = await campaignService.regenerateDayPlanItem(campaign.id, day);
      const newDayPlan = updatedCampaign.plan?.find((d) => d.day === day);
      if (newDayPlan) {
        setPendingEdits((prev) => ({ ...prev, [day]: newDayPlan }));
      }
      addToast(`Day ${day} AI Regenerated ✨`, 'New angle generated with Gemini AI.', 'success');
    } catch (err: any) {
      addToast('Regeneration Error', err.message || 'Failed to regenerate day.', 'error');
    } finally {
      setRegeneratingDay(null);
    }
  };

  const handleSaveAllChanges = async () => {
    if (!canEdit || Object.keys(pendingEdits).length === 0) return;
    setIsSavingAll(true);
    try {
      let latestCampaign = campaign;
      for (const dayStr of Object.keys(pendingEdits)) {
        const dayNum = parseInt(dayStr, 10);
        const editPayload = pendingEdits[dayNum];
        latestCampaign = await campaignService.updateDayPlanItem(campaign.id, dayNum, {
          topic: editPayload.topic,
          platform: editPayload.platform,
          preview: editPayload.preview,
        });
      }
      onCampaignUpdated(latestCampaign);
      setPendingEdits({});
      addToast('Plan Saved! 🚀', 'Campaign roadmap successfully updated.', 'success');
      onClose();
    } catch (err: any) {
      addToast('Save Failed', err.message || 'Could not save campaign plan.', 'error');
    } finally {
      setIsSavingAll(false);
    }
  };

  const hasPendingEdits = Object.keys(pendingEdits).length > 0;

  return (
    <div className="fixed inset-0 bg-slate-900/70 dark:bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-600 dark:text-purple-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                {canEdit ? 'Edit' : 'View'} {campaign.totalDays || campaign.plan?.length || 7}-Day Campaign Plan
                {hasPendingEdits && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-500/30">
                    Unsaved Edits
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 font-medium">
                {campaign.title} • {campaign.targetAudience}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Day Items List */}
        <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
          {currentPlan.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs">
              No {campaign.totalDays || 7}-day schedule available for this campaign.
            </div>
          ) : (
            currentPlan.map((dayItem) => {
              const isEditing = activeDayEditing === dayItem.day && canEdit;
              const isStaged = Boolean(pendingEdits[dayItem.day]);
              const isRegenerating = regeneratingDay === dayItem.day;

              return (
                <div
                  key={dayItem.day}
                  className={`p-4 rounded-2xl border transition-all ${
                    isStaged
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-500/40'
                      : 'bg-zinc-50 dark:bg-zinc-950/60 border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  {/* Top Bar of Day Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center shrink-0 shadow-sm">
                        <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">DAY</span>
                        <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 leading-none">
                          {dayItem.day}
                        </span>
                      </div>

                      {isEditing ? (
                        <input
                          type="text"
                          value={editingTopic}
                          onChange={(e) => setEditingTopic(e.target.value)}
                          className="flex-1 bg-white dark:bg-zinc-900 border border-indigo-500 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 font-bold focus:outline-none"
                        />
                      ) : (
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                            {dayItem.topic}
                          </h4>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <select
                          value={editingPlatform}
                          onChange={(e) => setEditingPlatform(e.target.value as PlatformType)}
                          className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl px-2.5 py-1 text-xs text-zinc-900 dark:text-zinc-200 font-semibold focus:outline-none"
                        >
                          {PLATFORM_OPTIONS.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[10px] px-2.5 py-1 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold">
                          {dayItem.platform}
                        </span>
                      )}

                      <HasPermission allowedRoles={['admin', 'member']}>
                        {/* Regenerate AI Button with Crystal Clear Contrast */}
                        <button
                          type="button"
                          onClick={() => handleRegenerateDay(dayItem.day)}
                          disabled={isRegenerating || isSavingAll}
                          className="px-3 py-1.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-sm"
                          title="AI Regenerate Day Title & Strategy Angle"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 text-purple-600 dark:text-purple-300 ${isRegenerating ? 'animate-spin' : ''}`} />
                          <span>Regenerate AI</span>
                        </button>

                        {isEditing ? (
                          <button
                            type="button"
                            onClick={() => handleSaveDayEdit(dayItem.day)}
                            disabled={isSavingAll}
                            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                          >
                            Done
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(dayItem)}
                            className="px-3.5 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                        )}
                      </HasPermission>
                    </div>
                  </div>

                  {/* Body Preview Area */}
                  {isEditing ? (
                    <textarea
                      rows={2}
                      value={editingPreview}
                      onChange={(e) => setEditingPreview(e.target.value)}
                      className="mt-3 w-full bg-white dark:bg-zinc-900 border border-indigo-500 rounded-xl p-3 text-xs text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none"
                    />
                  ) : (
                    <p className="mt-3 text-xs text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900/80 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/80 font-mono leading-relaxed">
                      {dayItem.preview}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
          <HasPermission allowedRoles={['admin', 'member']}>
            <button
              onClick={handleSaveAllChanges}
              disabled={!hasPendingEdits || isSavingAll}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                hasPendingEdits
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 cursor-pointer'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
              }`}
            >
              {isSavingAll ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</>
              ) : (
                <><Save className="w-4 h-4" /> {hasPendingEdits ? `Save Changes (${Object.keys(pendingEdits).length})` : 'No Changes'}</>
              )}
            </button>
          </HasPermission>
        </div>
      </div>
    </div>
  );
};
