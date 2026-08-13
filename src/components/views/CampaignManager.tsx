import React, { useState, useMemo } from 'react';
import type { Campaign, Workspace } from '../../types';
import { PlatformIcon } from '../../utils/platform';
import { CampaignPlanEditorModal } from '../modals/CampaignPlanEditorModal';
import { CampaignWizardModal } from '../modals/CampaignWizardModal';
import { useToast } from '../../context/ToastContext';
import {
  Calendar,
  Plus,
  Sparkles,
  Search,
  Trash2,
  Edit3,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { HasPermission } from '../HasPermission';

interface CampaignManagerProps {
  campaigns: Campaign[];
  isLoading?: boolean;
  error?: string | null;
  onRefetch?: () => void;
  onAddCampaign: (newCampaign: any) => void;
  onDeleteCampaign?: (campaignId: string) => Promise<void>;
  onUpdateCampaign?: (updated: Campaign) => void;
  selectedWorkspace: Workspace | null;
  workspaces?: Workspace[];
}

export const CampaignManager: React.FC<CampaignManagerProps> = ({
  campaigns,
  isLoading,
  error,
  onRefetch,
  onAddCampaign,
  onDeleteCampaign,
  onUpdateCampaign,
  selectedWorkspace,
  workspaces = [],
}) => {
  const { addToast } = useToast();
  const { role } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'Active' | 'Pending Plan Approval'>('all');
  const [searchQuery, setSearchQuery] = useState('');

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



  const confirmDeleteCampaign = async () => {
    if (!campaignToDelete || !onDeleteCampaign) return;
    setIsDeleting(true);
    try {
      await onDeleteCampaign(String(campaignToDelete.id));
      addToast('Campaign Deleted', `Deleted "${campaignToDelete.title}".`, 'info');
      setCampaignToDelete(null);
    } catch (err: any) {
      addToast('Delete Error', err.message || 'Failed to delete campaign.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-50 dark:bg-zinc-950 font-sans text-slate-900 dark:text-zinc-100 select-none">
      {/* View Header Bar */}
      <header className="h-16 border-b border-slate-200 dark:border-zinc-800/80 px-6 flex items-center justify-between bg-white dark:bg-zinc-950/80 backdrop-blur-md shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              Campaign Manager
              {selectedWorkspace && (
                <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                  ({workspaceCampaigns.length} campaigns)
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
              Orchestrate multi-channel B2B campaigns and automated content roadmaps.
            </p>
          </div>
        </div>

        <HasPermission allowedRoles={['admin', 'editor']}>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Campaign</span>
          </button>
        </HasPermission>
      </header>

      {/* Main Container */}
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Controls: Search and Filter Tabs */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900/80 p-1.5 rounded-2xl border border-slate-200 dark:border-zinc-800/80 shadow-sm">
            {(['all', 'Active', 'Pending Plan Approval'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === tab
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
              >
                {tab === 'all' ? 'All Campaigns' : tab}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-2.5" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-600 transition-colors shadow-sm"
            />
          </div>
        </div>

        {/* Campaign Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {isLoading ? (
            <div className="col-span-full h-64 flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-zinc-900/40 rounded-3xl border border-slate-200 dark:border-zinc-800/60 text-slate-400 dark:text-zinc-400 space-y-3 shadow-sm">
              <Sparkles className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <p className="text-xs font-bold">Loading campaigns...</p>
            </div>
          ) : error ? (
            <div className="col-span-full p-6 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
              <p className="text-xs text-rose-600 dark:text-rose-300 font-bold">{error}</p>
              {onRefetch && (
                <button
                  onClick={onRefetch}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Retry Loading
                </button>
              )}
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="col-span-full h-64 flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-zinc-900/40 rounded-3xl border border-slate-200 dark:border-zinc-800/60 text-slate-500 dark:text-zinc-500 shadow-sm">
              <Calendar className="w-10 h-10 mb-3 text-slate-400 dark:text-zinc-600" />
              <p className="text-sm font-bold text-slate-800 dark:text-zinc-300">No Campaigns Found</p>
              <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1 max-w-sm font-medium">
                Click "+ Create New Campaign" to generate your first 7-day automated copy calendar.
              </p>
            </div>
          ) : (
            filteredCampaigns.map((camp) => {
              const progressPercentage =
                camp.status === 'Active' ? (camp.currentDay / camp.totalDays) * 100 : 0;
              const campWs = workspaces?.find((w) => w.id === camp.workspaceId);

              return (
                <div
                  key={camp.id}
                  className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 rounded-3xl p-5 flex flex-col justify-between transition-all duration-200 shadow-sm hover:shadow-lg group relative"
                >
                  <div>
                    {/* Status Badge, Workspace Badge, Delete & Platforms */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                            camp.status === 'Active'
                              ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                              : 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                          }`}
                        >
                          {camp.status}
                        </span>

                        {campWs && (
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white ${campWs.brandColor} shadow-xs`}>
                            {campWs.name}
                          </span>
                        )}

                        {onDeleteCampaign && (
                          <HasPermission allowedRoles={['admin', 'editor']}>
                            <button
                              onClick={() => setCampaignToDelete(camp)}
                              className="p-1 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                              title="Delete Campaign"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </HasPermission>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {camp.platforms.map((p) => (
                          <div
                            key={p}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/50"
                            title={p}
                          >
                            <PlatformIcon platform={p} className="w-3.5 h-3.5" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <h3 className="text-base font-extrabold text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {camp.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 line-clamp-1 font-medium">
                      Audience: {camp.targetAudience}
                    </p>

                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-[11px] text-indigo-700 dark:text-indigo-300 font-extrabold flex items-center gap-1">
                        🏢 {workspaces.find((w) => w.id === camp.workspaceId)?.name || 'General'}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md bg-purple-50 dark:bg-violet-500/10 border border-purple-200 dark:border-violet-500/20 text-[11px] text-purple-700 dark:text-violet-300 font-bold">
                        🎙 {camp.tone}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 text-[11px] text-sky-700 dark:text-sky-300 font-bold truncate max-w-[160px]" title={camp.targetAudience}>
                        👥 {camp.targetAudience}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800/60">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-500 dark:text-zinc-400 font-medium">Campaign Timeline</span>
                        <span className="text-slate-900 dark:text-zinc-200 font-bold">
                          {camp.status === 'Active'
                            ? `Day ${camp.currentDay} of ${camp.totalDays}`
                            : '0 of 7 Days'}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full transition-all duration-500"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card Action */}
                  <div className="mt-5 pt-3 border-t border-slate-100 dark:border-zinc-800/40 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-500">
                      {camp.plan ? `${camp.plan.length} post topics` : '7 post topics'}
                    </span>
                    <button
                      onClick={() => setEditorCampaign(camp)}
                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-500/20 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> {role === 'admin' || role === 'editor' ? 'Edit' : 'View'} {camp.totalDays || camp.plan?.length || 7}-Day Plan <ChevronRight className="w-3.5 h-3.5" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-zinc-100">Delete Campaign?</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 font-medium">
                Are you sure you want to delete <span className="font-bold text-slate-900 dark:text-zinc-200">"{campaignToDelete.title}"</span>? This will permanently remove the campaign and all associated pending posts.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setCampaignToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCampaign}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Delete Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STRATEGIC QUESTIONNAIRE CAMPAIGN WIZARD MODAL */}
      <CampaignWizardModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedWorkspace={selectedWorkspace}
        workspaces={workspaces}
        onLaunchCampaign={async (campaignData) => {
          await onAddCampaign(campaignData);
        }}
      />
    </div>
  );
};
