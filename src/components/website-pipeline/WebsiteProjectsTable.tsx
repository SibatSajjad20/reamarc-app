import React, { useState, useMemo } from 'react';
import {
  TableCard,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
  SortHeader,
} from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { Avatar } from '../ui/Avatar';
import { useMemberAvatars } from '../../hooks/useMemberAvatars';
import type { WebsiteProject, WebsiteStage } from '../../types/websiteProject';
import { WEBSITE_STAGES_CONFIG } from '../../types/websiteProject';
import { healthBadge, cleanLabel } from '../../utils/websiteProjectStyles';
import { cn } from '../../lib/utils';
import { Globe, ArrowUpRight } from 'lucide-react';

export interface WebsiteProjectsTableProps {
  projects: WebsiteProject[];
  onSelectProject: (project: WebsiteProject) => void;
  onRefresh?: () => void;
}

type SortField = 'name' | 'client_name' | 'stage' | 'health' | 'progress' | 'target_launch_date' | 'manager_name';

const STAGE_ORDER: Record<WebsiteStage, number> = {
  strategy: 1,
  content: 2,
  design: 3,
  assets: 4,
  development: 5,
  qa: 6,
  client_review: 7,
  production: 8,
  completed: 9,
};

export const WebsiteProjectsTable: React.FC<WebsiteProjectsTableProps> = ({
  projects,
  onSelectProject,
}) => {
  const { getAvatarUrl } = useMemberAvatars();
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'client_name':
          comparison = (a.client_name || '').localeCompare(b.client_name || '');
          break;
        case 'stage':
          comparison = (STAGE_ORDER[a.stage] || 0) - (STAGE_ORDER[b.stage] || 0);
          break;
        case 'health':
          comparison = (a.health || '').localeCompare(b.health || '');
          break;
        case 'progress':
          comparison = (a.progress || 0) - (b.progress || 0);
          break;
        case 'target_launch_date':
          comparison = (a.target_launch_date || '').localeCompare(b.target_launch_date || '');
          break;
        case 'manager_name':
          comparison = (a.manager_name || '').localeCompare(b.manager_name || '');
          break;
        default:
          comparison = 0;
      }
      return sortAsc ? comparison : -comparison;
    });
  }, [projects, sortField, sortAsc]);

  if (projects.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center flex-1">
        <EmptyState
          title="No website projects found"
          description="Try adjusting your search query, stage, or health filter."
          icon={Globe}
        />
      </div>
    );
  }

  return (
    <div className="p-5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
      <TableCard className="w-full">
        <Table hasStickyFirstCol>
          <THead>
            <tr>
              <TH stickyLeft>
                <SortHeader
                  label="Project"
                  direction={sortField === 'name' ? (sortAsc ? 'asc' : 'desc') : null}
                  onSort={() => handleSort('name')}
                />
              </TH>
              <TH>
                <SortHeader
                  label="Client"
                  direction={sortField === 'client_name' ? (sortAsc ? 'asc' : 'desc') : null}
                  onSort={() => handleSort('client_name')}
                />
              </TH>
              <TH>
                <SortHeader
                  label="Stage"
                  direction={sortField === 'stage' ? (sortAsc ? 'asc' : 'desc') : null}
                  onSort={() => handleSort('stage')}
                />
              </TH>
              <TH>
                <SortHeader
                  label="Health"
                  direction={sortField === 'health' ? (sortAsc ? 'asc' : 'desc') : null}
                  onSort={() => handleSort('health')}
                />
              </TH>
              <TH>
                <SortHeader
                  label="Progress"
                  direction={sortField === 'progress' ? (sortAsc ? 'asc' : 'desc') : null}
                  onSort={() => handleSort('progress')}
                />
              </TH>
              <TH className="hidden xl:table-cell">Tasks</TH>
              <TH className="hidden lg:table-cell">
                <SortHeader
                  label="Launch Date"
                  direction={sortField === 'target_launch_date' ? (sortAsc ? 'asc' : 'desc') : null}
                  onSort={() => handleSort('target_launch_date')}
                />
              </TH>
              <TH className="hidden xl:table-cell">
                <SortHeader
                  label="Manager"
                  direction={sortField === 'manager_name' ? (sortAsc ? 'asc' : 'desc') : null}
                  onSort={() => handleSort('manager_name')}
                />
              </TH>
            </tr>
          </THead>
          <TBody>
            {sortedProjects.map((project) => {
              const hb = healthBadge(project.health);
              const stageConf = WEBSITE_STAGES_CONFIG.find((s) => s.id === project.stage);
              const stageLabel = stageConf?.shortLabel || cleanLabel(project.stage);
              const formattedLaunchDate = project.target_launch_date
                ? new Date(project.target_launch_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '—';

              return (
                <TR
                  key={project.id}
                  onClick={() => onSelectProject(project)}
                  className="cursor-pointer hover:bg-hover transition-colors group"
                >
                  {/* Project Name */}
                  <TD stickyLeft className="min-w-[180px] max-w-[220px]">
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-fg text-small group-hover:text-accent transition-colors inline-flex items-center gap-1 truncate" title={project.name}>
                        {project.name}
                        <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-accent shrink-0" />
                      </span>
                      {project.staging_url ? (
                        <span className="text-caption text-fg-muted truncate max-w-xs font-mono text-[11px]" title={project.staging_url}>
                          {project.staging_url.replace(/^https?:\/\//, '')}
                        </span>
                      ) : (
                        <span className="text-caption text-fg-muted capitalize truncate">
                          {project.website_type.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  </TD>

                  {/* Client */}
                  <TD className="text-small text-fg whitespace-nowrap min-w-0 max-w-[160px] truncate" title={project.client_name || ''}>
                    {project.client_name || '—'}
                  </TD>

                  {/* Stage */}
                  <TD className="whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-caption font-medium bg-subtle text-fg border border-border">
                      {stageLabel}
                    </span>
                  </TD>

                  {/* Health */}
                  <TD className="whitespace-nowrap">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-caption font-medium border',
                        hb.bg,
                        hb.text,
                        hb.border
                      )}
                    >
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', hb.dot)} />
                      {hb.label}
                    </span>
                  </TD>

                  {/* Progress */}
                  <TD className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-subtle rounded-full overflow-hidden border border-border shrink-0">
                        <div
                          className="h-full bg-accent rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, project.progress || 0))}%` }}
                        />
                      </div>
                      <span className="font-numeric font-medium text-small text-fg w-8">
                        {project.progress || 0}%
                      </span>
                    </div>
                  </TD>

                  {/* Tasks */}
                  <TD className="whitespace-nowrap hidden xl:table-cell">
                    <span className="font-numeric text-small text-fg">
                      {project.completed_tasks_count} / {project.total_tasks_count}
                    </span>
                    {project.overdue_tasks_count > 0 && (
                      <span className="text-danger-fg text-caption ml-1 font-numeric">
                        ({project.overdue_tasks_count} overdue)
                      </span>
                    )}
                  </TD>

                  {/* Launch Date */}
                  <TD className="whitespace-nowrap text-small text-fg-muted font-numeric hidden lg:table-cell">
                    {formattedLaunchDate}
                  </TD>

                  {/* Manager */}
                  <TD className="whitespace-nowrap hidden xl:table-cell">
                    {project.manager_name ? (
                      <div className="flex items-center gap-1.5">
                        <Avatar
                          name={project.manager_name}
                          src={getAvatarUrl(project.manager_id, project.manager_name)}
                          size={20}
                          className="rounded-full shrink-0"
                        />
                        <span className="text-small text-fg truncate max-w-[120px]" title={project.manager_name}>{project.manager_name}</span>
                      </div>
                    ) : (
                      <span className="text-caption text-fg-muted italic">Unassigned</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableCard>
    </div>
  );
};
