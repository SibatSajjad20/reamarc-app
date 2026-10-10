import React from 'react';
import { Layers } from 'lucide-react';
import type { FunnelPhaseItem } from '../../../utils/contentCalendarOverview';

interface Props {
  funnel: FunnelPhaseItem[];
  totalItems: number;
  isLoading?: boolean;
}

export const DepartmentFunnelCard: React.FC<Props> = ({
  funnel,
  totalItems,
  isLoading = false,
}) => {
  return (
    <div className="w-full h-[235px] rounded-xl bg-surface border border-border p-3 sm:p-3.5 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-fg-muted" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">
            Pipeline Bottleneck Funnel
          </h3>
        </div>
        <span className="text-xs font-numeric text-fg-muted">
          {totalItems} total
        </span>
      </div>

      {/* Phase List */}
      <div className="mt-2 space-y-1.5 flex-1 overflow-y-auto pr-0.5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-7 w-full bg-skel rounded-md animate-pulse" />
              <div className="h-2.5 w-32 bg-skel rounded animate-pulse" />
            </div>
          ))
        ) : (
          funnel.map((phase) => {
            // Strict semantic styling based on phase
            let barColor = 'bg-border-strong';
            let badgeColor = 'text-fg-muted';

            if (phase.key === 'client_review') {
              barColor = 'bg-warning-solid';
              badgeColor = 'text-warning-fg';
            } else if (phase.key === 'revision') {
              barColor = 'bg-danger-solid';
              badgeColor = 'text-danger-fg';
            } else if (phase.key === 'ready_posted') {
              barColor = 'bg-success-fg';
              badgeColor = 'text-success-fg';
            }

            return (
              <div key={phase.key} className="space-y-0.5">
                {/* Text Row with Embedded Horizontal Background Fill */}
                <div className="relative rounded-md px-2.5 py-1.5 overflow-hidden bg-subtle">
                  <div
                    className={`absolute inset-y-0 left-0 ${barColor} opacity-20 transition-all duration-300`}
                    style={{ width: `${Math.min(phase.percentage, 100)}%` }}
                  />
                  <div className="relative z-10 flex items-center justify-between text-xs">
                    <span className="font-medium text-fg text-xs">
                      {phase.name}
                    </span>
                    <div className="flex items-center gap-1.5 font-numeric text-xs">
                      <span className={`font-semibold ${badgeColor}`}>{phase.count}</span>
                      <span className="text-fg-muted font-normal">
                        ({phase.percentage}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sub-stages breakdown */}
                <div className="flex flex-wrap items-center gap-x-2.5 px-1 text-[10px] text-fg-muted">
                  {phase.substages.map((sub) => (
                    <span key={sub.stage} className="inline-flex items-center gap-0.5 font-numeric">
                      <span>{sub.stage}:</span>
                      <span className="font-semibold text-fg">
                        {sub.count}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
