import React, { useEffect, useRef } from 'react';
import { Bold, List, ListOrdered } from 'lucide-react';
import { cn } from '../../lib/utils';
import { sanitizeTaskHtml, TASK_DESC_HTML_CLASS } from '../../utils/taskDescriptionHtml';

export interface TaskDescriptionEditorProps {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  error?: boolean;
  describedBy?: string;
  minRows?: number;
}

function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

export const TaskDescriptionEditor: React.FC<TaskDescriptionEditorProps> = ({
  id,
  value,
  onChange,
  placeholder = 'Describe what you worked on...',
  error,
  describedBy,
  minRows = 3,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value === lastEmitted.current && el.innerHTML === value) return;
    lastEmitted.current = value;
    if (looksLikeHtml(value)) {
      el.innerHTML = sanitizeTaskHtml(value);
    } else {
      el.textContent = value || '';
    }
  }, [value]);

  const emit = () => {
    const el = editorRef.current;
    if (!el) return;
    const next = sanitizeTaskHtml(el.innerHTML);
    lastEmitted.current = next;
    onChange(next);
  };

  const run = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    emit();
  };

  const minHeight = Math.max(2, minRows) * 1.5 + 1;

  return (
    <div
      className={cn(
        'rounded-md border bg-surface overflow-hidden focus-within:focus-ring',
        error ? 'border-danger-dot' : 'border-border-strong'
      )}
    >
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-subtle/60">
        <button
          type="button"
          title="Bold"
          aria-label="Bold"
          className="h-7 w-7 inline-flex items-center justify-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg cursor-pointer"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run('bold')}
        >
          <Bold size={14} />
        </button>
        <button
          type="button"
          title="Bulleted list"
          aria-label="Bulleted list"
          className="h-7 w-7 inline-flex items-center justify-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg cursor-pointer"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run('insertUnorderedList')}
        >
          <List size={14} />
        </button>
        <button
          type="button"
          title="Numbered list"
          aria-label="Numbered list"
          className="h-7 w-7 inline-flex items-center justify-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg cursor-pointer"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run('insertOrderedList')}
        >
          <ListOrdered size={14} />
        </button>
      </div>
      <div
        id={id}
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
        contentEditable
        data-placeholder={placeholder}
        onInput={emit}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          emit();
        }}
        className={cn(
          TASK_DESC_HTML_CLASS,
          'w-full px-3 py-2 text-ui text-fg leading-relaxed outline-none overflow-auto resize-y',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-fg-faint empty:before:pointer-events-none'
        )}
        style={{ minHeight: `${minHeight}rem` }}
      />
    </div>
  );
};
