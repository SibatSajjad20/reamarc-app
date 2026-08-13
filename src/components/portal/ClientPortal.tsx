import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Clock,
  MessageSquare,
  LogOut,
  Sparkles,
  RefreshCcw,
  Loader2,
  CheckCheck,
  FileSpreadsheet,
  Building2,
  ChevronDown,
  ChevronUp,
  Tag,
  Type,
  Layers,
  Hash,
  AlignLeft,
  Megaphone,
  Film,
  Calendar,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { portalService } from '../../services/portalService';
import type { PortalAsset } from '../../services/portalService';
import { RevisionModal } from './RevisionModal';
import { useToast } from '../../context/ToastContext';

// ─── Helper: resolve content concept from multiple possible field names ────────
function getContentConcept(asset: PortalAsset): string {
  return asset.contentConcept || (asset as any).content_concept || (asset as any).notes || '—';
}

function getPrimaryText(asset: PortalAsset): string {
  return asset.primaryText || asset.primaryCopy || (asset as any).primary_copy || '';
}

function getHeadlines(asset: PortalAsset): string {
  return asset.headlinesHooks || (asset as any).headlines_hooks || '';
}

function getContentOnCreative(asset: PortalAsset): string {
  return asset.contentOnCreative || asset.scriptOutline || (asset as any).script_outline || '';
}

// ─── Asset Detail Card ─────────────────────────────────────────────────────────
const AssetCard: React.FC<{
  asset: PortalAsset;
  onApprove: (asset: PortalAsset) => void;
  onRevision: (asset: PortalAsset) => void;
  actionLoadingId: string | null;
  getStatusBadge: (s: string) => string;
}> = ({ asset, onApprove, onRevision, actionLoadingId, getStatusBadge }) => {
  const [expanded, setExpanded] = useState(false);
  const primaryText = getPrimaryText(asset);
  const headlines = getHeadlines(asset);
  const contentOnCreative = getContentOnCreative(asset);
  const concept = getContentConcept(asset);
  const isLoading = actionLoadingId === asset.id;
  const isRevisionRequested = asset.approvalStatus === 'Revision Requested';

  return (
    <div className={`bg-white dark:bg-zinc-900 border rounded-2xl shadow-sm transition-colors overflow-hidden ${
      isRevisionRequested
        ? 'border-rose-300 dark:border-rose-700/60'
        : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
    }`}>
      {/* Card Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1 space-y-2">
            {/* Meta row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">{asset.serial}</span>
              <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400">{asset._campaignTitle}</span>
              {asset.creativeType && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 uppercase">
                  {asset.creativeType}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(asset.approvalStatus)}`}>
                {asset.approvalStatus}
              </span>
            </div>

            {/* Content Concept — always visible */}
            {concept && concept !== '—' && (
              <p className="text-sm font-semibold text-slate-800 dark:text-zinc-100">{concept}</p>
            )}

            {/* Campaign Type + Offer pill row */}
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              {asset.campaignType && (
                <span className="flex items-center gap-1 text-slate-500 dark:text-zinc-400">
                  <Megaphone className="w-3 h-3" />{asset.campaignType}
                </span>
              )}
              {asset.offer && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20 font-medium">
                  <Tag className="w-3 h-3" />{asset.offer}
                </span>
              )}
              {asset.cta && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20 font-medium">
                  {asset.cta}
                </span>
              )}
            </div>

            {/* Primary Text preview (first 200 chars) */}
            {primaryText && (
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed line-clamp-3 whitespace-pre-line">
                {primaryText.slice(0, 300)}{primaryText.length > 300 ? '…' : ''}
              </p>
            )}

            {/* Client feedback if revision requested */}
            {isRevisionRequested && asset.client_feedback && (
              <div className="mt-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-700/40">
                <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400 mb-1">Your Revision Request</p>
                <p className="text-xs text-rose-800 dark:text-rose-300 font-medium">{asset.client_feedback.category}</p>
                <p className="text-xs text-rose-700 dark:text-rose-400 mt-0.5">{asset.client_feedback.notes}</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onApprove(asset)}
                disabled={isLoading || asset.approvalStatus === 'Approved'}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approve
              </button>
              <button
                onClick={() => onRevision(asset)}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Request Changes
              </button>
            </div>
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
            >
              {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Hide full content</> : <><ChevronDown className="w-3.5 h-3.5" /> View full content</>}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded full content */}
      {expanded && (
        <div className="border-t border-slate-100 dark:border-zinc-800 px-5 py-4 space-y-4 bg-slate-50/60 dark:bg-zinc-950/40">
          {/* Primary Text */}
          {primaryText && (
            <ContentSection icon={<AlignLeft className="w-3.5 h-3.5" />} label="Primary Text (Ad Copy)">
              <pre className="text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">{primaryText}</pre>
            </ContentSection>
          )}

          {/* Headlines & Hooks */}
          {headlines && (
            <ContentSection icon={<Type className="w-3.5 h-3.5" />} label="Headlines & Hooks">
              <pre className="text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">{headlines}</pre>
            </ContentSection>
          )}

          {/* Content On Creative / Script */}
          {contentOnCreative && (
            <ContentSection icon={<Film className="w-3.5 h-3.5" />} label="Content On Creative / Script">
              <pre className="text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">{contentOnCreative}</pre>
            </ContentSection>
          )}

          {/* Production Direction */}
          {asset.productionDirection && (
            <ContentSection icon={<Layers className="w-3.5 h-3.5" />} label="Production Direction">
              <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">{asset.productionDirection}</p>
            </ContentSection>
          )}

          {/* Hashtags */}
          {asset.hashtagsKeywords && (
            <ContentSection icon={<Hash className="w-3.5 h-3.5" />} label="Hashtags & Keywords">
              <p className="text-xs text-slate-600 dark:text-zinc-400">{asset.hashtagsKeywords}</p>
            </ContentSection>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-slate-500 dark:text-zinc-500">
            {asset.designOwner && (
              <span className="flex items-center gap-1"><User className="w-3 h-3" /> {asset.designOwner}</span>
            )}
            {asset.designDue && (
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Due: {asset.designDue}</span>
            )}
            {asset.contentPillar && (
              <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> {asset.contentPillar}</span>
            )}
          </div>

          {/* Notes */}
          {asset.notes && (
            <ContentSection icon={<MessageSquare className="w-3.5 h-3.5" />} label="Notes">
              <p className="text-xs text-slate-600 dark:text-zinc-400">{asset.notes}</p>
            </ContentSection>
          )}
        </div>
      )}
    </div>
  );
};

const ContentSection: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div>
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="text-indigo-500 dark:text-indigo-400">{icon}</span>
      <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">{label}</span>
    </div>
    <div className="pl-5">{children}</div>
  </div>
);

// ─── Main Portal ───────────────────────────────────────────────────────────────
export const ClientPortal: React.FC = () => {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState<'feed' | 'all'>('feed');
  const [dashboard, setDashboard] = useState<{
    pending_review_count: number;
    approved_count: number;
    pending_review: PortalAsset[];
    all_assets: PortalAsset[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [revisionTarget, setRevisionTarget] = useState<PortalAsset | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await portalService.getDashboard();
      setDashboard(data);
    } catch (err: any) {
      addToast('Load Failed', err.message || 'Could not load portal data.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (asset: PortalAsset) => {
    setActionLoadingId(asset.id);
    try {
      await portalService.approveAsset(asset._campaignId, asset.id);
      addToast('Approved ✅', `Asset ${asset.serial} marked as approved.`, 'success');
      await load();
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRevisionSubmit = async (campaignId: string, rowId: string, category: string, notes: string) => {
    await portalService.requestRevision(campaignId, rowId, category, notes);
    addToast('Revision Requested 💬', 'Your feedback has been sent to the team.', 'success');
    await load();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20';
      case 'In Client Review':
        return 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20';
      case 'Revision Requested':
        return 'bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 dark:text-zinc-100">Client Review Portal</h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400">Powered by Reamarc AI</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-700 dark:text-zinc-300 font-medium">
            <Building2 className="w-3.5 h-3.5 text-indigo-500" />
            <span>{user?.name || user?.email}</span>
            <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase">Client</span>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 dark:text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
              <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-slate-900 dark:text-zinc-100">
                {isLoading ? '—' : dashboard?.pending_review_count ?? 0}
              </p>
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-0.5">Pending Your Review</p>
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-slate-900 dark:text-zinc-100">
                {isLoading ? '—' : dashboard?.approved_count ?? 0}
              </p>
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-0.5">Approved Assets</p>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-1 w-fit shadow-sm">
          <button
            onClick={() => setTab('feed')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tab === 'feed' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> Approval Feed
            {(dashboard?.pending_review_count ?? 0) > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${tab === 'feed' ? 'bg-white/20 text-white' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
                {dashboard?.pending_review_count}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tab === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> All Assets
            {(dashboard?.all_assets?.length ?? 0) > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${tab === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'}`}>
                {dashboard?.all_assets?.length}
              </span>
            )}
          </button>
          <button
            onClick={load}
            disabled={isLoading}
            className="ml-1 p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        )}

        {/* Tab: Approval Feed */}
        {!isLoading && tab === 'feed' && (
          <div className="space-y-4">
            {(dashboard?.pending_review ?? []).length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-12 text-center shadow-sm">
                <CheckCheck className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800 dark:text-zinc-200">All caught up!</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">No assets are currently awaiting your review.</p>
              </div>
            ) : (
              dashboard!.pending_review.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onApprove={handleApprove}
                  onRevision={setRevisionTarget}
                  actionLoadingId={actionLoadingId}
                  getStatusBadge={getStatusBadge}
                />
              ))
            )}
          </div>
        )}

        {/* Tab: All Assets */}
        {!isLoading && tab === 'all' && (
          <div className="space-y-4">
            {(dashboard?.all_assets ?? []).length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-12 text-center shadow-sm">
                <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">No campaign assets found for your workspace.</p>
              </div>
            ) : (
              dashboard!.all_assets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onApprove={handleApprove}
                  onRevision={setRevisionTarget}
                  actionLoadingId={actionLoadingId}
                  getStatusBadge={getStatusBadge}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Revision Modal */}
      {revisionTarget && (
        <RevisionModal
          asset={revisionTarget}
          onClose={() => setRevisionTarget(null)}
          onSubmit={handleRevisionSubmit}
        />
      )}
    </div>
  );
};
