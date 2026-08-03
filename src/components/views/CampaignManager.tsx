import React, { useState, useMemo } from 'react';
import type { Campaign, ToneType, PlatformType, DayPlan, Workspace } from '../../types';
import { PlatformIcon } from '../../utils/platform';
import { Modal } from '../ui/Modal';
import { CampaignPlanEditorModal } from '../modals/CampaignPlanEditorModal';
import { campaignService } from '../../services/campaignService';
import { useToast } from '../../context/ToastContext';
import {
  Calendar,
  Plus,
  Sparkles,
  ChevronRight,
  Search,
  Check,
  Trash2,
  Edit3,
  AlertTriangle,
} from 'lucide-react';

interface CampaignManagerProps {
  campaigns: Campaign[];
  onAddCampaign: (newCampaign: Campaign) => void;
  onDeleteCampaign?: (campaignId: string) => Promise<void>;
  onUpdateCampaign?: (updated: Campaign) => void;
  selectedWorkspace: Workspace | null;
}

export const CampaignManager: React.FC<CampaignManagerProps> = ({
  campaigns,
  onAddCampaign,
  onDeleteCampaign,
  onUpdateCampaign,
  selectedWorkspace,
}) => {
  const { addToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'Active' | 'Pending Plan Approval'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State for modal
  const [title, setTitle] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [tone, setTone] = useState<ToneType>('Punchy');
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformType[]>(['Instagram', 'LinkedIn']);

  // Loading & Plan State inside modal
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState('');
  const [generatedPlan, setGeneratedPlan] = useState<DayPlan[] | null>(null);

  // 7-Day Plan Editor Modal & Delete Confirmation state
  const [editorCampaign, setEditorCampaign] = useState<Campaign | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter campaigns by workspace and tabs with useMemo
  const workspaceCampaigns = useMemo(() => {
    return selectedWorkspace
      ? campaigns.filter((c) => c.workspaceId === selectedWorkspace.id)
      : campaigns;
  }, [campaigns, selectedWorkspace]);

  const filteredCampaigns = useMemo(() => {
    return workspaceCampaigns.filter((c) => {
      const matchesTab = activeTab === 'all' || c.status === activeTab;
      const matchesSearch =
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.targetAudience.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [workspaceCampaigns, activeTab, searchQuery]);

  const togglePlatform = (p: PlatformType) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter((item) => item !== p));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  const handleGeneratePlan = () => {
    if (!title.trim()) {
      addToast('Campaign Title Required', 'Please provide a title for your campaign.', 'warning');
      return;
    }

    setIsGenerating(true);
    setGenerationStep('Analyzing target audience & positioning...');

    setTimeout(() => {
      setGenerationStep('Chaining 7-day narrative hooks & platform specs...');
    }, 800);

    setTimeout(() => {
      setGenerationStep('Finalizing daily copy templates & CTAs...');
    }, 1400);

    setTimeout(async () => {
      setIsGenerating(false);
      try {
        // Call backend API to pre-generate AI strategy plan with Gemini
        const created = await campaignService.createCampaign({
          title,
          target_audience: targetAudience || 'Target Audience',
          tone,
          workspace_id: selectedWorkspace ? selectedWorkspace.id : 'ws-1',
          platforms: selectedPlatforms,
        });

        if (created && created.plan && created.plan.length > 0) {
          setGeneratedPlan(created.plan);
          // Store created campaign ID for instant deployment
          (window as any).__lastCreatedCampaignId = created.id;
        } else {
          setGeneratedPlan([
            { day: 1, topic: `${title}: Teaser & Hook`, platform: selectedPlatforms[0] || 'LinkedIn', preview: `Discover how ${targetAudience || 'leading brands'} scale strategy in 2026.` },
            { day: 2, topic: 'Core Value Proposition', platform: selectedPlatforms[1] || selectedPlatforms[0] || 'Instagram', preview: '3 core pillars to transform your workflow today.' },
            { day: 3, topic: 'Social Proof & Case Study', platform: selectedPlatforms[0] || 'LinkedIn', preview: 'How our clients achieve 3x growth in 30 days.' },
            { day: 4, topic: 'Community Poll & Hook', platform: 'Twitter', preview: 'What is your biggest bottleneck right now?' },
            { day: 5, topic: 'Deep Dive & Feature Showcase', platform: selectedPlatforms[0] || 'Instagram', preview: 'Inside our automated strategy engine.' },
            { day: 6, topic: 'Expert Advice & Insider Tips', platform: 'Facebook', preview: 'Top 3 strategy mistakes to avoid.' },
            { day: 7, topic: 'Direct Offer & CTA', platform: selectedPlatforms[0] || 'LinkedIn', preview: 'Ready to elevate your content? Book a demo today!' },
          ]);
        }
      } catch {
        setGeneratedPlan([
          { day: 1, topic: `${title}: Teaser & Hook`, platform: selectedPlatforms[0] || 'LinkedIn', preview: `Discover how ${targetAudience || 'leading brands'} scale strategy in 2026.` },
          { day: 2, topic: 'Core Value Proposition', platform: selectedPlatforms[1] || selectedPlatforms[0] || 'Instagram', preview: '3 core pillars to transform your workflow today.' },
          { day: 3, topic: 'Social Proof & Case Study', platform: selectedPlatforms[0] || 'LinkedIn', preview: 'How our clients achieve 3x growth in 30 days.' },
          { day: 4, topic: 'Community Poll & Hook', platform: 'Twitter', preview: 'What is your biggest bottleneck right now?' },
          { day: 5, topic: 'Deep Dive & Feature Showcase', platform: selectedPlatforms[0] || 'Instagram', preview: 'Inside our automated strategy engine.' },
          { day: 6, topic: 'Expert Advice & Insider Tips', platform: 'Facebook', preview: 'Top 3 strategy mistakes to avoid.' },
          { day: 7, topic: 'Direct Offer & CTA', platform: selectedPlatforms[0] || 'LinkedIn', preview: 'Ready to elevate your content? Book a demo today!' },
        ]);
      }
    }, 1800);
  };

  const handleApprovePlan = () => {
    if (!generatedPlan) return;

    if (!(window as any).__lastCreatedCampaignId) {
      const newCamp: Campaign = {
        id: `camp-${Date.now()}`,
        title: title,
        status: 'Active',
        currentDay: 1,
        totalDays: 7,
        workspaceId: selectedWorkspace ? selectedWorkspace.id : 'ws-1',
        platforms: selectedPlatforms,
        targetAudience: targetAudience || 'Target Audience',
        tone: tone,
        createdAt: new Date().toISOString().split('T')[0],
        plan: generatedPlan,
      };
      onAddCampaign(newCamp);
    } else {
      delete (window as any).__lastCreatedCampaignId;
    }

    addToast(
      'Campaign Plan Approved! 🎉',
      `"${title}" is now Active. Day 1 draft pushed to Approval Inbox!`,
      'success'
    );

    setIsModalOpen(false);
    setTitle('');
    setTargetAudience('');
    setGeneratedPlan(null);
  };

  const confirmDeleteCampaign = async () => {
    if (!campaignToDelete || !onDeleteCampaign) return;
    setIsDeleting(true);
    try {
      await onDeleteCampaign(campaignToDelete.id);
      addToast('Campaign Deleted', `"${campaignToDelete.title}" was permanently deleted.`, 'info');
      setCampaignToDelete(null);
    } catch (err: any) {
      addToast('Delete Failed', err.message || 'Could not delete campaign.', 'warning');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-y-auto select-none">
      {/* Header Bar */}
      <header className="h-16 border-b border-zinc-800/80 px-6 flex items-center justify-between bg-zinc-950/80 backdrop-blur-md shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              Campaign Manager
              <span className="text-xs font-normal text-zinc-400">
                ({workspaceCampaigns.length} campaigns)
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              The Weekly Planner: Schedule 7-day multi-channel AI campaigns.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setIsModalOpen(true);
            setGeneratedPlan(null);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          Create New Campaign
        </button>
      </header>

      {/* Main Container */}
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Controls: Search and Filter Tabs */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800/80">
            {(['all', 'Active', 'Pending Plan Approval'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab === 'all' ? 'All Campaigns' : tab}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        {/* Campaign Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCampaigns.length === 0 ? (
            <div className="col-span-full h-64 flex flex-col items-center justify-center text-center p-8 bg-zinc-900/40 rounded-2xl border border-zinc-800/60 text-zinc-500">
              <Calendar className="w-10 h-10 mb-3 text-zinc-600" />
              <p className="text-sm font-semibold text-zinc-300">No Campaigns Found</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                Click "+ Create New Campaign" to generate your first 7-day automated copy calendar.
              </p>
            </div>
          ) : (
            filteredCampaigns.map((camp) => {
              const progressPercentage =
                camp.status === 'Active' ? (camp.currentDay / camp.totalDays) * 100 : 0;

              return (
                <div
                  key={camp.id}
                  className="bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700/80 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-black/40 group relative"
                >
                  <div>
                    {/* Status Badge, Delete & Platforms */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                            camp.status === 'Active'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                        >
                          {camp.status}
                        </span>

                        {onDeleteCampaign && (
                          <button
                            onClick={() => setCampaignToDelete(camp)}
                            className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete Campaign"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {camp.platforms.map((p) => (
                          <div
                            key={p}
                            className="p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/50"
                            title={p}
                          >
                            <PlatformIcon platform={p} className="w-3.5 h-3.5" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-zinc-100 group-hover:text-indigo-400 transition-colors">
                      {camp.title}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
                      Audience: {camp.targetAudience}
                    </p>

                    <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        Tone: {camp.tone}
                      </span>
                      <span>Created: {camp.createdAt}</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4 pt-3 border-t border-zinc-800/60">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-zinc-400 font-medium">Campaign Timeline</span>
                        <span className="text-zinc-200 font-semibold">
                          {camp.status === 'Active'
                            ? `Day ${camp.currentDay} of ${camp.totalDays}`
                            : '0 of 7 Days'}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card Action */}
                  <div className="mt-5 pt-3 border-t border-zinc-800/40 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">
                      {camp.plan ? `${camp.plan.length} post topics` : '7 post topics'}
                    </span>
                    <button
                      onClick={() => setEditorCampaign(camp)}
                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit 7-Day Plan <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 7-DAY PLAN EDITOR MODAL */}
      <CampaignPlanEditorModal
        isOpen={Boolean(editorCampaign)}
        onClose={() => setEditorCampaign(null)}
        campaign={editorCampaign}
        onCampaignUpdated={(updated) => {
          setEditorCampaign(updated);
          if (onUpdateCampaign) onUpdateCampaign(updated);
        }}
      />

      {/* DELETE CONFIRMATION MODAL */}
      {campaignToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Delete Campaign?</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Are you sure you want to delete <span className="font-bold text-zinc-200">"{campaignToDelete.title}"</span>? This will permanently remove the campaign and all associated pending posts.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setCampaignToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCampaign}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all"
              >
                {isDeleting ? 'Deleting...' : 'Delete Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REUSABLE MODAL: CREATE CAMPAIGN */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Create New AI Campaign</h2>
              <p className="text-xs text-zinc-400">
                Generate a full 7-day multi-channel content roadmap.
              </p>
            </div>
          </div>
        }
      >
        {!generatedPlan && !isGenerating && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Campaign Title *
              </label>
              <input
                type="text"
                placeholder="e.g., Q3 Product Launch or VIP Luxury Villa Showcase"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Target Audience
              </label>
              <input
                type="text"
                placeholder="e.g., Tech Founders, First-time homebuyers, HR Directors"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Tone of Voice
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as ToneType)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-100 focus:outline-none transition-colors"
                >
                  <option value="Professional">Professional</option>
                  <option value="Punchy">Punchy</option>
                  <option value="Witty">Witty</option>
                  <option value="Empathetic">Empathetic</option>
                  <option value="Bold & Visionary">Bold & Visionary</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Target Platforms
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['Instagram', 'LinkedIn', 'Facebook', 'Twitter'] as PlatformType[]).map(
                    (plat) => {
                      const isSel = selectedPlatforms.includes(plat);
                      return (
                        <button
                          key={plat}
                          type="button"
                          onClick={() => togglePlatform(plat)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            isSel
                              ? 'bg-indigo-600/20 border-indigo-500/60 text-indigo-300'
                              : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {plat}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800 flex justify-end">
              <button
                onClick={handleGeneratePlan}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all duration-200"
              >
                <Sparkles className="w-4 h-4" />
                Generate Plan
              </button>
            </div>
          </div>
        )}

        {/* Generating Loading State */}
        {isGenerating && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-zinc-100">Generating 7-Day Campaign...</h3>
              <p className="text-xs text-indigo-400 font-mono animate-pulse">
                {generationStep}
              </p>
            </div>
          </div>
        )}

        {/* Generated 7-Day Calendar View */}
        {generatedPlan && !isGenerating && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between text-xs text-indigo-300">
              <span>✨ Mocked 7-Day Content Schedule Generated</span>
              <span className="font-semibold">{title}</span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {generatedPlan.map((dayItem) => (
                <div
                  key={dayItem.day}
                  className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-start gap-3 text-xs"
                >
                  <div className="w-12 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold">DAY</span>
                    <span className="text-sm font-bold text-indigo-400 leading-none">
                      {dayItem.day}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="font-bold text-zinc-200 truncate">{dayItem.topic}</h4>
                      <span className="text-[10px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                        {dayItem.platform}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-1 italic">
                      "{dayItem.preview}"
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
              <button
                onClick={() => setGeneratedPlan(null)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                ← Edit Inputs
              </button>

              <button
                onClick={handleApprovePlan}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all"
              >
                <Check className="w-4 h-4" />
                Approve Plan & Deploy
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
