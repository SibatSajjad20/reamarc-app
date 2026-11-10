import React from 'react';
import { AlertCircle, CheckCircle2, Clock, Layers } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { TableCard, Table, THead, TH, TBody, TR, TD } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import type { TaskOverview } from '@/types/task';

interface Props {
  overview?: TaskOverview | null;
  onSelectPerson?: (id: string) => void;
}

export const TaskOverviewTab: React.FC<Props> = ({ overview, onSelectPerson }) => {
  const counts = overview?.counts;
  const people = overview?.people || [];
  const departments = overview?.departments || [];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4" data-testid="task-overview-tab">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Open" value={counts?.open ?? 0} icon={Layers} />
        <KpiCard label="Overdue" value={counts?.overdue ?? 0} icon={AlertCircle} deltaType="danger" />
        <KpiCard label="In review" value={counts?.in_review ?? 0} icon={Clock} />
        <KpiCard label="Completed" value={counts?.completed ?? 0} icon={CheckCircle2} deltaType="success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TableCard>
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-fg">Workload by person</h3>
          </div>
          {people.length === 0 ? (
            <EmptyState variant="compact" title="No open tasks" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Person</TH>
                  <TH>Department</TH>
                  <TH>Open</TH>
                  <TH>Overdue</TH>
                  <TH>Review</TH>
                  <TH>Blocked</TH>
                </tr>
              </THead>
              <TBody>
                {people.map((row) => (
                  <TR key={row.id} className="cursor-pointer" onClick={() => onSelectPerson?.(row.id)}>
                    <TD>{row.name}</TD>
                    <TD className="text-fg-muted">{row.department || '—'}</TD>
                    <TD className="font-numeric">{row.open}</TD>
                    <TD className="font-numeric text-danger-fg">{row.overdue}</TD>
                    <TD className="font-numeric">{row.in_review}</TD>
                    <TD className="font-numeric">{row.blocked}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </TableCard>

        <TableCard>
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-fg">Workload by department</h3>
          </div>
          {departments.length === 0 ? (
            <EmptyState variant="compact" title="No department load" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Department</TH>
                  <TH>Open</TH>
                  <TH>Overdue</TH>
                  <TH>Blocked</TH>
                </tr>
              </THead>
              <TBody>
                {departments.map((row) => (
                  <TR key={row.department}>
                    <TD>{row.department}</TD>
                    <TD className="font-numeric">{row.open}</TD>
                    <TD className="font-numeric text-danger-fg">{row.overdue}</TD>
                    <TD className="font-numeric">{row.blocked}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </TableCard>
      </div>
    </div>
  );
};
