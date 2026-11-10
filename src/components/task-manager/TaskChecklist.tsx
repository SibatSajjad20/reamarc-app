import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { Task, TaskChecklistItem } from '@/types/task';

interface Props {
  task?: Task | null;
  items: TaskChecklistItem[];
  disabled?: boolean;
  onAdd: (text: string) => Promise<void> | void;
  onToggle: (item: TaskChecklistItem, done: boolean) => Promise<void> | void;
  onRemove: (item: TaskChecklistItem) => Promise<void> | void;
}

export const TaskChecklist: React.FC<Props> = ({ items, disabled, onAdd, onToggle, onRemove }) => {
  const [draft, setDraft] = useState('');
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-fg-muted">Checklist</label>
        {items.length > 0 && (
          <span className="text-micro font-numeric text-fg-muted">
            {done}/{items.length}
          </span>
        )}
      </div>
      {items.length > 0 && <Progress value={pct} />}
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 group">
            <Checkbox
              checked={item.done}
              disabled={disabled}
              onCheckedChange={(c) => void onToggle(item, c === true)}
              label={<span className={item.done ? 'line-through text-fg-muted' : 'text-fg'}>{item.text}</span>}
            />
            {!disabled && (
              <button
                type="button"
                className="ml-auto opacity-0 group-hover:opacity-100 text-fg-muted hover:text-danger-fg"
                onClick={() => void onRemove(item)}
                aria-label="Remove checklist item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!disabled && (
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const text = draft.trim();
              if (!text) return;
              void onAdd(text);
              setDraft('');
            }}
            placeholder="Add an item"
            className="flex-1 h-8 px-2.5 rounded-md bg-subtle border border-border text-xs text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!draft.trim()}
            onClick={() => {
              const text = draft.trim();
              if (!text) return;
              void onAdd(text);
              setDraft('');
            }}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
};
