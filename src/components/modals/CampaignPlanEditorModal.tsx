import React, { useState, useEffect } from 'react';
import { X, Calendar, Sparkles, RefreshCw } from 'lucide-react';

import type { Campaign, DayPlan, PlatformType } from '../../types';
import { campaignService } from '../../services/campaignService';
import { useToast } from '../../context/ToastContext';

interface CampaignPlanEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign | null;
  onCampaignUpdated: (updated: Campaign) => void;
}

const PLATFORM_OPTIONS: PlatformType[] = ['Instagram', 'LinkedIn', 'Facebook', 'Twitter'];

export const CampaignPlanEditorModal: React.FC<CampaignPlanEditorModalProps> = ({
  isOpen,
  onClose,
  campaign,
  onCampaignUpdated,
}) => {
  const { addToast } = useToast();
  const [activePlan, setActivePlan] = useState<DayPlan[]>([]);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [editingTopic, setEditingTopic] = useState('');
  const [editingPlatform, setEditingPlatform] = useState<PlatformType>('LinkedIn');
  const [editingPreview, setEditingPreview] = useState('');
  const [regeneratingDay, setRegeneratingDay] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (campaign && campaign.plan) {
      setActivePlan([...campaign.plan]);
    } else {
      setActivePlan([]);
    }
    setEditingDay(null);
  }, [campaign, isOpen]);

  if (!isOpen || !campaign) return null;

  const handleStartEdit = (dayPlan: DayPlan) => {
    setEditingDay(dayPlan.day);
    setEditingTopic(dayPlan.topic);
    setEditingPlatform(dayPlan.platform);
    setEditingPreview(dayPlan.preview);
  };

  const handleSaveDayEdit = async (dayNumber: number) => {
    setIsSaving(true);
    try {
      const updatedCamp = await campaignService.updateDayPlanItem(campaign.id, dayNumber, {
        topic: editingTopic,
        platform: editingPlatform,
        preview: editingPreview,
      });
      setActivePlan(updatedCamp.plan || []);
      onCampaignUpdated(updatedCamp);
      addToast('Day Updated', `Day ${dayNumber} plan saved successfully.`, 'success');
      setEditingDay(null);
    } catch (err: any) {
      addToast('Update Failed', err.message || 'Could not save day plan update.', 'warning');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateDay = async (dayNumber: number) => {
    setRegeneratingDay(dayNumber);
    try {
      const updatedCamp = await campaignService.regenerateDayPlanItem(campaign.id, dayNumber);
      setActivePlan(updatedCamp.plan || []);
      onCampaignUpdated(updatedCamp);
      addToast('AI Regeneration Complete! 🚀', `Day ${dayNumber} re-imagined with Gemini AI.`, 'success');
    } catch (err: any) {
      addToast('Regeneration Failed', err.message || 'Failed to regenerate day plan with AI.', 'warning');
    } finally {
      setRegeneratingDay(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-6 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                {campaign.title}
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                  7-Day Plan Editor
                </span>
              </h2>
              <p className="text-xs text-zinc-400">Target Audience: {campaign.targetAudience} • Tone: {campaign.tone}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 rounded-xl hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 7-Day Plan List */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {activePlan.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 space-y-2">
              <Sparkles className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-xs font-semibold">No 7-Day Plan Items Found</p>
            </div>
          ) : (
            activePlan.map((dayItem) => {
              const isEditing = editingDay === dayItem.day;
              const isRegenerating = regeneratingDay === dayItem.day;

              return (
                <div
                  key={dayItem.day}
                  className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3 hover:border-zinc-700 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center text-xs font-extrabold">
                        D{dayItem.day}
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingTopic}
                          onChange={(e) => setEditingTopic(e.target.value)}
                          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1 text-xs text-zinc-100 font-bold focus:outline-none focus:border-indigo-500 w-72"
                        />
                      ) : (
                        <h4 className="text-xs font-bold text-zinc-100">{dayItem.topic}</h4>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <select
                          value={editingPlatform}
                          onChange={(e) => setEditingPlatform(e.target.value as PlatformType)}
                          className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                        >
                          {PLATFORM_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold flex items-center gap-1">
                          {dayItem.platform}
                        </span>
                      )}

                      <button
                        onClick={() => handleRegenerateDay(dayItem.day)}
                        disabled={isRegenerating}
                        className="px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[11px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                        title="AI Regenerate Day Title & Strategy Angle"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                        <span>Regenerate AI</span>
                      </button>

                      {isEditing ? (
                        <button
                          onClick={() => handleSaveDayEdit(dayItem.day)}
                          disabled={isSaving}
                          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all"
                        >
                          Save
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartEdit(dayItem)}
                          className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-all"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <textarea
                      rows={2}
                      value={editingPreview}
                      onChange={(e) => setEditingPreview(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  ) : (
                    <p className="text-xs text-zinc-400 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/60 font-mono">
                      {dayItem.preview}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-zinc-800 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold transition-colors"
          >
            Close Plan Editor
          </button>
        </div>
      </div>
    </div>
  );
};
