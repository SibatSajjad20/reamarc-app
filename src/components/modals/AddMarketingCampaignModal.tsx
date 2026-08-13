/**
 * AddMarketingCampaignModal — Modal form for creating a new marketing campaign.
 * Binds to the currently active workspace_id.
 */

import React, { useState } from 'react';
import type { Workspace } from '../../types';
import { Modal } from '../ui/Modal';
import { TrendingUp, Sparkles } from 'lucide-react';

const PLATFORM_OPTIONS = ['Meta', 'Google', 'TikTok', 'WhatsApp', 'Other'];
const OBJECTIVE_OPTIONS = ['Lead Generation', 'Engagement', 'Sales', 'Brand Awareness', 'Traffic', 'App Installs'];

interface AddMarketingCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWorkspace: Workspace | null;
  workspaces: Workspace[];
  onSubmit: (data: {
    campaign_name: string;
    platform: string;
    objective: string;
    industry: string;
    budget_set: number;
    workspace_id: string;
  }) => Promise<void>;
}

export const AddMarketingCampaignModal: React.FC<AddMarketingCampaignModalProps> = ({
  isOpen,
  onClose,
  selectedWorkspace,
  workspaces,
  onSubmit,
}) => {
  const [campaignName, setCampaignName] = useState('');
  const [platform, setPlatform] = useState('Meta');
  const [objective, setObjective] = useState('Lead Generation');
  const [industry, setIndustry] = useState('');
  const [budgetSet, setBudgetSet] = useState<number>(0);
  const [targetWsId, setTargetWsId] = useState(selectedWorkspace?.id || workspaces[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!campaignName.trim()) return;
    const wsId = selectedWorkspace ? selectedWorkspace.id : targetWsId;
    if (!wsId) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        campaign_name: campaignName.trim(),
        platform,
        objective,
        industry: industry.trim(),
        budget_set: budgetSet,
        workspace_id: wsId,
      });
      // Reset form
      setCampaignName('');
      setPlatform('Meta');
      setObjective('Lead Generation');
      setIndustry('');
      setBudgetSet(0);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center text-white shadow-md shadow-orange-500/30">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-100">Add Marketing Campaign</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">Track daily ad performance metrics for this campaign.</p>
          </div>
        </div>
      }
    >
      <div className="space-y-4 pt-2">
        {/* Workspace selector when in "All Workspaces" mode */}
        {!selectedWorkspace && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5">
            <label className="block text-xs font-bold text-amber-700 dark:text-amber-300">Target Workspace</label>
            <select
              value={targetWsId}
              onChange={(e) => setTargetWsId(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-zinc-100 font-bold focus:outline-none cursor-pointer"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>🏢 {w.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Campaign Name */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">Campaign Name</label>
          <input
            type="text"
            placeholder="e.g. Apex Q3 Lead Gen — Meta"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 shadow-sm"
          />
        </div>

        {/* Platform & Objective side-by-side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-3 py-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500 shadow-sm cursor-pointer"
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">Objective</label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-3 py-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500 shadow-sm cursor-pointer"
            >
              {OBJECTIVE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Industry & Budget side-by-side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">Industry (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Real Estate, E-commerce"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 shadow-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">Budget Set ($)</label>
            <input
              type="number"
              min={0}
              step={100}
              value={budgetSet}
              onChange={(e) => setBudgetSet(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500 shadow-sm"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!campaignName.trim() || isSubmitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-400 hover:to-rose-500 text-white text-xs font-bold shadow-lg shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isSubmitting ? 'Creating...' : 'Add Campaign'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
