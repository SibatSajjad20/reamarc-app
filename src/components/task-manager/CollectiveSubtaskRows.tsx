import React from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import type { TaskAssignableUser } from '@/types/task';
import { MAX_COLLECTIVE_SUBTASKS, newCollectiveRow, type CollectiveSubtaskRow } from '@/utils/collectiveTask';

interface Props {
  rows: CollectiveSubtaskRow[];
  users: TaskAssignableUser[];
  disabled?: boolean;
  onChange: (rows: CollectiveSubtaskRow[]) => void;
}

/** Editable sub-task list (title + assignee) for a collective task. */
export const CollectiveSubtaskRows: React.FC<Props> = ({ rows, users, disabled, onChange }) => {
  const options = users.map((u) => ({
    value: u.id,
    label: u.name,
    description: [u.department, u.role].filter(Boolean).join(' · '),
  }));
  const patch = (key: string, next: Partial<CollectiveSubtaskRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...next } : r)));

  return (
    <div className="space-y-2" data-testid="collective-subtasks">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-muted">Sub-tasks</span>
        <span className="text-micro text-fg-muted">The main task closes only when every sub-task is done.</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.key} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start" data-testid="collective-subtask-row">
          <input
            aria-label={`Sub-task ${i + 1} name`}
            value={r.title}
            disabled={disabled}
            maxLength={200}
            placeholder={`Sub-task ${i + 1}`}
            onChange={(e) => patch(r.key, { title: e.target.value })}
            className="sm:col-span-6 w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
          />
          <div className="sm:col-span-5">
            <CustomSelect
              aria-label={`Sub-task ${i + 1} assignee`}
              searchable
              value={r.assignee_id}
              disabled={disabled}
              placeholder="Assign to…"
              onChange={(v) => patch(r.key, { assignee_id: v })}
              options={options}
            />
          </div>
          <button
            type="button"
            aria-label={`Remove sub-task ${i + 1}`}
            disabled={disabled}
            onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
            className="sm:col-span-1 h-9 w-9 inline-flex items-center justify-center rounded-md text-fg-muted hover:bg-subtle"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      {rows.length < MAX_COLLECTIVE_SUBTASKS && (
        <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => onChange([...rows, newCollectiveRow()])}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add sub-task
        </Button>
      )}
    </div>
  );
};
