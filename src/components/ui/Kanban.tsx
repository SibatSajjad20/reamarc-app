import React from 'react';
import { cn } from '../../lib/utils';

/**
 * KanbanBoard: Horizontal scrolling flex container
 */
export const KanbanBoard: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex gap-3 overflow-x-auto pb-4 items-start select-none min-h-[500px]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * KanbanStatsStrip: Header facts row separated by middle dots
 * e.g. "31 open leads · 22% win rate · 3 uncontacted · 1 follow-up overdue"
 */
export interface KanbanStatsStripProps {
  items: React.ReactNode[];
  className?: string;
}

export const KanbanStatsStrip: React.FC<KanbanStatsStripProps> = ({
  items,
  className,
}) => {
  const filtered = items.filter(Boolean);
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-ui text-fg-muted mb-4 flex-wrap',
        className
      )}
    >
      {filtered.map((item, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span className="text-fg-faint select-none">·</span>}
          <span>{item}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

/**
 * KanbanColumn: Single column container (width configurable: 186/200/210px)
 */
export interface KanbanColumnProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: 'leads' | 'deals' | 'content' | 'closed' | string;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  width = 'content',
  className,
  children,
  ...props
}) => {
  const widthClass = {
    leads: 'w-[186px]',
    deals: 'w-[210px]',
    content: 'w-[200px]',
    closed: 'w-[150px]',
  }[width] || (typeof width === 'string' && width.startsWith('w-') ? width : 'w-[200px]');

  return (
    <div
      className={cn(
        'shrink-0 flex flex-col gap-2',
        widthClass,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * KanbanColumnHeader: 28px header with label, count, and optional total value
 */
export interface KanbanColumnHeaderProps {
  label: React.ReactNode;
  count?: number | string;
  totalValue?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const KanbanColumnHeader: React.FC<KanbanColumnHeaderProps> = ({
  label,
  count,
  totalValue,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        'h-7 px-1 flex items-center justify-between gap-1.5 text-ui select-none',
        className
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-medium text-fg truncate">{label}</span>
        {count !== undefined && (
          <span className="text-micro font-numeric tabular-nums text-fg-muted bg-subtle px-1.5 py-0.2 rounded-full">
            {count}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {totalValue && (
          <span className="text-small font-numeric tabular-nums text-fg-muted font-normal">
            {totalValue}
          </span>
        )}
        {action}
      </div>
    </div>
  );
};

/**
 * KanbanColumnBody: droppable container
 */
export interface KanbanColumnBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  isDropTarget?: boolean;
}

export const KanbanColumnBody: React.FC<KanbanColumnBodyProps> = ({
  isDropTarget = false,
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'bg-subtle rounded-lg p-2 flex flex-col gap-2 min-h-[450px] transition-colors',
        isDropTarget && 'bg-accent-soft outline-1 outline-dashed outline-accent-200',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * KanbanCard: Draggable card item
 */
export interface KanbanCardProps extends React.HTMLAttributes<HTMLDivElement> {
  isDragging?: boolean;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  isDragging = false,
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg p-3 shadow-xs cursor-grab active:cursor-grabbing transition-all select-none',
        isDragging && 'opacity-90 shadow-md rotate-0 cursor-grabbing',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * KanbanEmptyColumn: Placeholder for empty column
 */
export const KanbanEmptyColumn: React.FC<{ label?: string; className?: string }> = ({
  label = 'No items',
  className,
}) => {
  return (
    <div
      className={cn(
        'h-[72px] border border-dashed border-border-strong rounded-lg flex items-center justify-center text-small text-fg-muted select-none',
        className
      )}
    >
      {label}
    </div>
  );
};
