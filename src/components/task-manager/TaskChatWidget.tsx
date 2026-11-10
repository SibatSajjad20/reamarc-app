import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Search, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTaskCounts } from '@/hooks/useTaskCounts';
import { useTaskChat } from '@/hooks/useTaskChat';
import { useMemberAvatars } from '@/hooks/useMemberAvatars';
import type { TaskConversation } from '@/types/task';
import { cn } from '@/lib/utils';
import { TaskChatThread } from './TaskChatThread';

function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

interface Props {
  onSelectTasks?: () => void;
}

export const TaskChatWidget: React.FC<Props> = ({ onSelectTasks }) => {
  const { canSeeTasks } = useTaskCounts();
  const [open, setOpen] = useState(false);
  const chat = useTaskChat(canSeeTasks, open);
  const { getAvatarUrl } = useMemberAvatars();
  const mobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<TaskConversation | null>(null);
  const [bounce, setBounce] = useState(false);
  const prevUnread = useRef(0);

  useEffect(() => {
    if (chat.unreadTotal > prevUnread.current) {
      if (!reducedMotion()) {
        setBounce(true);
        const t = window.setTimeout(() => setBounce(false), 1000);
        prevUnread.current = chat.unreadTotal;
        return () => window.clearTimeout(t);
      }
    }
    prevUnread.current = chat.unreadTotal;
  }, [chat.unreadTotal]);

  if (!canSeeTasks) return null;

  const badge = chat.unreadTotal > 99 ? '99+' : chat.unreadTotal > 0 ? String(chat.unreadTotal) : '';
  const filtered = chat.conversations.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return c.title.toLowerCase().includes(q) || c.serial.toLowerCase().includes(q);
  });

  const openTask = (taskId: string) => {
    try {
      sessionStorage.setItem('reamarc_open_task_id', taskId);
      window.dispatchEvent(new Event('reamarc-open-task'));
    } catch {
      /* ignore */
    }
    onSelectTasks?.();
    setOpen(false);
  };

  const openThread = (conv: TaskConversation) => {
    setActive(conv);
    void chat.markRead(conv.task_id);
  };

  const panel = (
    <div className="flex flex-col h-full min-h-0" data-testid="task-chat-panel">
      {active ? (
        <TaskChatThread
          conversation={active}
          onBack={() => setActive(null)}
          onOpenTask={openTask}
          onSent={() => void chat.refresh()}
        />
      ) : (
        <>
          <div className="px-3 py-2.5 border-b border-border shrink-0">
            <p className="text-sm font-semibold text-fg mb-2">Task chat</p>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-8 pr-7 py-1.5 rounded-md bg-subtle border border-border text-xs text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {filtered.length === 0 ? (
              <EmptyState variant="compact" title="No conversations" description="Comments on tasks you are involved in will appear here." />
            ) : (
              <ul>
                {filtered.map((c) => (
                  <li key={c.task_id}>
                    <button
                      type="button"
                      data-testid={`task-chat-row-${c.task_id}`}
                      onClick={() => openThread(c)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-hover"
                    >
                      <Avatar
                        name={c.last_comment?.user_name || c.serial}
                        src={getAvatarUrl(undefined, c.last_comment?.user_name) || undefined}
                        size={32}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-numeric text-accent">{c.serial}</span>
                          <span className="text-sm font-medium text-fg truncate">{c.title}</span>
                          {c.unread_count > 0 && <span className="ml-auto w-2 h-2 rounded-full bg-accent shrink-0" />}
                        </div>
                        <p className="text-xs text-fg-muted truncate mt-0.5">{c.last_comment?.text_preview || 'No comments'}</p>
                        <p className="text-micro text-fg-muted mt-0.5">{relativeTime(c.last_comment?.created_at)}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="fixed bottom-6 right-6 z-40" data-testid="task-chat-widget">
      {open && !mobile && (
        <div className="absolute bottom-14 right-0 w-[380px] max-h-[70vh] h-[70vh] bg-surface border border-border rounded-xl shadow-lg overflow-hidden flex flex-col">
          {panel}
        </div>
      )}
      <button
        type="button"
        data-testid="task-chat-fab"
        aria-label="Task chat"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative h-12 w-12 rounded-full bg-accent text-accent-fg border border-accent shadow-md flex items-center justify-center hover:bg-accent-hover',
          bounce && 'motion-safe:animate-bounce',
        )}
      >
        <MessageSquare className="w-5 h-5" />
        {bounce && (
          <span className="absolute inset-0 rounded-full border-2 border-accent motion-safe:animate-pulse pointer-events-none" />
        )}
        {badge && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-soft text-accent-text text-[10px] font-medium border border-accent/20 flex items-center justify-center">
            {badge}
          </span>
        )}
      </button>
      {mobile && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Task chat</SheetTitle>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};
