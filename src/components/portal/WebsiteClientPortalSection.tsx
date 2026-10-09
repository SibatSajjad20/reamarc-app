import React, { useEffect, useState, useCallback } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  ExternalLink,
  FileText,
  FolderKanban,
  Globe,
  Inbox,
  LayoutGrid,
  Link2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { Modal } from '../ui/Modal';
import { safeHttpUrl } from '../../utils/safeHttpUrl';
import { cleanLabel } from '../../utils/websiteProjectStyles';
import type {
  WebsiteFile,
  WebsiteGate,
  WebsiteProject,
  WebsiteTask,
} from '../../types/websiteProject';
import { WEBSITE_STAGES_CONFIG } from '../../types/websiteProject';
import { websiteProjectService } from '../../services/websiteProjectService';
import { useToast } from '../../context/ToastContext';
import { getBackendFileUrl } from '../../utils/fileUrl';
import {
  WebsitePipelineBoard,
  WebsitePipelineBoardSkeleton,
} from '../website-pipeline/WebsitePipelineBoard';
import {
  WebsiteTaskBoard,
  WebsiteTaskBoardSkeleton,
} from '../website-pipeline/WebsiteTaskBoard';
import { WebsiteProjectDrawer } from '../website-pipeline/WebsiteProjectDrawer';
import { WebsiteTaskModal } from '../website-pipeline/WebsiteTaskModal';

type PortalTab = 'approvals' | 'pipeline';
type PipelineSubMode = 'websites' | 'tasks';

const WebsitePortalApprovalsSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse">
    {/* Summary Card Skeleton */}
    <div className="rounded-xl p-5 bg-surface border border-border space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-24 bg-skel rounded-md" />
          <div className="h-4 w-40 bg-skel rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-36 bg-skel rounded-lg" />
          <div className="h-8 w-28 bg-skel rounded-lg" />
        </div>
      </div>
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <div className="h-3.5 w-36 bg-skel rounded" />
          <div className="h-3.5 w-8 bg-skel rounded" />
        </div>
        <div className="h-2 w-full bg-skel rounded-full" />
        <div className="flex items-center justify-between pt-1">
          <div className="h-3 w-28 bg-skel rounded" />
          <div className="h-3 w-32 bg-skel rounded" />
        </div>
      </div>
    </div>

    {/* Pending Approvals Skeleton */}
    <div className="space-y-3">
      <div className="h-4 w-48 bg-skel rounded" />
      <div className="p-5 rounded-xl bg-surface border border-border space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-24 bg-skel rounded" />
              <div className="h-4 w-14 bg-skel rounded" />
            </div>
            <div className="h-5 w-44 bg-skel rounded" />
            <div className="h-3.5 w-72 bg-skel rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-28 bg-skel rounded-lg" />
            <div className="h-8 w-36 bg-skel rounded-lg" />
          </div>
        </div>
      </div>
    </div>

    {/* Milestones Roadmap Skeleton (8 cards) */}
    <div className="rounded-xl p-5 bg-surface border border-border space-y-4">
      <div className="h-4 w-56 bg-skel rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-lg border border-border bg-subtle space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-20 bg-skel rounded" />
              <div className="h-3.5 w-3.5 bg-skel rounded-full" />
            </div>
            <div className="h-3 w-full bg-skel rounded" />
            <div className="h-3 w-3/4 bg-skel rounded" />
            <div className="pt-2 border-t border-border flex justify-between">
              <div className="h-2.5 w-12 bg-skel rounded" />
              <div className="h-2.5 w-14 bg-skel rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Deliverables Skeleton */}
    <div className="rounded-xl p-5 bg-surface border border-border space-y-3">
      <div className="h-4 w-52 bg-skel rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {[1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="p-3 rounded-lg border border-border bg-subtle flex items-center justify-between gap-3"
          >
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 w-3/4 bg-skel rounded" />
              <div className="h-2.5 w-1/2 bg-skel rounded" />
            </div>
            <div className="h-6 w-14 bg-skel rounded-md shrink-0" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const WebsiteClientPortalSection: React.FC = () => {
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<PortalTab>('approvals');
  const [pipelineSubMode, setPipelineSubMode] = useState<PipelineSubMode>('websites');
  const [projects, setProjects] = useState<WebsiteProject[]>([]);
  const [tasks, setTasks] = useState<WebsiteTask[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [gates, setGates] = useState<WebsiteGate[]>([]);
  const [files, setFiles] = useState<WebsiteFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Drawer & modal state
  const [drawerProject, setDrawerProject] = useState<WebsiteProject | null>(null);
  const [drawerTask, setDrawerTask] = useState<WebsiteTask | null>(null);

  // Decision Modal
  const [activeDecisionGate, setActiveDecisionGate] = useState<WebsiteGate | null>(null);
  const [decisionType, setDecisionType] = useState<'approved' | 'changes_requested'>('approved');
  const [decisionComment, setDecisionComment] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const [res, tRes] = await Promise.all([
        websiteProjectService.getProjects(),
        websiteProjectService.getAllTasks().catch(() => [] as WebsiteTask[]),
      ]);
      const list = res.items || [];
      setProjects(list);
      setTasks(tRes || []);
      setSelectedProjectId((prev) => (prev && list.some((p) => p.id === prev) ? prev : (list[0]?.id || null)));
    } catch {
      addToast('Error', 'Failed to load website projects', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const loadProjectDetails = useCallback(async (pid: string) => {
    try {
      const [gList, fList] = await Promise.all([
        websiteProjectService.getGates(pid),
        websiteProjectService.getFiles(pid),
      ]);
      setGates(gList);
      setFiles(fList);
    } catch {
      addToast('Error', 'Failed to load project deliverables', 'error');
    }
  }, [addToast]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDetails(selectedProjectId);
    }
  }, [selectedProjectId, loadProjectDetails]);

  const activeProject = projects.find((p) => p.id === selectedProjectId);

  const handleRecordDecision = async () => {
    if (!selectedProjectId || !activeDecisionGate) return;
    if (decisionType === 'changes_requested' && !decisionComment.trim()) {
      addToast('Feedback Required', 'Please provide revision notes explaining the requested changes.', 'warning');
      return;
    }

    setIsSubmittingDecision(true);
    try {
      await websiteProjectService.recordGateDecision(
        selectedProjectId,
        activeDecisionGate.gate_key,
        {
          decision: decisionType,
          comment: decisionComment.trim() || undefined,
        },
      );
      addToast(
        decisionType === 'approved' ? 'Deliverable Approved' : 'Feedback Sent',
        decisionType === 'approved'
          ? 'Thank you! The team has been notified of your sign-off.'
          : 'Thank you! Your feedback has been sent to the project manager.',
        'success',
      );
      setActiveDecisionGate(null);
      setDecisionComment('');
      fetchProjects();
      loadProjectDetails(selectedProjectId);
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const pendingGates = gates.filter((g) => g.status === 'in_review');

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-canvas overflow-hidden">
      {/* Top Header Bar with Navigation Mode Switcher on Left and Project Switcher + Refresh on Right */}
      <header className="px-6 py-2.5 bg-surface border-b border-border shrink-0">
        <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Navigation Mode Switcher (Approvals vs Pipeline) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 rounded-lg bg-subtle border border-border">
              <button
                type="button"
                onClick={() => setActiveTab('approvals')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'approvals'
                    ? 'bg-surface text-accent-text shadow-xs'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                <Inbox className="w-3.5 h-3.5" />
                <span>Pending Approvals</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold font-mono ${
                    pendingGates.length > 0
                      ? 'bg-warning-subtle text-warning-fg border border-warning-border'
                      : 'bg-subtle text-fg-muted border border-border'
                  }`}
                >
                  {pendingGates.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('pipeline')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'pipeline'
                    ? 'bg-surface text-accent-text shadow-xs'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Website Pipeline</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-subtle text-fg-muted border border-border font-mono">
                  {WEBSITE_STAGES_CONFIG.length}
                </span>
              </button>
            </div>
          </div>

          {/* Top-Right Area: Relocated Active Website Project Switcher + Refresh Button */}
          <div className="flex items-center gap-2.5">
            {isLoading && projects.length === 0 ? (
              <div className="h-8 w-44 bg-skel rounded-lg animate-pulse" />
            ) : projects.length > 1 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-fg-muted font-normal whitespace-nowrap">Active Website:</span>
                <div className="w-48">
                  <CustomSelect
                    value={selectedProjectId || ''}
                    onChange={(val) => setSelectedProjectId(val)}
                    options={projects.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    placeholder="Select website..."
                    size="sm"
                    align="right"
                  />
                </div>
              </div>
            ) : projects.length === 1 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-fg-muted font-normal whitespace-nowrap">Active Website:</span>
                <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-subtle border border-border text-fg">
                  {projects[0].name}
                </span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => {
                fetchProjects();
                if (selectedProjectId) loadProjectDetails(selectedProjectId);
              }}
              disabled={isLoading}
              title="Refresh projects"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-fg-muted hover:text-fg hover:bg-hover border border-border transition cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-accent-text' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Tab Content */}
      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
        {activeTab === 'approvals' ? (
          <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto w-full">
            {/* Loading Skeleton for Approvals */}
            {isLoading && <WebsitePortalApprovalsSkeleton />}

            {/* Empty State when no projects exist */}
            {!isLoading && projects.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center space-y-4">
                <div className="inline-flex p-3.5 rounded-xl bg-subtle text-fg-muted border border-border">
                  <Globe className="w-8 h-8" />
                </div>
                <div className="max-w-md mx-auto space-y-1.5">
                  <h3 className="text-base font-semibold text-fg">
                    No Active Website Projects
                  </h3>
                  <p className="text-xs text-fg-muted leading-relaxed">
                    There are currently no active website projects assigned to your workspace. Once your website build begins, milestone deliverables and sign-offs will appear here.
                  </p>
                </div>
              </div>
            )}

            {/* Active Project Content */}
            {!isLoading && activeProject && (
              <>
                {/* Project Summary Banner - Clean & Minimal, Repetitive Title Removed */}
                <div className="rounded-xl p-5 bg-surface border border-border space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-subtle text-fg border border-border">
                        {cleanLabel(activeProject.website_type)}
                      </span>
                      <span className="text-xs text-fg-muted font-normal">
                        Production Status & Delivery
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {safeHttpUrl(activeProject.staging_url) && (
                        <a
                          href={safeHttpUrl(activeProject.staging_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-lg border border-border bg-subtle text-fg hover:bg-hover text-xs font-medium flex items-center gap-1.5 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Preview Staging Site
                        </a>
                      )}
                      {safeHttpUrl(activeProject.live_url) && (
                        <a
                          href={safeHttpUrl(activeProject.live_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-lg border border-success-border bg-success-subtle text-success-fg text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-colors"
                        >
                          <Globe className="w-3.5 h-3.5" /> Live Website
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar & Details Strip */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs text-fg-muted font-normal">
                      <span>Overall Delivery Progress</span>
                      <span className="font-semibold text-fg font-mono">
                        {activeProject.progress}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(0, Math.min(100, activeProject.progress))}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-xs text-fg-muted pt-1">
                      <span>
                        Current Phase:{' '}
                        <strong className="text-fg capitalize font-semibold">
                          {cleanLabel(activeProject.stage)}
                        </strong>
                      </span>
                      {activeProject.target_launch_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-fg-muted" /> Target Launch:{' '}
                          <strong className="text-fg font-semibold">
                            {activeProject.target_launch_date}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ACTION CENTER: PENDING CLIENT APPROVALS */}
                {pendingGates.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-warning-solid" />
                      <h4 className="font-semibold text-sm text-fg">
                        Needs Your Review & Sign-Off ({pendingGates.length})
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {pendingGates.map((gate) => (
                        <div
                          key={gate.id}
                          className="p-5 rounded-xl bg-warning-subtle border border-warning-border space-y-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-warning-solid text-white">
                                  Action Required
                                </span>
                                <span className="text-xs font-mono text-fg-muted">
                                  Round {gate.round}
                                </span>
                              </div>
                              <h4 className="text-base font-semibold text-fg mt-1.5">
                                {gate.name}
                              </h4>
                              <p className="text-xs text-fg-muted mt-0.5">
                                Please review this deliverable and either approve it to advance to the next stage, or request revisions.
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Request Changes: Neutral Secondary Style (Gray Outline) */}
                              <button
                                onClick={() => {
                                  setActiveDecisionGate(gate);
                                  setDecisionType('changes_requested');
                                  setDecisionComment('');
                                }}
                                className="px-3.5 py-1.5 rounded-lg border border-border bg-surface text-fg hover:bg-hover text-xs font-semibold transition-colors cursor-pointer"
                              >
                                Request Changes
                              </button>
                              {/* Approve Deliverable: Primary Style */}
                              <button
                                onClick={() => {
                                  setActiveDecisionGate(gate);
                                  setDecisionType('approved');
                                  setDecisionComment('');
                                }}
                                className="px-4 py-1.5 rounded-lg bg-accent text-accent-fg hover:bg-accent/90 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                              >
                                <Check className="w-4 h-4 stroke-[2.5]" /> Approve Deliverable
                              </button>
                            </div>
                          </div>

                          {/* Guidance / Latest comments */}
                          {gate.comment_thread && gate.comment_thread.length > 0 && (
                            <div className="p-3 rounded-xl bg-surface border border-border text-xs space-y-1">
                              <span className="font-semibold text-fg">
                                Notes from Project Team:
                              </span>
                              <p className="text-fg-muted italic">
                                {gate.comment_thread[gate.comment_thread.length - 1].text}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center space-y-2">
                    <div className="inline-flex p-2.5 rounded-xl bg-success-subtle text-success-fg border border-success-border">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="max-w-md mx-auto space-y-1">
                      <h4 className="text-sm font-semibold text-fg">
                        All caught up! No reviews pending
                      </h4>
                      <p className="text-xs text-fg-muted leading-relaxed">
                        There are currently no website deliverables waiting for your approval. When a milestone stage is submitted for client sign-off, it will appear here.
                      </p>
                    </div>
                  </div>
                )}

                {/* DELIVERY ROADMAP (8 MILESTONES) */}
                <div className="rounded-xl p-5 bg-surface border border-border space-y-4">
                  <h4 className="font-semibold text-sm text-fg flex items-center gap-2">
                    <FolderKanban className="w-4 h-4 text-accent" />
                    Delivery Milestones & Stage Roadmap
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {WEBSITE_STAGES_CONFIG.filter((s) => s.id !== 'completed').map((stageConf, idx) => {
                      const stageGate = gates.find((g) => g.stage === stageConf.id);
                      const currentStageIdx = WEBSITE_STAGES_CONFIG.findIndex((s) => s.id === activeProject.stage);
                      const isPassed = idx < currentStageIdx;
                      const isCurrent = stageConf.id === activeProject.stage;

                      return (
                        <div
                          key={stageConf.id}
                          className={`p-3.5 rounded-xl border transition-all ${
                            isCurrent
                              ? 'border-accent bg-accent-subtle'
                              : isPassed
                              ? 'border-success-border bg-success-subtle'
                              : 'border-border bg-subtle'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-semibold text-xs text-fg">
                              {stageConf.name}
                            </span>
                            {isPassed ? (
                              <CheckCircle2 className="w-4 h-4 text-success-fg shrink-0" />
                            ) : isCurrent ? (
                              <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
                            ) : null}
                          </div>
                          <p className="text-xs text-fg-muted line-clamp-2 leading-relaxed">
                            {stageConf.description}
                          </p>
                          {stageGate && (
                            <div className="mt-2 pt-2 border-t border-border text-[10px] font-medium text-fg-muted flex items-center justify-between">
                              <span>Gate: {stageGate.name.split(' ')[0]}</span>
                              <span
                                className={`capitalize font-semibold ${
                                  stageGate.status === 'approved'
                                    ? 'text-success-fg'
                                    : stageGate.status === 'in_review'
                                    ? 'text-warning-fg'
                                    : 'text-fg-subtle'
                                }`}
                              >
                                {cleanLabel(stageGate.status)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* DELIVERABLES & ASSETS LIST */}
                <div className="rounded-xl p-5 bg-surface border border-border space-y-3">
                  <h4 className="font-semibold text-sm text-fg flex items-center gap-2">
                    <FileText className="w-4 h-4 text-accent" />
                    Shared Project Deliverables & Prototypes ({files.length})
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="p-3 rounded-xl border border-border bg-subtle flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {file.external_url ? (
                            <Link2 className="w-4 h-4 text-accent shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-accent shrink-0" />
                          )}
                          <div className="truncate">
                            <p className="font-medium text-fg truncate">
                              {file.name}
                            </p>
                            <span className="text-[10px] text-fg-muted capitalize">
                              Folder: {file.folder}
                            </span>
                          </div>
                        </div>

                        {safeHttpUrl(file.external_url) ? (
                          <a
                            href={safeHttpUrl(file.external_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-surface text-fg font-semibold text-xs hover:bg-hover shrink-0 border border-border"
                          >
                            Open
                          </a>
                        ) : file.storage_key ? (
                          <a
                            href={getBackendFileUrl(file.storage_key)}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-surface text-fg font-semibold text-xs hover:bg-hover shrink-0 border border-border"
                          >
                            Download
                          </a>
                        ) : null}
                      </div>
                    ))}

                    {files.length === 0 && (
                      <div className="p-8 text-center rounded-xl border border-dashed border-border text-xs text-fg-muted col-span-full">
                        <FileText className="w-6 h-6 mx-auto mb-2 text-fg-subtle stroke-1" />
                        <p className="font-medium text-fg">No deliverables shared yet</p>
                        <p className="text-xs text-fg-subtle mt-0.5">Project files, prototypes, and asset links will be listed here as stages progress.</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Website Pipeline Kanban View across All Stages + Sub-mode for Tasks */
          <div className="h-full flex flex-col min-w-0">
            {/* Sub-mode switcher for Website Pipeline: Websites vs Tasks */}
            <div className="px-6 py-2 bg-surface border-b border-border flex items-center justify-end shrink-0">
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-canvas border border-border shrink-0">
                <button
                  type="button"
                  onClick={() => setPipelineSubMode('websites')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    pipelineSubMode === 'websites'
                      ? 'bg-hover text-accent-text shadow-2xs'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Websites ({projects.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPipelineSubMode('tasks')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    pipelineSubMode === 'tasks'
                      ? 'bg-hover text-accent-text shadow-2xs'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Tasks ({tasks.length})</span>
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              {isLoading ? (
                pipelineSubMode === 'websites' ? (
                  <WebsitePipelineBoardSkeleton />
                ) : (
                  <WebsiteTaskBoardSkeleton />
                )
              ) : pipelineSubMode === 'websites' ? (
                <WebsitePipelineBoard
                  projects={projects}
                  isClientUser={true}
                  onSelectProject={(p) => setDrawerProject(p)}
                  onRefresh={() => {
                    fetchProjects();
                    if (selectedProjectId) loadProjectDetails(selectedProjectId);
                  }}
                />
              ) : (
                <WebsiteTaskBoard
                  tasks={tasks}
                  projects={projects}
                  onSelectTask={(t) => setDrawerTask(t)}
                  onRefresh={fetchProjects}
                  isClientUser={true}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Decision Modal */}
      {activeDecisionGate && (
        <Modal
          isOpen={!!activeDecisionGate}
          onClose={() => setActiveDecisionGate(null)}
          maxWidth="lg"
          title={decisionType === 'approved' ? 'Approve Deliverable' : 'Request Changes'}
          description={
            decisionType === 'approved'
              ? `You are confirming approval for ${activeDecisionGate.name}. This will record your sign-off and allow the project to advance toward the next milestone.`
              : `Please provide specific feedback for the team regarding ${activeDecisionGate.name}. The project manager will review your notes and coordinate any revisions needed.`
          }
        >
          <div className="space-y-4">
            <textarea
              rows={4}
              required={decisionType === 'changes_requested'}
              placeholder={
                decisionType === 'approved'
                  ? 'Optional appreciation note or comment...'
                  : 'Please list specific change requests or adjustments required...'
              }
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs border border-border bg-subtle text-fg placeholder:text-fg-subtle focus:outline-none focus:border-border-strong"
            />

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setActiveDecisionGate(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-fg hover:bg-hover border border-border transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordDecision}
                disabled={isSubmittingDecision}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ${
                  decisionType === 'approved'
                    ? 'bg-success-solid text-white hover:bg-success-solid/90'
                    : 'bg-accent text-accent-fg hover:bg-accent/90'
                }`}
              >
                {isSubmittingDecision ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : decisionType === 'approved' ? (
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                <span>
                  {isSubmittingDecision
                    ? 'Submitting...'
                    : decisionType === 'approved'
                    ? 'Confirm Approval'
                    : 'Submit Revision Request'}
                </span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Project Drawer for Client */}
      {drawerProject && (
        <WebsiteProjectDrawer
          project={drawerProject}
          isOpen={!!drawerProject}
          isClientUser={true}
          onClose={() => setDrawerProject(null)}
          onRefresh={() => {
            fetchProjects();
            if (selectedProjectId) loadProjectDetails(selectedProjectId);
          }}
          onProjectUpdated={(p) => {
            setDrawerProject(p);
            setProjects((prev) => prev.map((item) => (item.id === p.id ? p : item)));
          }}
        />
      )}

      {/* Task Modal for Client Inspection */}
      {drawerTask && (
        <WebsiteTaskModal
          isOpen={!!drawerTask}
          task={drawerTask}
          project={
            projects.find((p) => p.id === drawerTask.project_id) ||
            projects[0] ||
            ({ id: drawerTask.project_id, name: drawerTask.project_name || 'Website', stage: drawerTask.stage } as WebsiteProject)
          }
          stage={drawerTask.stage}
          onClose={() => setDrawerTask(null)}
          onCommentsChanged={(taskId, newComments) => {
            setDrawerTask((prev) => (prev && prev.id === taskId ? { ...prev, comments: newComments } : prev));
            setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, comments: newComments } : t)));
          }}
          canManage={false}
        />
      )}
    </div>
  );
};
