import React, { useMemo, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import type { TaskAssignableUser } from '@/types/task';

interface Props {
  value: string;
  onChange: (next: string) => void;
  users: TaskAssignableUser[];
  disabled?: boolean;
  placeholder?: string;
}

export function serializeMention(user: TaskAssignableUser): string {
  return `@[${user.name}](${user.id})`;
}

export const MentionInput: React.FC<Props> = ({ value, onChange, users, disabled, placeholder }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return users.filter((u) => !q || u.name.toLowerCase().includes(q)).slice(0, 8);
  }, [users, query]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === '@') {
      setQuery('');
      setOpen(true);
    }
    if (e.key === 'Escape') setOpen(false);
  };

  const insert = (user: TaskAssignableUser) => {
    const el = ref.current;
    const token = serializeMention(user);
    if (!el) {
      onChange(`${value}${token} `);
      setOpen(false);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const before = value.slice(0, start);
    const at = before.lastIndexOf('@');
    const head = at >= 0 ? before.slice(0, at) : before;
    const next = `${head}${token} ${value.slice(start)}`;
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <textarea
          ref={ref}
          value={value}
          disabled={disabled}
          placeholder={placeholder || 'Write a comment. Type @ to mention.'}
          onChange={(e) => {
            onChange(e.target.value);
            const before = e.target.value.slice(0, e.target.selectionStart || e.target.value.length);
            const m = before.match(/@([^\s[@]*)$/);
            if (m) {
              setQuery(m[1] || '');
              setOpen(true);
            } else if (open) {
              setOpen(false);
            }
          }}
          onKeyDown={onKey}
          rows={3}
          className="w-full px-3 py-2 rounded-md bg-subtle border border-border text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden resize-y min-h-[72px]"
        />
      </PopoverAnchor>
      <PopoverContent className="w-64 p-1" align="start">
        <div data-testid="mention-results" className="max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-fg-muted">No matches</p>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-fg hover:bg-hover text-left"
                onClick={() => insert(u)}
              >
                <span>{u.name}</span>
                {u.will_add_watcher ? (
                  <span className="ml-auto text-micro text-fg-muted">(will be added as watcher)</span>
                ) : u.department ? (
                  <span className="ml-auto text-micro text-fg-muted">{u.department}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
