import React from 'react';
import { Users } from 'lucide-react';
import type { TeamMemberWorkload } from '../../../utils/contentCalendarOverview';
import { Avatar } from '../../ui/Avatar';
import { useMemberAvatars } from '../../../hooks/useMemberAvatars';

interface Props {
  workload: TeamMemberWorkload[];
  isLoading?: boolean;
}

export const TeamWorkloadCard: React.FC<Props> = ({ workload, isLoading = false }) => {
  const { getAvatarUrl } = useMemberAvatars();

  return (
    <div className="w-full rounded-lg bg-surface border border-border shadow-xs p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-accent" />
          <h3 className="text-ui font-semibold text-fg">
            Team Workload
          </h3>
        </div>
        <span className="font-numeric text-xs text-fg-muted">
          {workload.length} {workload.length === 1 ? 'contributor' : 'contributors'}
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="divide-y divide-border pt-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="py-2.5 grid grid-cols-[minmax(0,1fr)_64px_56px_68px] items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-skel animate-pulse" />
                <div className="h-3.5 w-24 bg-skel rounded animate-pulse" />
              </div>
              <div className="h-5 w-full bg-skel rounded animate-pulse" />
              <div className="h-5 w-full bg-skel rounded animate-pulse" />
              <div className="h-5 w-full bg-skel rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : workload.length === 0 ? (
        <div className="py-8 text-center text-fg-muted">
          <div className="w-9 h-9 rounded-full bg-subtle text-fg-muted flex items-center justify-center mx-auto mb-2">
            <Users className="w-4 h-4" />
          </div>
          <p className="text-xs font-semibold text-fg">No team workload data</p>
          <p className="text-[11px] text-fg-muted mt-0.5">
            No team members currently assigned to active campaigns in this filter scope.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Subheader */}
          <div className="grid grid-cols-[minmax(0,1fr)_64px_56px_68px] items-center gap-2 pt-2 pb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border">
            <div>Member</div>
            <div className="text-center">Active</div>
            <div className="text-center">Rev</div>
            <div className="text-center">Overdue</div>
          </div>

          <div className="divide-y divide-border overflow-y-auto max-h-[180px]">
            {workload.map((member) => (
              <div
                key={member.id}
                className="py-2 grid grid-cols-[minmax(0,1fr)_64px_56px_68px] items-center gap-2 text-xs"
              >
                {/* Member Info */}
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar
                    name={member.name}
                    src={getAvatarUrl(member.id, member.name)}
                    size={22}
                    className="rounded-md shrink-0 text-[9px]"
                  />
                  <div className="truncate min-w-0">
                    <div className="font-semibold text-fg text-xs truncate">
                      {member.name}
                    </div>
                    <div className="text-[10px] text-fg-muted truncate">
                      {member.role}
                    </div>
                  </div>
                </div>

                {/* Active */}
                <div className="text-center font-numeric text-[10.5px]">
                  <span className="w-full inline-block px-1.5 py-0.5 rounded-md bg-subtle text-fg font-semibold border border-border">
                    {member.totalActive}
                  </span>
                </div>

                {/* Revisions */}
                <div className="text-center font-numeric text-[10.5px]">
                  {member.revisions > 0 ? (
                    <span className="w-full inline-block px-1.5 py-0.5 rounded-md bg-warning-bg text-warning-fg font-semibold border border-warning-bd">
                      {member.revisions}
                    </span>
                  ) : (
                    <span className="text-fg-muted text-[10px]">—</span>
                  )}
                </div>

                {/* Overdue */}
                <div className="text-center font-numeric text-[10.5px]">
                  {member.overdue > 0 ? (
                    <span className="w-full inline-block px-1.5 py-0.5 rounded-md bg-danger-bg text-danger-fg font-semibold border border-danger-bd">
                      {member.overdue}
                    </span>
                  ) : (
                    <span className="text-fg-muted text-[10px]">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
