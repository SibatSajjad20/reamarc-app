import React, { useEffect, useRef, useState } from 'react';
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
  disabled?: boolean;
}

function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

function commandOn(command: string): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

export const TaskDescriptionEditor: React.FC<TaskDescriptionEditorProps> = ({
  id,
  value,
  onChange,
  placeholder = 'Describe what you worked on...',
  error,
  describedBy,
  minRows = 3,
  disabled,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const [marks, setMarks] = useState({ bold: false, ul: false, ol: false });

  const syncMarks = () => {
    if (disabled) return;
    const root = editorRef.current;
    const sel = window.getSelection();
    if (!root || !sel || !sel.anchorNode || !root.contains(sel.anchorNode)) {
      setMarks({ bold: false, ul: false, ol: false });
      return;
    }
    setMarks({
      bold: commandOn('bold'),
      ul: commandOn('insertUnorderedList'),
      ol: commandOn('insertOrderedList'),
    });
  };

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

  useEffect(() => {
    const onSel = () => syncMarks();
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [disabled]);

  const emit = () => {
    const el = editorRef.current;
    if (!el) return;
    const next = sanitizeTaskHtml(el.innerHTML);
    lastEmitted.current = next;
    onChange(next);
    syncMarks();
  };

  const run = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    emit();
  };

  const minHeight = Math.max(2, minRows) * 1.5 + 1;

  const toolBtn = (active: boolean) =>
    cn(
      'h-7 w-7 inline-flex items-center justify-center rounded-sm cursor-pointer',
      active
        ? 'bg-accent-soft-2 text-accent-text'
        : 'text-fg-muted hover:bg-hover hover:text-fg'
    );

  return (
    <div
      className={cn(
        'rounded-md border bg-surface overflow-hidden focus-within:focus-ring',
        error ? 'border-danger-dot' : 'border-border-strong'
      )}
    >
      {!disabled && (
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-subtle/60">
          <button
            type="button"
            title="Bold"
            aria-label="Bold"
            aria-pressed={marks.bold}
            className={toolBtn(marks.bold)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run('bold')}
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            title="Bulleted list"
            aria-label="Bulleted list"
            aria-pressed={marks.ul}
            className={toolBtn(marks.ul)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run('insertUnorderedList')}
          >
            <List size={14} />
          </button>
          <button
            type="button"
            title="Numbered list"
            aria-label="Numbered list"
            aria-pressed={marks.ol}
            className={toolBtn(marks.ol)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run('insertOrderedList')}
          >
            <ListOrdered size={14} />
          </button>
        </div>
      )}
      <div
        id={id}
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        data-placeholder={placeholder}
        onInput={emit}
        onKeyUp={syncMarks}
        onMouseUp={syncMarks}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          emit();
        }}
        className={cn(
          TASK_DESC_HTML_CLASS,
          'w-full px-3 py-2 text-ui text-fg leading-relaxed outline-none overflow-auto resize-y',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-fg-faint empty:before:pointer-events-none',
          disabled && 'bg-subtle text-fg-muted cursor-not-allowed'
        )}
        style={{ minHeight: `${minHeight}rem` }}
      />
    </div>
  );
};
