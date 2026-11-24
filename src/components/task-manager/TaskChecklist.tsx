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
  onRename?: (item: TaskChecklistItem, text: string) => Promise<void> | void;
}

export const TaskChecklist: React.FC<Props> = ({ items, disabled, onAdd, onToggle, onRemove, onRename }) => {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  const commitEdit = (item: TaskChecklistItem) => {
    const text = editText.trim();
    setEditingId(null);
    if (!text || text === item.text || !onRename) return;
    void onRename(item, text);
  };

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    void onAdd(text);
    setDraft('');
  };

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
              disabled={disabled || removingId === item.id}
              aria-label={item.text}
              onCheckedChange={(c) => void onToggle(item, c === true)}
            />
            {editingId === item.id ? (
              <input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={() => commitEdit(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitEdit(item);
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditingId(null);
                    setEditText(item.text);
                  }
                }}
                className="flex-1 min-w-0 h-7 px-1.5 rounded-sm bg-surface border border-accent text-xs text-fg focus:outline-hidden"
                aria-label="Edit checklist item"
              />
            ) : (
              <button
                type="button"
                disabled={disabled || !onRename}
                onClick={() => {
                  if (disabled || !onRename) return;
                  setEditingId(item.id);
                  setEditText(item.text);
                }}
                className={`flex-1 min-w-0 text-left text-sm ${item.done ? 'line-through text-fg-muted' : 'text-fg'} ${
                  disabled || !onRename ? 'cursor-default' : 'cursor-text hover:text-accent-text'
                }`}
              >
                {item.text}
              </button>
            )}
            {!disabled && (
              <button
                type="button"
                className="ml-auto shrink-0 text-fg-muted hover:text-danger-fg opacity-70 group-hover:opacity-100 disabled:opacity-40"
                disabled={removingId === item.id}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (removingId) return;
                  setRemovingId(item.id);
                  if (editingId === item.id) setEditingId(null);
                  void Promise.resolve(onRemove(item)).finally(() => {
                    setRemovingId((cur) => (cur === item.id ? null : cur));
                  });
                }}
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
              submitDraft();
            }}
            placeholder="Add an item"
            className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-subtle border border-border text-xs text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="shrink-0"
            aria-label="Add checklist item"
            disabled={!draft.trim()}
            onClick={submitDraft}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
};
