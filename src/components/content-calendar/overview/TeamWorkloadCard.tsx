import React from 'react';
import { Users } from 'lucide-react';
import type { TeamMemberWorkload } from '../../../utils/contentCalendarOverview';
import { getInitials } from '../../../utils/badgeStyles';

interface Props {
  workload: TeamMemberWorkload[];
  isLoading?: boolean;
}

export const TeamWorkloadCard: React.FC<Props> = ({ workload, isLoading = false }) => {
  return (
    <div className="w-full h-[235px] rounded-xl bg-surface border border-border p-3 sm:p-3.5 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-fg-muted" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">
            Team Workload & Capacity
          </h3>
        </div>
        <span className="font-mono text-xs text-fg-muted">
          {workload.length} contributors
        </span>
      </div>

      {/* Column Sub-Header for rigid vertical alignment */}
      <div className="grid grid-cols-[minmax(0,1fr)_64px_56px_68px] items-center gap-2 pt-1.5 pb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-b border-border">
        <div>Member</div>
        <div className="text-center">Active</div>
        <div className="text-center">Rev</div>
        <div className="text-center">Overdue</div>
      </div>

      {/* Member list with internal scroll */}
      <div className="mt-1 divide-y divide-border overflow-y-auto flex-1 pr-1">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="py-2 grid grid-cols-[minmax(0,1fr)_64px_56px_68px] items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-skel animate-pulse" />
                <div className="h-3.5 w-24 bg-skel rounded animate-pulse" />
              </div>
              <div className="h-5 w-full bg-skel rounded animate-pulse" />
              <div className="h-5 w-full bg-skel rounded animate-pulse" />
              <div className="h-5 w-full bg-skel rounded animate-pulse" />
            </div>
          ))
        ) : workload.length === 0 ? (
          <div className="py-8 text-center text-fg-muted">
            <p className="text-xs font-medium">No assigned team members on active campaigns</p>
          </div>
        ) : (
          workload.map((member) => {
            const initials = getInitials(member.name);
            return (
              <div
                key={member.id}
                className="py-1.5 grid grid-cols-[minmax(0,1fr)_64px_56px_68px] items-center gap-2 text-xs"
              >
                {/* Col 1: Name + Avatar */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-5 h-5 rounded-md bg-subtle border border-border flex items-center justify-center text-[9px] font-semibold text-fg shrink-0">
                    {initials}
                  </div>
                  <div className="truncate min-w-0">
                    <div className="font-semibold text-fg text-xs truncate">
                      {member.name}
                    </div>
                    <div className="text-[10px] text-fg-muted truncate">
                      {member.role}
                    </div>
                  </div>
                </div>

                {/* Col 2: Active Badge */}
                <div className="text-center font-mono text-[10.5px]">
                  <span className="w-full inline-block px-1.5 py-0.5 rounded-md bg-subtle text-fg font-semibold border border-border">
                    {member.totalActive} active
                  </span>
                </div>

                {/* Col 3: Revisions Badge */}
                <div className="text-center font-mono text-[10.5px]">
                  {member.revisions > 0 ? (
                    <span className="w-full inline-block px-1.5 py-0.5 rounded-md bg-warning-subtle text-warning-fg font-semibold border border-warning-border">
                      {member.revisions} rev
                    </span>
                  ) : (
                    <span className="text-fg-subtle text-[10px]">—</span>
                  )}
                </div>

                {/* Col 4: Overdue Badge */}
                <div className="text-center font-mono text-[10.5px]">
                  {member.overdue > 0 ? (
                    <span className="w-full inline-block px-1.5 py-0.5 rounded-md bg-danger-subtle text-danger-fg font-semibold border border-danger-border">
                      {member.overdue} overdue
                    </span>
                  ) : (
                    <span className="text-fg-subtle text-[10px]">—</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
