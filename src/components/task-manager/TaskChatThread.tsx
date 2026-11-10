import React, { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useMemberAvatars } from '@/hooks/useMemberAvatars';
import { taskService } from '@/services/taskService';
import type { TaskAssignableUser, TaskComment, TaskConversation } from '@/types/task';
import { MentionInput } from './MentionInput';

const PAGE = 30;

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

function mentionedWatcherIds(text: string, users: TaskAssignableUser[]): string[] {
  const ids: string[] = [];
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) ids.push(m[2]);
  return users.filter((u) => ids.includes(u.id) && u.will_add_watcher).map((u) => u.id);
}

interface Props {
  conversation: TaskConversation;
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
  onSent?: () => void;
}

export const TaskChatThread: React.FC<Props> = ({ conversation, onBack, onOpenTask, onSent }) => {
  const { getAvatarUrl } = useMemberAvatars();
  const confirm = useConfirm();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [page, setPage] = useState(1);
  const [hasOlder, setHasOlder] = useState(false);
  const [text, setText] = useState('');
  const [question, setQuestion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mentionable, setMentionable] = useState<TaskAssignableUser[]>([]);

  const loadLatest = async () => {
    const first = await taskService.getComments(conversation.task_id, 1, PAGE);
    const total = first.total || (first.items || []).length;
    const lastPage = Math.max(1, Math.ceil(total / PAGE) || 1);
    const res = lastPage === 1 ? first : await taskService.getComments(conversation.task_id, lastPage, PAGE);
    setComments(res.items || []);
    setPage(lastPage);
    setHasOlder(lastPage > 1);
  };

  useEffect(() => {
    void loadLatest().catch(() => setComments([]));
    void taskService.getMentionable(conversation.task_id).then((r) => setMentionable(r.items || [])).catch(() => setMentionable([]));
    void taskService.markRead(conversation.task_id).catch(() => undefined);
    const onActivity = (event: Event) => {
      const detail = (event as CustomEvent<{ task_id?: string; kind?: string }>).detail || {};
      const kind = detail.kind || '';
      if (detail.task_id === conversation.task_id || (!detail.task_id && kind.startsWith('task_'))) {
        void loadLatest().catch(() => undefined);
      }
    };
    window.addEventListener('reamarc-task-activity', onActivity);
    return () => window.removeEventListener('reamarc-task-activity', onActivity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.task_id]);

  const loadOlder = async () => {
    if (page <= 1) return;
    const prev = page - 1;
    const res = await taskService.getComments(conversation.task_id, prev, PAGE);
    setComments((cur) => [...(res.items || []), ...cur]);
    setPage(prev);
    setHasOlder(prev > 1);
  };

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="task-chat-thread">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <button type="button" onClick={onBack} className="p-1 rounded-md text-fg-muted hover:bg-hover" aria-label="Back">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg truncate">{conversation.serial} · {conversation.title}</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => onOpenTask(conversation.task_id)}>
          Open task
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
        {hasOlder && (
          <div className="text-center">
            <Button type="button" size="sm" variant="ghost" onClick={() => void loadOlder()}>
              Load older
            </Button>
          </div>
        )}
        {comments.filter((c) => !c.deleted).map((c) => (
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
      <div className="px-3 py-2.5 border-t border-border space-y-2 shrink-0">
        <MentionInput value={text} onChange={setText} users={mentionable} placeholder="Reply. Type @ to mention." />
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
                const watchers = mentionedWatcherIds(text, mentionable);
                let add_watchers: string[] | undefined;
                if (watchers.length) {
                  const ok = await confirm({
                    title: 'Add mentioned people as watchers?',
                    confirmLabel: 'Add watchers',
                  });
                  if (ok) add_watchers = watchers;
                }
                await taskService.addComment(conversation.task_id, text.trim(), { question, add_watchers });
                setText('');
                setQuestion(false);
                await loadLatest();
                onSent?.();
              } finally {
                setBusy(false);
              }
            }}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
};
