import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ExternalLink,
  Globe,
  PauseCircle,
} from 'lucide-react';
import type { WebsiteProject, WebsiteStage } from '../../types/websiteProject';
import { WEBSITE_STAGES_CONFIG } from '../../types/websiteProject';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm, usePrompt } from '../ui/ConfirmProvider';
import { canManageWebsiteProject } from '../../utils/websiteProjectAccess';
import { websiteProjectService } from '../../services/websiteProjectService';
import { healthBadge } from '../../utils/websiteProjectStyles';
import { safeHttpUrl } from '../../utils/safeHttpUrl';

interface Props {
  projects: WebsiteProject[];
  onSelectProject: (project: WebsiteProject) => void;
  onRefresh: () => void;
  isClientUser?: boolean;
}

function formatType(type: string): string {
  switch (type) {
    case 'web_app':
      return 'Web App';
    case 'landing_page':
      return 'Landing Page';
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

export const WebsitePipelineBoard: React.FC<Props> = ({
  projects,
  onSelectProject,
  onRefresh,
  isClientUser,
}) => {
  const { user } = useAuth();
  const isClient = isClientUser ?? (user?.role === 'client');
  const { addToast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const projectsByStage: Record<WebsiteStage, WebsiteProject[]> = React.useMemo(() => {
    const map = {} as Record<WebsiteStage, WebsiteProject[]>;
    for (const conf of WEBSITE_STAGES_CONFIG) {
      map[conf.id] = [];
    }
    for (const p of projects) {
      if (map[p.stage]) {
        map[p.stage].push(p);
      } else {
        map['strategy'] = map['strategy'] || [];
        map['strategy'].push(p);
      }
    }
    return map;
  }, [projects]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (isClient) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    if (isClient) return;
    e.preventDefault();
    if (overStage !== stageId) {
      setOverStage(stageId);
    }
  };

  const handleDragLeave = () => {
    setOverStage(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStage: WebsiteStage) => {
    if (isClient) return;
    e.preventDefault();
    const pid = draggingId || e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    setOverStage(null);

    if (!pid) return;
    const project = projects.find((p) => p.id === pid);
    if (!project || project.stage === targetStage) return;

    const canManage = canManageWebsiteProject(user, project);
    if (!canManage) {
      addToast('Permission Denied', 'Only the assigned Project Manager or Admin can move stages.', 'error');
      return;
    }

    try {
      await websiteProjectService.transitionStage(pid, targetStage);
      addToast('Stage Updated', `Moved ${project.name} to ${targetStage.replace('_', ' ')}.`, 'success');
      onRefresh();
    } catch (err: any) {
      const msg = err.message || 'Cannot advance stage';
      const isWorkflowBlocked = msg.toLowerCase().includes('block') ||
        msg.toLowerCase().includes('gate') ||
        msg.toLowerCase().includes('task') ||
        msg.toLowerCase().includes('workflow');

      if (isWorkflowBlocked) {
        const ok = await confirm({
          title: 'Force move project?',
          description: `${msg}\n\nDo you want to FORCE MOVE this project as Project Manager?`,
          confirmLabel: 'Force move',
          tone: 'danger',
        });
        if (ok) {
          const reason = await prompt({
            title: 'Reason for force transition',
            label: 'Please provide a mandatory reason for force-advancing:',
          });
          if (reason && reason.trim()) {
            try {
              await websiteProjectService.forceTransitionStage(pid, targetStage, reason.trim());
              addToast('Forced Transition', `Project force-moved to ${targetStage}.`, 'warning');
              onRefresh();
            } catch (forceErr: any) {
              addToast('Force Move Failed', forceErr.message || 'Failed to force move stage', 'error');
            }
          }
        } else {
          addToast('Transition Blocked', msg, 'warning');
        }
      } else {
        addToast('Error', msg, 'error');
      }
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-canvas overflow-hidden">
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 pt-3 flex gap-3.5 select-none custom-scrollbar">
        {WEBSITE_STAGES_CONFIG.map((stageConf) => {
          const stageProjects = projectsByStage[stageConf.id] || [];
          const isOver = overStage === stageConf.id;

          return (
            <div
              key={stageConf.id}
              onDragOver={(e) => handleDragOver(e, stageConf.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stageConf.id)}
              className={`min-w-[290px] w-[290px] max-w-[290px] flex-shrink-0 flex flex-col rounded-xl bg-surface border transition-all duration-200 ${
                isOver
                  ? 'border-accent ring-2 ring-accent/30 bg-accent-soft'
                  : 'border-border'
              }`}
            >
              {/* Column Header */}
              <div className="p-3.5 pb-2.5 border-b border-border">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-sm text-fg truncate">
                      {stageConf.name}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-subtle text-fg-muted border border-border shadow-2xs">
                      {stageProjects.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cards Container */}
              <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto custom-scrollbar">
                {stageProjects.map((project) => {
                  const hStyle = healthBadge(project.health);
                  const isDragging = draggingId === project.id;
                  const targetLaunch = project.target_launch_date;
                  const isLaunchOverdue =
                    targetLaunch &&
                    targetLaunch < new Date().toISOString().slice(0, 10) &&
                    project.stage !== 'completed';

                  const canManage = !isClient && canManageWebsiteProject(user, project);
                  const isDraggable = canManage;

                  return (
                    <div
                      key={project.id}
                      draggable={isDraggable}
                      onDragStart={(e) => {
                        if (!isDraggable) {
                          e.preventDefault();
                          return;
                        }
                        handleDragStart(e, project.id);
                      }}
                      onClick={() => onSelectProject(project)}
                      className={`group relative rounded-xl p-3.5 bg-subtle border border-border shadow-2xs hover:border-border-strong hover:bg-hover transition-all ${
                        isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                      } ${
                        isDragging ? 'opacity-40 scale-95' : 'opacity-100'
                      }`}
                    >
                      {/* Top Chips: Client + Type */}
                      <div className="flex items-center justify-between gap-1.5 mb-2">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-surface text-fg-muted truncate max-w-[150px] border border-border">
                          {project.client_name}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-soft text-accent-text border border-accent-pill-bd">
                          {formatType(project.website_type)}
                        </span>
                      </div>

                      {/* Project Title */}
                      <h4 className="font-semibold text-sm text-fg group-hover:text-accent-text transition-colors line-clamp-2 mb-2.5">
                        {project.name}
                      </h4>

                      {/* Health & On-Hold Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${hStyle.bg} ${hStyle.text} ${hStyle.border}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${hStyle.dot}`} />
                          {hStyle.label}
                        </span>

                        {project.on_hold && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-surface text-fg-muted border border-border">
                            <PauseCircle className="w-3 h-3 text-fg-muted" />
                            Paused
                          </span>
                        )}

                        {project.stage === 'development' && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-accent-soft text-accent-text border border-accent-pill-bd">
                            Parallel Assets
                          </span>
                        )}
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1 mb-3">
                        <div className="flex items-center justify-between text-xs text-fg-muted font-medium">
                          <span>Progress</span>
                          <span>{project.progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-surface rounded-full overflow-hidden border border-border">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              project.stage === 'completed'
                                ? 'bg-success-fg'
                                : project.health === 'at_risk'
                                ? 'bg-danger-solid'
                                : 'bg-accent'
                            }`}
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Task Checklist & Target Launch Strip */}
                      <div className="pt-2.5 border-t border-border flex items-center justify-between text-xs">
                        {/* Checklist Counter */}
                        <div className="flex items-center gap-1.5 text-fg-muted font-medium">
                          <CheckCircle2
                            className={`w-3.5 h-3.5 ${
                              project.required_tasks_open === 0
                                ? 'text-success-fg'
                                : 'text-fg-muted'
                            }`}
                          />
                          <span>
                            {project.completed_tasks_count}/{project.total_tasks_count} tasks
                          </span>
                          {project.overdue_tasks_count > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-danger-bg text-danger-fg font-semibold text-[10px] border border-danger-bd">
                              {project.overdue_tasks_count} overdue
                            </span>
                          )}
                        </div>

                        {/* Target Launch */}
                        {targetLaunch ? (
                          <div
                            className={`flex items-center gap-1 font-medium ${
                              isLaunchOverdue
                                ? 'text-danger-fg'
                                : 'text-fg-muted'
                            }`}
                          >
                            <Calendar className="w-3 h-3" />
                            <span>{new Date(targetLaunch).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                          </div>
                        ) : (
                          <span className="text-fg-muted text-[10px]">No launch date</span>
                        )}
                      </div>

                      {/* Quick links & PM avatar */}
                      <div className="mt-2.5 flex items-center justify-between text-fg-muted text-xs">
                        <div className="flex items-center gap-1.5">
                          {project.staging_url && (
                            <a
                              href={safeHttpUrl(project.staging_url)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Preview Staging URL"
                              className="p-1 rounded hover:bg-hover text-accent-text"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {project.live_url && (
                            <a
                              href={safeHttpUrl(project.live_url)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Visit Live Site"
                              className="p-1 rounded hover:bg-hover text-success-fg"
                            >
                              <Globe className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>

                        {project.manager_name && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-fg-muted truncate max-w-[80px]">
                              {project.manager_name}
                            </span>
                            <div className="w-5 h-5 rounded-full bg-accent-soft text-accent-text font-semibold text-[9px] flex items-center justify-center border border-accent-pill-bd">
                              {project.manager_name.charAt(0).toUpperCase()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {stageProjects.length === 0 && (
                  <div className="h-32 flex flex-col items-center justify-center rounded-xl border border-dashed border-border text-fg-muted text-xs">
                    <span>No projects</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const WebsitePipelineBoardSkeleton: React.FC = () => {
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-canvas overflow-hidden">
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 pt-3 flex gap-3.5 select-none custom-scrollbar">
        {WEBSITE_STAGES_CONFIG.map((stageConf) => (
          <div
            key={stageConf.id}
            className="min-w-[290px] w-[290px] max-w-[290px] flex-shrink-0 flex flex-col rounded-xl bg-surface border border-border animate-pulse"
          >
            {/* Column Header Skeleton */}
            <div className="p-3.5 pb-2.5 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <div className="h-4 w-28 bg-skel rounded-md" />
                <div className="h-4 w-6 bg-skel rounded-full" />
              </div>
            </div>

            {/* Cards Container Skeleton */}
            <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto custom-scrollbar">
              {[1, 2, 3].map((cardIdx) => (
                <div
                  key={cardIdx}
                  className="rounded-xl p-3.5 bg-subtle border border-border shadow-2xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-3.5 w-20 bg-skel rounded" />
                    <div className="h-3 w-14 bg-skel rounded" />
                  </div>
                  <div className="h-4 w-3/4 bg-skel rounded" />
                  <div className="flex gap-1.5">
                    <div className="h-4 w-16 bg-skel rounded-full" />
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 w-full bg-skel rounded-full" />
                  </div>
                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <div className="h-3 w-16 bg-skel rounded" />
                    <div className="h-5 w-5 bg-skel rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

