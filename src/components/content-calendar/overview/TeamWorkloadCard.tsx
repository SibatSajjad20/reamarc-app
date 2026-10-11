import React, { useMemo } from 'react';
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

  const activeMembers = useMemo(() => {
    return workload.filter((m) => m.totalActive > 0);
  }, [workload]);

  const maxActive = useMemo(() => {
    if (activeMembers.length === 0) return 1;
    return Math.max(1, ...activeMembers.map((m) => m.totalActive));
  }, [activeMembers]);

  // If loading, show skeleton grid
  if (isLoading) {
    return (
      <div className="w-full rounded-xl bg-surface border border-border shadow-xs p-4 flex flex-col">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <div className="w-4 h-4 bg-skel rounded" />
          <div className="h-4 w-28 bg-skel rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-3 rounded-lg bg-subtle/50 border border-border/40 space-y-2 animate-pulse">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-skel shrink-0" />
                <div className="h-3.5 w-20 bg-skel rounded" />
              </div>
              <div className="h-3 w-28 bg-skel rounded" />
              <div className="h-1.5 w-full bg-skel rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Render ONLY when active members exist; return null if no active members (no empty card)
  if (activeMembers.length === 0) {
    return null;
  }

  return (
    <div className="w-full rounded-xl bg-surface border border-border shadow-xs p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-accent" />
            <h3 className="text-ui font-semibold text-fg">
              Team Workload
            </h3>
          </div>
          <p className="text-caption text-fg-muted mt-0.5 font-numeric">
            {activeMembers.length} active {activeMembers.length === 1 ? 'contributor' : 'contributors'}
          </p>
        </div>
      </div>

      {/* 4-up Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3">
        {activeMembers.map((member) => {
          const loadPct = Math.min(100, Math.round((member.totalActive / maxActive) * 100));

          return (
            <div
              key={member.id}
              className="p-3 rounded-lg bg-subtle/40 border border-border/50 flex flex-col justify-between hover:bg-subtle transition space-y-2"
            >
              {/* Member Info */}
              <div className="flex items-center gap-2 min-w-0">
                <Avatar
                  name={member.name}
                  src={getAvatarUrl(member.id, member.name)}
                  size={24}
                  className="rounded-md shrink-0 text-[10px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-fg text-xs truncate">
                    {member.name}
                  </div>
                  <div className="text-caption text-fg-muted truncate">
                    {member.role || 'Contributor'}
                  </div>
                </div>
              </div>

              {/* Stats Line: active / overdue / revisions */}
              <div className="text-caption font-numeric flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-fg">
                  {member.totalActive} active
                </span>
                <span className="text-fg-faint">·</span>
                <span className={member.overdue > 0 ? 'text-danger-fg font-semibold' : 'text-fg-muted'}>
                  {member.overdue} overdue
                </span>
                <span className="text-fg-faint">·</span>
                <span className={member.revisions > 0 ? 'text-warning-fg font-semibold' : 'text-fg-muted'}>
                  {member.revisions} rev
                </span>
              </div>

              {/* Load Bar */}
              <div className="w-full h-1.5 rounded-full bg-subtle border border-border/40 overflow-hidden">
                <div
                  className="bg-accent h-full rounded-full transition-all duration-300"
                  style={{ width: `${loadPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
