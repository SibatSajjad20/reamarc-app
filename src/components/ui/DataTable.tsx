import React from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Ellipsis,
  ChevronLeft,
  ChevronRight,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from './button';
import { EmptyState } from './EmptyState';
import { TableSkeletonRows } from './Skeletons';
import { CustomSelect } from './CustomSelect';

export { TableSkeletonRows };

/**
 * TableCard: Card container with overflow-hidden and border
 */
export const TableCard: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg shadow-xs overflow-hidden flex flex-col',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * TableToolbar: Toolbar inside the card on top of the table
 */
export const TableToolbar: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'px-4 py-3 border-b border-border flex items-center justify-between gap-2.5 flex-wrap bg-surface',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * BulkBar: Replaces toolbar contents while rows are selected
 */
export interface BulkBarProps {
  selectedCount: number;
  onClear: () => void;
  children?: React.ReactNode;
  className?: string;
}

export const BulkBar: React.FC<BulkBarProps> = ({
  selectedCount,
  onClear,
  children,
  className,
}) => {
  return (
    <div
      className={cn(
        'px-4 py-2.5 border-b border-border bg-accent-soft flex items-center justify-between gap-3 flex-wrap animate-in fade-in duration-100',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-ui font-medium text-accent-text tabular-nums">
          {selectedCount} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-ui text-fg-muted hover:text-fg inline-flex items-center gap-1 cursor-pointer"
        >
          <X size={14} />
          <span>Clear</span>
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {children}
      </div>
    </div>
  );
};

/**
 * Table: Native table element wrapper with horizontal overflow
 */
export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  compact?: boolean;
}

export const Table: React.FC<TableProps> = ({
  className,
  compact = false,
  children,
  ...props
}) => {
  return (
    <div className="w-full overflow-x-auto min-h-0">
      <table
        className={cn(
          'w-full text-left border-collapse text-table',
          compact && 'table-compact',
          className
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  );
};

/**
 * THead: Table header row container
 */
export const THead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <thead
      className={cn(
        'bg-canvas text-small font-medium text-fg-muted border-b border-border sticky top-0 z-[var(--z-sticky,10)] select-none',
        className
      )}
      {...props}
    >
      {children}
    </thead>
  );
};

/**
 * TH: Table header cell
 */
export interface THProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
  stickyLeft?: boolean;
}

export const TH: React.FC<THProps> = ({
  className,
  align = 'left',
  stickyLeft = false,
  children,
  ...props
}) => {
  return (
    <th
      className={cn(
        'h-9 px-3 text-small font-medium text-fg-muted whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        stickyLeft && 'sticky left-0 bg-canvas z-10 border-r border-border',
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
};

/**
 * SortHeader: Helper component inside TH for sortable columns
 */
export interface SortHeaderProps {
  label: React.ReactNode;
  direction?: 'asc' | 'desc' | false | null;
  onSort?: () => void;
  align?: 'left' | 'right';
  className?: string;
}

export const SortHeader: React.FC<SortHeaderProps> = ({
  label,
  direction,
  onSort,
  align = 'left',
  className,
}) => {
  const isSorted = direction === 'asc' || direction === 'desc';

  return (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        'group inline-flex items-center gap-1 font-medium text-small hover:text-fg transition-colors select-none cursor-pointer',
        align === 'right' && 'flex-row-reverse',
        isSorted ? 'text-fg' : 'text-fg-muted',
        className
      )}
      aria-sort={
        direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'
      }
    >
      <span>{label}</span>
      <span className="shrink-0 transition-colors">
        {direction === 'asc' ? (
          <ArrowUp size={14} className="text-fg" />
        ) : direction === 'desc' ? (
          <ArrowDown size={14} className="text-fg" />
        ) : (
          <ArrowUpDown
            size={14}
            className="text-fg-faint group-hover:text-fg-muted"
          />
        )}
      </span>
    </button>
  );
};

/**
 * TBody: Table body container
 */
export const TBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <tbody className={cn('divide-y divide-border', className)} {...props}>
      {children}
    </tbody>
  );
};

/**
 * TR: Table row
 */
export interface TRProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
  clickable?: boolean;
  compact?: boolean;
}

export const TR: React.FC<TRProps> = ({
  className,
  selected = false,
  clickable = false,
  compact = false,
  children,
  ...props
}) => {
  return (
    <tr
      className={cn(
        'transition-colors text-fg-2 border-b border-border last:border-b-0',
        compact ? 'h-10' : 'h-12',
        selected && 'bg-accent-soft text-fg',
        clickable && 'cursor-pointer hover:bg-hover',
        !selected && !clickable && 'hover:bg-hover/60',
        className
      )}
      {...props}
    >
      {children}
    </tr>
  );
};

/**
 * TD: Table cell
 */
export interface TDProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
  stickyLeft?: boolean;
  numeric?: boolean;
  mono?: boolean;
}

export const TD: React.FC<TDProps> = ({
  className,
  align = 'left',
  stickyLeft = false,
  numeric = false,
  mono = false,
  children,
  ...props
}) => {
  return (
    <td
      className={cn(
        'px-3 text-table',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        numeric && 'font-numeric tabular-nums text-right',
        mono && 'font-mono text-mono text-fg-muted',
        stickyLeft && 'sticky left-0 bg-surface z-10 border-r border-border',
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
};

/**
 * RowActions: 40px action column cell with ghost Ellipsis IconButton
 */
export interface RowActionsProps {
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  icon?: LucideIcon;
  label?: string;
}

export const RowActions: React.FC<RowActionsProps> = ({
  children,
  onClick,
  className,
  icon: Icon = Ellipsis,
  label = 'Row actions',
}) => {
  return (
    <td className={cn('px-2 py-0 w-10 text-right', className)}>
      {children ? (
        children
      ) : (
        <IconButton
          variant="ghost"
          size="sm"
          icon={Icon}
          label={label}
          onClick={onClick}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        />
      )}
    </td>
  );
};

/**
 * TableEmpty: Full-width empty state container for table
 */
export interface TableEmptyProps {
  colSpan: number;
  title?: React.ReactNode;
  description?: React.ReactNode;
  message?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  isFiltered?: boolean;
  onClearFilters?: () => void;
}

export const TableEmpty: React.FC<TableEmptyProps> = ({
  colSpan,
  title,
  description,
  message,
  icon,
  action,
  isFiltered,
  onClearFilters,
}) => {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 px-4 text-center">
        <EmptyState
          variant="compact"
          title={title}
          description={description || message}
          icon={icon}
          action={action}
          isFiltered={isFiltered}
          onClearFilters={onClearFilters}
        />
      </td>
    </tr>
  );
};

export const TableEmptyRow = TableEmpty;

/**
 * TableFooter: Pagination and item counts footer
 */
export interface TableFooterProps {
  totalItems?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  from?: number;
  to?: number;
  className?: string;
  children?: React.ReactNode;
}

export const TableFooter: React.FC<TableFooterProps> = ({
  totalItems,
  page = 1,
  pageSize = 25,
  totalPages,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  from,
  to,
  className,
  children,
}) => {
  const computedFrom = from ?? (totalItems ? (page - 1) * pageSize + 1 : 0);
  const computedTo = to ?? (totalItems ? Math.min(page * pageSize, totalItems) : 0);
  const total = totalPages ?? (totalItems ? Math.ceil(totalItems / pageSize) : 1);

  return (
    <div
      className={cn(
        'px-4 py-3 border-t border-border flex items-center justify-between gap-3 flex-wrap bg-surface text-small text-fg-muted select-none',
        className
      )}
    >
      {/* Left: Summary text */}
      <div className="font-numeric tabular-nums">
        {totalItems !== undefined ? (
          <span>
            Showing <strong className="font-medium text-fg">{computedFrom}</strong>–
            <strong className="font-medium text-fg">{computedTo}</strong> of{' '}
            <strong className="font-medium text-fg">{totalItems}</strong>
          </span>
        ) : (
          children
        )}
      </div>

      {/* Right: Pagination Controls */}
      <div className="flex items-center gap-2 ml-auto">
        {pageSizeOptions && onPageSizeChange && (
          <div className="flex items-center gap-1.5 mr-2">
            <CustomSelect
              value={String(pageSize)}
              onChange={(val) => onPageSizeChange(Number(val))}
              options={pageSizeOptions.map((opt) => ({
                value: String(opt),
                label: `${opt} per page`,
              }))}
              size="xs"
            />
          </div>
        )}

        {onPageChange && total > 1 && (
          <div className="flex items-center gap-1">
            <IconButton
              variant="ghost"
              size="sm"
              icon={ChevronLeft}
              label="Previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="h-7 w-7"
            />

            {/* Circular page buttons */}
            {Array.from({ length: Math.min(5, total) }).map((_, i) => {
              // Sliding window of 5 pages centered on current page
              let pageNum: number;
              if (total <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= total - 2) {
                pageNum = total - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }

              const isActive = pageNum === page;

              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => onPageChange(pageNum)}
                  className={cn(
                    'w-[30px] h-[30px] rounded-full text-ui font-numeric tabular-nums font-medium transition-colors cursor-pointer flex items-center justify-center',
                    isActive
                      ? 'bg-accent-soft-2 text-accent-text font-semibold'
                      : 'text-fg-muted hover:text-fg hover:bg-hover'
                  )}
                >
                  {pageNum}
                </button>
              );
            })}

            <IconButton
              variant="ghost"
              size="sm"
              icon={ChevronRight}
              label="Next page"
              disabled={page >= total}
              onClick={() => onPageChange(page + 1)}
              className="h-7 w-7"
            />
          </div>
        )}
      </div>
    </div>
  );
};
