import React from 'react';
import {
  ChevronRight,
  ExternalLink,
  Globe,
  PauseCircle,
} from 'lucide-react';
import type { WebsiteProject } from '../../types/websiteProject';
import { WEBSITE_STAGES_CONFIG } from '../../types/websiteProject';
import { healthBadge, cleanLabel } from '../../utils/websiteProjectStyles';
import { safeHttpUrl } from '../../utils/safeHttpUrl';

interface Props {
  projects: WebsiteProject[];
  onSelectProject: (project: WebsiteProject) => void;
}

function getStageName(stageId: string): string {
  const c = WEBSITE_STAGES_CONFIG.find((s) => s.id === stageId);
  return c ? c.shortLabel : stageId;
}

export const WebsiteTableView: React.FC<Props> = ({ projects, onSelectProject }) => {
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-canvas overflow-hidden">
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-surface text-fg-muted font-semibold border-b border-border">
            <tr>
              <th className="py-3 px-4">Project</th>
              <th className="py-3 px-3">Client</th>
              <th className="py-3 px-3">Type</th>
              <th className="py-3 px-3">Stage</th>
              <th className="py-3 px-3">Progress</th>
              <th className="py-3 px-3">Health</th>
              <th className="py-3 px-3">Launch Date</th>
              <th className="py-3 px-3">Manager</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-fg">
            {projects.map((p) => {
              const h = healthBadge(p.health);
              const targetLaunch = p.target_launch_date;
              const isOverdue =
                targetLaunch &&
                targetLaunch < new Date().toISOString().slice(0, 10) &&
                p.stage !== 'completed';

              return (
                <tr
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  className="hover:bg-hover cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-medium text-fg max-w-[220px]">
                    <div className="flex items-center gap-2 truncate">
                      <span className="truncate">{p.name}</span>
                      {p.on_hold && (
                        <PauseCircle className="w-3.5 h-3.5 text-fg-subtle flex-shrink-0" />
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-subtle text-fg-muted font-medium border border-border">
                      {p.client_name}
                    </span>
                  </td>

                  <td className="py-3 px-3 capitalize text-fg-muted">
                    {cleanLabel(p.website_type)}
                  </td>

                  <td className="py-3 px-3 font-medium text-fg">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent-subtle text-accent-fg border border-accent-border">
                      {getStageName(p.stage)}
                    </span>
                  </td>

                  <td className="py-3 px-3 min-w-[130px]">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-surface border border-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-fg-muted">
                        {p.progress}%
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${h.bg} ${h.text} ${h.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${h.dot}`} />
                      {h.label}
                    </span>
                  </td>

                  <td className="py-3 px-3 font-medium">
                    {targetLaunch ? (
                      <span
                        className={
                          isOverdue
                            ? 'text-danger-fg'
                            : 'text-fg-muted'
                        }
                      >
                        {targetLaunch}
                      </span>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-fg-muted">
                    {p.manager_name || '—'}
                  </td>

                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.staging_url && (
                        <a
                          href={safeHttpUrl(p.staging_url)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Preview Staging URL"
                          className="p-1 rounded hover:bg-hover text-accent-fg"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {p.live_url && (
                        <a
                          href={safeHttpUrl(p.live_url)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Visit Live Site"
                          className="p-1 rounded hover:bg-hover text-success-fg"
                        >
                          <Globe className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectProject(p);
                        }}
                        className="p-1 rounded text-fg-muted hover:text-fg hover:bg-hover"
                        title="Open Details"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {projects.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-fg-subtle text-sm">
                  No website projects match your current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const WebsiteTableSkeleton: React.FC = () => {
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-canvas overflow-hidden">
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-surface text-fg-muted font-semibold border-b border-border">
            <tr>
              <th className="py-3 px-4">Project</th>
              <th className="py-3 px-3">Client</th>
              <th className="py-3 px-3">Type</th>
              <th className="py-3 px-3">Stage</th>
              <th className="py-3 px-3">Progress</th>
              <th className="py-3 px-3">Health</th>
              <th className="py-3 px-3">Launch Date</th>
              <th className="py-3 px-3">Manager</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border animate-pulse">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
              <tr key={idx} className="h-12">
                <td className="py-3 px-4">
                  <div className="h-3.5 w-36 bg-skel rounded mb-1" />
                  <div className="h-2 w-20 bg-skel rounded" />
                </td>
                <td className="py-3 px-3">
                  <div className="h-4 w-20 bg-skel rounded" />
                </td>
                <td className="py-3 px-3">
                  <div className="h-3.5 w-16 bg-skel rounded" />
                </td>
                <td className="py-3 px-3">
                  <div className="h-4 w-24 bg-skel rounded-md" />
                </td>
                <td className="py-3 px-3">
                  <div className="h-2 w-24 bg-skel rounded-full" />
                </td>
                <td className="py-3 px-3">
                  <div className="h-4 w-20 bg-skel rounded-full" />
                </td>
                <td className="py-3 px-3">
                  <div className="h-3.5 w-16 bg-skel rounded" />
                </td>
                <td className="py-3 px-3">
                  <div className="h-3.5 w-20 bg-skel rounded" />
                </td>
                <td className="py-3 px-3 text-right">
                  <div className="h-5 w-12 bg-skel rounded ml-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

