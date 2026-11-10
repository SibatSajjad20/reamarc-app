import React, { useCallback, useEffect, useState } from 'react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CustomDatePicker } from '@/components/ui/CustomDatePicker';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { taskService } from '@/services/taskService';
import type { TaskActivity, TaskAssignableUser } from '@/types/task';

const TYPES = [
  { value: '', label: 'All types' },
  { value: 'created', label: 'Created' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'stage_changed', label: 'Stage changed' },
  { value: 'commented', label: 'Commented' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'deleted', label: 'Deleted' },
];

interface Props {
  onOpenTask: (taskId: string) => void;
  actors?: TaskAssignableUser[];
}

export const TaskCompanyActivity: React.FC<Props> = ({ onOpenTask, actors = [] }) => {
  const [items, setItems] = useState<TaskActivity[]>([]);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [actorId, setActorId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await taskService.getCompanyActivity({
        type: type || undefined,
        actor_id: actorId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        limit: 50,
      });
      setItems(res.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [type, actorId, dateFrom, dateTo, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4" data-testid="task-company-activity">
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <CustomSelect size="sm" value={type} onChange={(v) => { setType(v); setPage(1); }} options={TYPES} />
        <CustomSelect
          size="sm"
          searchable
          value={actorId}
          onChange={(v) => { setActorId(v); setPage(1); }}
          options={[{ value: '', label: 'Any actor' }, ...actors.map((u) => ({ value: u.id, label: u.name }))]}
        />
        <CustomDatePicker value={dateFrom} onChange={(iso) => { setDateFrom(iso || ''); setPage(1); }} clearable />
        <CustomDatePicker value={dateTo} onChange={(iso) => { setDateTo(iso || ''); setPage(1); }} clearable />
      </div>
      {loading ? (
        <p className="text-sm text-fg-muted text-center py-8">Loading activity…</p>
      ) : items.length === 0 ? (
        <EmptyState variant="compact" title="No activity" description="Nothing matches these filters." />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2.5 rounded-md border border-border bg-surface hover:bg-hover"
                onClick={() => item.task_id && onOpenTask(item.task_id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-micro font-medium px-1.5 py-0.5 rounded-full bg-subtle text-fg-muted">{item.type}</span>
                  {item.serial && <span className="text-xs font-numeric text-accent">{item.serial}</span>}
                  <span className="text-sm font-medium text-fg">{item.actor_name || 'System'}</span>
                  <span className="ml-auto text-micro text-fg-muted">
                    {item.created_at ? new Date(item.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                  </span>
                </div>
                {item.body && <p className="text-sm text-fg-muted mt-1">{item.body}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-end gap-2 mt-4">
        <Button type="button" size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          Previous
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={items.length < 50} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
};
