import React from 'react';
import type { TaskActivity as Activity } from '@/types/task';

function relative(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export const TaskActivity: React.FC<{ items: Activity[] }> = ({ items }) => {
  if (!items.length) {
    return <p className="text-sm text-fg-muted py-6 text-center">No activity yet.</p>;
  }
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-fg">
              <span className="font-medium">{item.actor_name || 'System'}</span>{' '}
              <span className="text-fg-muted">{item.body || item.type}</span>
            </p>
            <p className="text-micro text-fg-muted mt-0.5">{relative(item.created_at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
};
