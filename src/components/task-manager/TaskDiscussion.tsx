import React, { useMemo, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useMemberAvatars } from '@/hooks/useMemberAvatars';
import { MentionInput } from './MentionInput';
import type { TaskAssignableUser, TaskComment } from '@/types/task';

function renderComment(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={i++} className="inline-flex items-center px-1.5 py-0 rounded-md bg-accent-soft text-accent-text text-xs font-medium">
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function mentionedIds(text: string): string[] {
  const ids: string[] = [];
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) ids.push(m[2]);
  return ids;
}

interface Props {
  comments: TaskComment[];
  users: TaskAssignableUser[];
  disabled?: boolean;
  canAddWatchers?: boolean;
  onSubmit: (text: string, opts: { question: boolean; add_watchers?: string[] }) => Promise<void> | void;
}

export const TaskDiscussion: React.FC<Props> = ({ comments, users, disabled, canAddWatchers, onSubmit }) => {
  const { getAvatarUrl } = useMemberAvatars();
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [question, setQuestion] = useState(false);
  const [busy, setBusy] = useState(false);
  const visible = comments.filter((c) => !c.deleted);

  const watcherCandidates = useMemo(() => {
    const ids = mentionedIds(text);
    return users.filter((u) => ids.includes(u.id) && u.will_add_watcher);
  }, [text, users]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {visible.length === 0 && <p className="text-sm text-fg-muted text-center py-6">No comments yet.</p>}
        {visible.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <Avatar name={c.user_name} src={getAvatarUrl(c.user_id, c.user_name) || undefined} size={28} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-fg">{c.user_name}</span>
                <span className="text-micro text-fg-muted">
                  {c.created_at ? new Date(c.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                </span>
              </div>
              <p className="text-sm text-fg mt-0.5 whitespace-pre-wrap">{renderComment(c.text)}</p>
            </div>
          </div>
        ))}
      </div>
      {!disabled && (
        <div className="pt-3 mt-3 border-t border-border space-y-2">
          <MentionInput value={text} onChange={setText} users={users} placeholder="Write a comment. Type @ to mention." />
          <div className="flex items-center justify-between gap-2">
            <Checkbox checked={question} onCheckedChange={(c) => setQuestion(c === true)} label="Question" />
            <Button
              type="button"
              size="sm"
              loading={busy}
              disabled={!text.trim()}
              onClick={async () => {
                if (!text.trim()) return;
                setBusy(true);
                try {
                  let add_watchers: string[] | undefined;
                  if (canAddWatchers && watcherCandidates.length) {
                    const names = watcherCandidates.map((u) => u.name).join(', ');
                    const ok = await confirm({
                      title: `Add @${names} as watcher?`,
                      description: 'They cannot see this task yet. Adding them as a watcher lets them receive this mention.',
                      confirmLabel: 'Add watcher',
                    });
                    if (ok) add_watchers = watcherCandidates.map((u) => u.id);
                  }
                  await onSubmit(text.trim(), { question, add_watchers });
                  setText('');
                  setQuestion(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Comment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
