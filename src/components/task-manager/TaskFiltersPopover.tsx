import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CustomDatePicker } from '@/components/ui/CustomDatePicker';
import { Checkbox } from '@/components/ui/checkbox';
import { TASK_PRIORITY_OPTIONS, TASK_STAGES, type TaskFilters, type TaskAssignableUser } from '@/types/task';

interface Props {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  assignees: TaskAssignableUser[];
  departments: string[];
  workspaces?: { id: string; name: string }[];
}

export const TaskFiltersPopover: React.FC<Props> = ({ filters, onChange, assignees, departments, workspaces = [] }) => {
  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });
  const activeCount = [
    filters.stage && filters.stage !== 'all',
    filters.priority && filters.priority !== 'all',
    filters.assignee_id,
    filters.assigner_id,
    filters.related_client,
    filters.department,
    filters.due_from,
    filters.due_to,
    filters.blocked,
    filters.has_attachments,
    filters.include_cancelled,
  ].filter(Boolean).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
          <span>Filter</span>
          {activeCount > 0 && (
            <span className="ml-1.5 text-micro font-numeric px-1.5 rounded-full bg-accent-soft text-accent-text">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <h4 className="text-xs font-semibold text-fg">Filters</h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                ...filters,
                stage: 'all',
                priority: 'all',
                assignee_id: undefined,
                assigner_id: undefined,
                related_client: undefined,
                department: undefined,
                due_from: undefined,
                due_to: undefined,
                blocked: undefined,
                has_attachments: undefined,
                include_cancelled: undefined,
              })
            }
          >
            Reset
          </Button>
        </div>
        <CustomSelect
          size="sm"
          value={filters.stage || 'all'}
          onChange={(v) => set({ stage: v as TaskFilters['stage'] })}
          options={[{ value: 'all', label: 'All stages' }, ...TASK_STAGES]}
        />
        <CustomSelect
          size="sm"
          value={filters.priority || 'all'}
          onChange={(v) => set({ priority: v as TaskFilters['priority'] })}
          options={[{ value: 'all', label: 'All priorities' }, ...TASK_PRIORITY_OPTIONS]}
        />
        <CustomSelect
          size="sm"
          searchable
          value={filters.assignee_id || ''}
          onChange={(v) => set({ assignee_id: v || undefined })}
          options={[{ value: '', label: 'Any assignee' }, ...assignees.map((u) => ({ value: u.id, label: u.name }))]}
        />
        <CustomSelect
          size="sm"
          searchable
          value={filters.assigner_id || ''}
          onChange={(v) => set({ assigner_id: v || undefined })}
          options={[{ value: '', label: 'Any assigner' }, ...assignees.map((u) => ({ value: u.id, label: u.name }))]}
        />
        <CustomSelect
          size="sm"
          searchable
          value={filters.related_client || ''}
          onChange={(v) => set({ related_client: v || undefined })}
          options={[{ value: '', label: 'Any related client' }, ...workspaces.map((w) => ({ value: w.id, label: w.name }))]}
        />
        <CustomSelect
          size="sm"
          value={filters.department || ''}
          onChange={(v) => set({ department: v || undefined })}
          options={[{ value: '', label: 'Any department' }, ...departments.map((d) => ({ value: d, label: d }))]}
        />
        <div className="grid grid-cols-2 gap-2">
          <CustomDatePicker value={filters.due_from || ''} onChange={(iso) => set({ due_from: iso || undefined })} clearable />
          <CustomDatePicker value={filters.due_to || ''} onChange={(iso) => set({ due_to: iso || undefined })} clearable />
        </div>
        <Checkbox
          checked={Boolean(filters.blocked)}
          onCheckedChange={(c) => set({ blocked: c === true ? true : undefined })}
          label="Blocked only"
        />
        <Checkbox
          checked={Boolean(filters.has_attachments)}
          onCheckedChange={(c) => set({ has_attachments: c === true ? true : undefined })}
          label="Has attachments"
        />
        <Checkbox
          checked={Boolean(filters.include_cancelled)}
          onCheckedChange={(c) => set({ include_cancelled: c === true ? true : undefined })}
          label="Show cancelled"
        />
      </PopoverContent>
    </Popover>
  );
};
