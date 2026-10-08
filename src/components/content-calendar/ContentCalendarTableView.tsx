import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  useVirtualizer,
  observeElementOffset,
  observeElementRect,
  elementScroll,
} from '@tanstack/react-virtual';
import { safeHttpUrl } from '../../utils/safeHttpUrl';
import {
  Calendar,
  AlertTriangle,
  ExternalLink,
  Filter,
  X,
  Check,
  RefreshCw,
  AlertCircle,
  Edit3,
  Maximize2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Paperclip,
} from 'lucide-react';
import type {
  ContentCalendarItem,
  ContentCalendarConstants,
  BatchUpdateItem,
} from '../../types/contentCalendar';
import { PIPELINE_STAGES } from '../../types/contentCalendar';
import { contentCalendarService } from '../../services/contentCalendarService';
import { useToast } from '../../context/ToastContext';
import { CustomSelect } from '../ui/CustomSelect';
import { StatusPill } from '../ui/StatusPill';
import { Button } from '../ui/button';
import { getStatusMapping } from '../../lib/statusMap';
import { FacebookIcon, InstagramIcon, TikTokIcon, LinkedInIcon, MetaIcon } from '../ui/brand-icons';
import { getAssetCounts, getApprovalStatusesForStage } from '../../utils/contentCalendarWorkflow';

export const renderPlatformIcon = (item: ContentCalendarItem) => {
  const combined = `${item.channels?.join(' ') || ''} ${item.campaign_type || ''} ${item.captions_hashtags || ''}`.toLowerCase();
  if (combined.includes('instagram') || combined.includes('ig') || combined.includes('#instagram')) {
    return <InstagramIcon size={14} className="text-fg-muted shrink-0 mr-1 inline-block" />;
  }
  if (combined.includes('facebook') || combined.includes('fb') || combined.includes('#facebook')) {
    return <FacebookIcon size={14} className="text-fg-muted shrink-0 mr-1 inline-block" />;
  }
  if (combined.includes('tiktok') || combined.includes('#tiktok')) {
    return <TikTokIcon size={14} className="text-fg-muted shrink-0 mr-1 inline-block" />;
  }
  if (combined.includes('linkedin') || combined.includes('#linkedin')) {
    return <LinkedInIcon size={14} className="text-fg-muted shrink-0 mr-1 inline-block" />;
  }
  if (combined.includes('meta')) {
    return <MetaIcon size={14} className="text-fg-muted shrink-0 mr-1 inline-block" />;
  }
  return null;
};

export interface ColumnDef {
  key: keyof ContentCalendarItem | string;
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  group?: string;
}

export const DEFAULT_CONTENT_COLUMNS: ColumnDef[] = [
  { key: 'serial', label: 'Serial', width: 90, align: 'center', group: 'DEFINITION' },
  { key: 'client_name', label: 'Client', width: 140, align: 'left', group: 'DEFINITION' },
  { key: 'campaign_type', label: 'Campaign Type', width: 220, align: 'left', group: 'DEFINITION' },
  { key: 'creative_type', label: 'Creative Type', width: 110, align: 'center', group: 'DEFINITION' },
  { key: 'content_type', label: 'Content Type', width: 120, align: 'center', group: 'DEFINITION' },
  { key: 'creative_category', label: 'Category', width: 140, align: 'center', group: 'DEFINITION' },
  { key: 'content_pillar', label: 'Content Pillar', width: 160, align: 'left', group: 'DEFINITION' },
  { key: 'content_concept', label: 'Content Concept', width: 260, align: 'left', group: 'DEFINITION' },
  { key: 'offer', label: 'Offer', width: 140, align: 'left', group: 'DEFINITION' },
  { key: 'stage', label: 'Pipeline Stage', width: 150, align: 'center', group: 'PRODUCTION' },
  { key: 'primary_text', label: 'Primary Text (Ad Copy)', width: 280, align: 'left', group: 'PRODUCTION' },
  { key: 'headlines_hooks', label: 'Headlines / Hooks', width: 240, align: 'left', group: 'PRODUCTION' },
  { key: 'content_on_creative', label: 'Content On Creative', width: 240, align: 'left', group: 'PRODUCTION' },
  { key: 'cta', label: 'CTA', width: 180, align: 'left', group: 'PRODUCTION' },
  { key: 'design_owner', label: 'Owner', width: 120, align: 'left', group: 'PRODUCTION' },
  { key: 'design_due', label: 'Design Due', width: 100, align: 'center', group: 'PRODUCTION' },
  { key: 'publish_date', label: 'Publish Date', width: 110, align: 'center', group: 'PRODUCTION' },
  { key: 'attachments', label: 'Assets', width: 150, align: 'center', group: 'ASSETS' },
  { key: 'draft_preview_link', label: 'Draft Link', width: 100, align: 'center', group: 'ASSETS' },
  { key: 'final_asset_link', label: 'Final Link', width: 100, align: 'center', group: 'ASSETS' },
  { key: 'approval_status', label: 'Approval Status', width: 150, align: 'center', group: 'APPROVAL' },
  { key: 'setup_status', label: 'Setup Status', width: 110, align: 'center', group: 'SETUP' },
];

export const NO_FILTER_COLUMNS = new Set([
  'attachments',
  'content_on_creative',
  'headlines_hooks',
  'primary_text',
  'content_concept',
]);

const DEFAULT_ROW_HEIGHT = 36;

interface Props {
  items: ContentCalendarItem[];
  isLoading: boolean;
  error?: string | null;
  onSelectItem: (item: ContentCalendarItem) => void;
  zoomLevel: number;
  defaultRowHeight: number;
  rowHeightsResetKey?: number;
  onUpdateItemLocal?: (id: string, changes: Partial<ContentCalendarItem>) => void;
  onFilteredItemsChange?: (filtered: ContentCalendarItem[]) => void;
  constants?: ContentCalendarConstants | null;
  activeClients?: { id: string; name: string }[];
}

export const ContentCalendarTableView: React.FC<Props> = ({
  items,
  isLoading,
  error,
  onSelectItem,
  zoomLevel,
  defaultRowHeight,
  rowHeightsResetKey,
  onUpdateItemLocal,
  onFilteredItemsChange,
  constants,
  activeClients = [],
}) => {
  const { addToast } = useToast();

  // Column Widths State with localStorage Persistence
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_cc_col_widths');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    const initial: Record<string, number> = {};
    DEFAULT_CONTENT_COLUMNS.forEach((col) => {
      initial[col.key] = col.width;
    });
    return initial;
  });

  // Row Heights State with localStorage Persistence
  const [rowHeights, setRowHeights] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_cc_row_heights');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  // Per-Column Filter State
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [openFilterColKey, setOpenFilterColKey] = useState<string | null>(null);

  // Design owner options combining constants and any custom item values
  const designOwnerOptions = useMemo(() => {
    return ['Content', 'Creative', 'Social Media'];
  }, []);

  const clientSelectOptions = useMemo(() => {
    const list = [...activeClients.map((c) => c.name)];
    if (!list.includes('Apex Transfers LLC')) {
      list.push('Apex Transfers LLC');
    }
    return list.map((name) => ({ value: name, label: name }));
  }, [activeClients]);

  const creativeTypeSelectOptions = useMemo(() => {
    const list = constants?.creative_types || ['Video', 'Reel', 'Carousel', 'Static', 'Story', 'UGC', 'Testimonial'];
    return list.map((t) => ({ value: t, label: t }));
  }, [constants?.creative_types]);

  const contentTypeSelectOptions = useMemo(() => [
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Runtime', label: 'Runtime' },
  ], []);

  const creativeCategorySelectOptions = useMemo(() => [
    { value: 'Organic Creative', label: 'Organic Creative' },
    { value: 'Ad Creative', label: 'Ad Creative' },
  ], []);

  const stageSelectOptions = useMemo(() => {
    return PIPELINE_STAGES.map((st) => ({ value: st, label: st }));
  }, []);

  const setupStatusSelectOptions = useMemo(() => {
    const list = constants?.setup_statuses || [];
    return list.map((ss) => ({ value: ss, label: ss }));
  }, [constants?.setup_statuses]);

  const designOwnerSelectOptions = useMemo(() => {
    return designOwnerOptions.map((opt) => ({ value: opt, label: opt }));
  }, [designOwnerOptions]);

  const ensureOption = useCallback((options: { value: string; label: string }[], currentValue?: string) => {
    if (currentValue && !options.some((o) => o.value === currentValue)) {
      return [...options, { value: currentValue, label: currentValue }];
    }
    return options;
  }, []);

  // Close filter popover on document click
  useEffect(() => {
    if (!openFilterColKey) return;
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest(`[data-filter-popover="${openFilterColKey}"]`) &&
        !target.closest(`[data-filter-btn="${openFilterColKey}"]`)
      ) {
        setOpenFilterColKey(null);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [openFilterColKey]);

  // Unique values for column filter
  const getUniqueValuesForColumn = (colKey: string) => {
    const set = new Set<string>();
    items.forEach((item) => {
      const val = (item as any)[colKey];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        set.add(String(val).trim());
      }
    });
    return Array.from(set).sort();
  };

  // Sorting State - default sort by Serial ascending
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  }>({ key: 'serial', direction: 'asc' });

  const handleSort = (colKey: string) => {
    setSortConfig((prev) => {
      if (prev.key === colKey) {
        if (prev.direction === 'asc') return { key: colKey, direction: 'desc' };
        return { key: 'serial', direction: 'asc' };
      }
      return { key: colKey, direction: 'asc' };
    });
  };

  const naturalCompare = (a: any, b: any) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  };

  // Filter and sort items based on active column filters and sortConfig
  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      for (const [colKey, filterVal] of Object.entries(columnFilters)) {
        if (!filterVal || filterVal === '__ALL__') continue;
        const raw = (item as any)[colKey];
        const strVal = raw !== undefined && raw !== null ? String(raw).toLowerCase() : '';
        if (!strVal.includes(filterVal.toLowerCase())) {
          return false;
        }
      }
      return true;
    });

    return [...filtered].sort((itemA, itemB) => {
      const key = sortConfig.key;
      const valA = (itemA as any)[key];
      const valB = (itemB as any)[key];

      const res = naturalCompare(valA, valB);
      if (res !== 0) {
        return sortConfig.direction === 'asc' ? res : -res;
      }
      // Tie-breaker: natural serial ascending
      return naturalCompare(itemA.serial, itemB.serial);
    });
  }, [items, columnFilters, sortConfig]);

  // Synchronize filtered items with parent for export
  useEffect(() => {
    onFilteredItemsChange?.(filteredItems);
  }, [filteredItems, onFilteredItemsChange]);

  // Inline Cell Editing & Debounced Persistence State
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [cellEditValue, setCellEditValue] = useState<string>('');
  const [longTextModal, setLongTextModal] = useState<{
    rowId: string;
    colKey: string;
    title: string;
    value: string;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const pendingUpdatesRef = useRef<Map<string, Partial<ContentCalendarItem>>>(new Map());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flush debounced updates to backend
  const flushBatchUpdates = useCallback(async () => {
    if (pendingUpdatesRef.current.size === 0) return;
    const updates: BatchUpdateItem[] = [];
    pendingUpdatesRef.current.forEach((changes, id) => {
      updates.push({ id, changes });
    });
    pendingUpdatesRef.current.clear();

    try {
      await contentCalendarService.batchUpdate(updates);
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus((curr) => (curr === 'saved' ? 'idle' : curr));
      }, 2500);
    } catch (err: any) {
      setSaveStatus('error');
      addToast('Auto-save failed', err?.message || 'Could not save field changes', 'error');
    }
  }, [addToast]);

  const commitCellEdit = useCallback(
    (rowId: string, colKey: string, newValue: any) => {
      setEditingCell(null);
      const item = items.find((it) => it.id === rowId);
      if (!item) return;

      const oldVal = (item as any)[colKey] ?? '';
      const cleanNew = newValue ?? '';
      if (String(oldVal) === String(cleanNew)) return;

      // Optimistic local update
      if (onUpdateItemLocal) {
        onUpdateItemLocal(rowId, { [colKey]: cleanNew });
      }

      // Add to pending batch
      const existing = pendingUpdatesRef.current.get(rowId) || {};
      pendingUpdatesRef.current.set(rowId, { ...existing, [colKey]: cleanNew });
      setSaveStatus('saving');

      // If client changed, auto-reassign serial to the new client's sequence
      if (colKey === 'client_name') {
        contentCalendarService
          .getNextSerial(String(cleanNew))
          .then((res) => {
            if (res?.serial) {
              if (onUpdateItemLocal) {
                onUpdateItemLocal(rowId, { client_name: cleanNew, serial: res.serial });
              }
              const curr = pendingUpdatesRef.current.get(rowId) || {};
              pendingUpdatesRef.current.set(rowId, { ...curr, client_name: cleanNew, serial: res.serial });
            }
          })
          .catch(() => {});
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        flushBatchUpdates();
      }, 600);
    },
    [items, onUpdateItemLocal, flushBatchUpdates]
  );

  // Cleanup pending batch on unmount or window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingUpdatesRef.current.size > 0) {
        flushBatchUpdates();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (pendingUpdatesRef.current.size > 0) {
        flushBatchUpdates();
      }
    };
  }, [flushBatchUpdates]);

  // DOM Refs for Resizing & Virtualization
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableInnerRef = useRef<HTMLDivElement>(null);
  const resizeGuideRef = useRef<HTMLDivElement>(null);
  const resizeTooltipRef = useRef<HTMLDivElement>(null);
  const currentResizingWidthRef = useRef<number>(100);
  const rowResizeGuideRef = useRef<HTMLDivElement>(null);

  const rowResizeTooltipRef = useRef<HTMLDivElement>(null);
  const currentResizingHeightRef = useRef<number>(DEFAULT_ROW_HEIGHT);

  // Column Resizing Handler
  const handleColumnResizeStart = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || 100;
    currentResizingWidthRef.current = startWidth;

    const handleElement = e.currentTarget as HTMLElement;
    const innerRect = tableInnerRef.current?.getBoundingClientRect();
    const initialHandleLeft = innerRect
      ? (handleElement.getBoundingClientRect().right - innerRect.left) * (100 / zoomLevel)
      : 0;

    if (resizeGuideRef.current) {
      resizeGuideRef.current.style.display = 'block';
      resizeGuideRef.current.style.transform = `translateX(${initialHandleLeft}px)`;
      if (resizeTooltipRef.current) {
        resizeTooltipRef.current.textContent = `${startWidth}px`;
      }
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = (moveEvent.clientX - startX) * (100 / zoomLevel);
      const newWidth = Math.max(50, Math.min(600, startWidth + delta));
      const roundedWidth = Math.round(newWidth);
      currentResizingWidthRef.current = roundedWidth;

      if (resizeGuideRef.current) {
        const currentLeft = initialHandleLeft + (roundedWidth - startWidth);
        resizeGuideRef.current.style.transform = `translateX(${currentLeft}px)`;
        if (resizeTooltipRef.current) {
          resizeTooltipRef.current.textContent = `${roundedWidth}px`;
        }
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (resizeGuideRef.current) {
        resizeGuideRef.current.style.display = 'none';
      }

      const finalWidth = currentResizingWidthRef.current;
      setColumnWidths((prev) => {
        const next = { ...prev, [colKey]: finalWidth };
        try {
          localStorage.setItem('reamarc_cc_col_widths', JSON.stringify(next));
        } catch (err) {}
        return next;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Row Resizing Handler
  const handleRowResizeStart = (e: React.MouseEvent, rowId: string, currentH: number) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    currentResizingHeightRef.current = currentH;

    const handleElement = e.currentTarget as HTMLElement;
    const innerRect = tableInnerRef.current?.getBoundingClientRect();
    const initialHandleTop = innerRect
      ? (handleElement.getBoundingClientRect().bottom - innerRect.top) * (100 / zoomLevel)
      : 0;

    if (rowResizeGuideRef.current) {
      rowResizeGuideRef.current.style.display = 'block';
      rowResizeGuideRef.current.style.transform = `translateY(${initialHandleTop}px)`;
      if (rowResizeTooltipRef.current) {
        rowResizeTooltipRef.current.textContent = `${currentH}px`;
      }
    }
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = (moveEvent.clientY - startY) * (100 / zoomLevel);
      const newHeight = Math.max(24, Math.min(180, currentH + delta));
      const roundedHeight = Math.round(newHeight);
      currentResizingHeightRef.current = roundedHeight;

      if (rowResizeGuideRef.current) {
        const currentTop = initialHandleTop + (roundedHeight - currentH);
        rowResizeGuideRef.current.style.transform = `translateY(${currentTop}px)`;
        if (rowResizeTooltipRef.current) {
          rowResizeTooltipRef.current.textContent = `${roundedHeight}px`;
        }
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (rowResizeGuideRef.current) {
        rowResizeGuideRef.current.style.display = 'none';
      }

      const finalHeight = currentResizingHeightRef.current;
      setRowHeights((prev) => {
        const next = { ...prev, [rowId]: finalHeight };
        try {
          localStorage.setItem('reamarc_cc_row_heights', JSON.stringify(next));
        } catch (err) {}
        return next;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Row Virtualization via @tanstack/react-virtual (Zoom-Compensated)
  const zoomLevelRef = useRef(zoomLevel);
  zoomLevelRef.current = zoomLevel;

  const rowVirtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (index) => rowHeights[filteredItems[index]?.id] || defaultRowHeight,
    overscan: 10,
    observeElementOffset: (instance, cb) => {
      return observeElementOffset(instance, (offset, isScrolling) => {
        const scale = (zoomLevelRef.current || 100) / 100;
        cb(offset / scale, isScrolling);
      });
    },
    observeElementRect: (instance, cb) => {
      return observeElementRect(instance, (rect) => {
        const scale = (zoomLevelRef.current || 100) / 100;
        cb({
          width: Math.round(rect.width / scale),
          height: Math.round(rect.height / scale),
        });
      });
    },
    scrollToFn: (offset, options, instance) => {
      const scale = (zoomLevelRef.current || 100) / 100;
      elementScroll(offset * scale, options, instance);
    },
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start ?? 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalVirtualSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  useEffect(() => {
    rowVirtualizer.measure();
  }, [defaultRowHeight, zoomLevel, rowVirtualizer]);

  useEffect(() => {
    if (rowHeightsResetKey) {
      setRowHeights({});
      try {
        localStorage.removeItem('reamarc_cc_row_heights');
      } catch {}
      rowVirtualizer.measure();
    }
  }, [rowHeightsResetKey, rowVirtualizer]);

  // Compute Total Table Width
  const totalTableWidth = useMemo(() => {
    const colsWidth = DEFAULT_CONTENT_COLUMNS.reduce(
      (sum, col) => sum + (columnWidths[col.key] || col.width),
      0
    );
    return colsWidth + 44; // 44px for row index
  }, [columnWidths]);

  return (
    <div
      ref={tableContainerRef}
      className="flex-1 min-h-0 overflow-x-auto overflow-y-auto bg-canvas relative w-full flex flex-col select-none custom-scrollbar"
    >
      <div
        ref={tableInnerRef}
        style={{
          zoom: `${zoomLevel}%`,
          width: `${totalTableWidth}px`,
          minWidth: `${totalTableWidth}px`,
          '--cc-row-height': `${defaultRowHeight}px`,
        } as React.CSSProperties}
        className="min-w-full flex flex-col flex-1 relative"
      >
        {/* Column Resize Visual Guide */}
        <div
          ref={resizeGuideRef}
          style={{ display: 'none', left: 0 }}
          className="absolute top-0 bottom-0 w-0.5 bg-accent z-40 pointer-events-none"
        >
          <div
            ref={resizeTooltipRef}
            className="absolute top-2 -left-6 px-1.5 py-0.5 bg-accent text-accent-contrast text-[10px] font-medium rounded-sm shadow-xs pointer-events-none select-none"
          />
        </div>

        {/* Row Resize Visual Guide */}
        <div
          ref={rowResizeGuideRef}
          style={{ display: 'none', top: 0 }}
          className="absolute left-0 right-0 h-0.5 bg-accent z-40 pointer-events-none"
        >
          <div
            ref={rowResizeTooltipRef}
            className="absolute left-2 -top-6 px-1.5 py-0.5 bg-accent text-accent-contrast text-[10px] font-medium rounded-sm shadow-xs pointer-events-none select-none"
          />
        </div>

        {/* Excel Matrix Table */}
        <table className="border-separate border-spacing-0 text-xs text-left table-fixed w-full">
          {/* Header Row */}
          <thead className="sticky top-0 z-30 bg-subtle text-fg-muted font-medium select-none">
            <tr>
              {/* Row Index Header */}
              <th
                style={{ width: '44px', minWidth: '44px', maxWidth: '44px' }}
                className="h-8 p-1.5 text-center font-mono text-xs font-medium border-b border-r border-border bg-subtle text-fg-muted z-30"
              >
                #
              </th>

              {/* Data Column Headers */}
              {DEFAULT_CONTENT_COLUMNS.map((col) => {
                const colW = columnWidths[col.key] || col.width;
                const alignClass =
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                const canFilter = !NO_FILTER_COLUMNS.has(col.key as string);
                const hasActiveFilter = Boolean(columnFilters[col.key]);
                const isFilterOpen = canFilter && openFilterColKey === col.key;
                const existingUniqueValues = isFilterOpen ? getUniqueValuesForColumn(col.key) : [];

                return (
                  <th
                    key={col.key}
                    style={{ width: `${colW}px`, minWidth: `${colW}px` }}
                    className={`h-8 px-2 py-1 border-b border-r border-border text-xs font-medium text-fg-muted tracking-tight relative group overflow-visible select-none ${alignClass}`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full">
                      <button
                        type="button"
                        onClick={() => handleSort(col.key as string)}
                        className="flex items-center gap-1 truncate flex-1 text-left hover:text-fg transition cursor-pointer group/sort min-w-0"
                        title={`Click to sort by ${col.label}`}
                      >
                        <span className="truncate block flex-1 font-medium">
                          {col.label}
                        </span>
                        {sortConfig.key === col.key ? (
                          sortConfig.direction === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-accent shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-accent shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-0 group-hover/sort:opacity-60 text-fg-muted shrink-0 transition" />
                        )}
                      </button>
                      {canFilter && (
                        <button
                          type="button"
                          data-filter-btn={col.key}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenFilterColKey(isFilterOpen ? null : col.key);
                          }}
                          className={`p-1 rounded-sm transition-colors cursor-pointer shrink-0 ${
                            hasActiveFilter
                              ? 'bg-accent text-accent-contrast font-medium shadow-xs'
                              : 'text-fg-muted hover:text-fg hover:bg-hover'
                          }`}
                          title={`Filter by ${col.label}`}
                        >
                          <Filter className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Column Width Resize Handle */}
                    <div
                      onMouseDown={(e) => handleColumnResizeStart(e, col.key)}
                      className="absolute top-0 bottom-0 right-0 w-1.5 cursor-col-resize hover:bg-accent/80 z-20"
                      title="Drag to resize column"
                    />

                    {/* Popover Filter Menu */}
                    {isFilterOpen && (
                      <div
                        data-filter-popover={col.key}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 top-full mt-1 z-50 w-56 bg-surface border border-border rounded-lg shadow-lg p-2.5 space-y-2 animate-in fade-in zoom-in-95 duration-100 font-normal normal-case text-left"
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-border">
                          <span className="text-xs font-medium text-fg-muted">Filter {col.label}</span>
                          {hasActiveFilter && (
                            <button
                              type="button"
                              onClick={() => {
                                setColumnFilters((prev) => {
                                  const next = { ...prev };
                                  delete next[col.key];
                                  return next;
                                });
                                setOpenFilterColKey(null);
                              }}
                              className="text-[10px] text-danger hover:underline font-medium cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        <input
                          type="text"
                          placeholder="Search value..."
                          value={columnFilters[col.key] || ''}
                          autoFocus
                          onChange={(e) => {
                            const v = e.target.value;
                            setColumnFilters((prev) => {
                              if (!v) {
                                const next = { ...prev };
                                delete next[col.key];
                                return next;
                              }
                              return { ...prev, [col.key]: v };
                            });
                          }}
                          className="w-full px-2 py-1 text-xs bg-subtle border border-border rounded-md text-fg placeholder:text-fg-muted focus:outline-hidden focus:ring-1 focus:ring-accent"
                        />

                        {existingUniqueValues.length > 0 && (
                          <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
                            {existingUniqueValues.map((val) => {
                              const isSelected = columnFilters[col.key] === val;
                              return (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => {
                                    setColumnFilters((prev) => ({ ...prev, [col.key]: val }));
                                    setOpenFilterColKey(null);
                                  }}
                                  className={`w-full text-left px-2 py-1 rounded text-xs truncate transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-accent-soft text-accent font-medium'
                                      : 'text-fg hover:bg-hover'
                                  }`}
                                >
                                  {val}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-border font-sans">
            {isLoading ? (
              // Skeleton Loader: 20 animated placeholder rows
              Array.from({ length: 20 }).map((_, idx) => (
                <tr key={`cc-skeleton-${idx}`} className="animate-pulse h-[var(--cc-row-height)]">
                  <td
                    style={{ width: '44px', minWidth: '44px', maxWidth: '44px' }}
                    className="p-2 text-center border-b border-r border-border bg-subtle"
                  >
                    <div className="h-3.5 w-4 bg-skel rounded mx-auto" />
                  </td>
                  {DEFAULT_CONTENT_COLUMNS.map((col) => {
                    const colW = columnWidths[col.key] || col.width;
                    return (
                      <td
                        key={col.key}
                        style={{ width: `${colW}px`, minWidth: `${colW}px` }}
                        className="p-2.5 border-b border-r border-border align-middle"
                      >
                        <div className="h-3.5 w-full bg-skel rounded opacity-60" />
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={DEFAULT_CONTENT_COLUMNS.length + 1} className="py-20 text-center">
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-12 h-12 rounded-xl bg-danger-bg border border-danger-bd flex items-center justify-center text-danger-fg mb-3">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-semibold text-fg">
                      Failed to load content calendar
                    </h3>
                    <p className="text-xs text-fg-muted mt-1 max-w-sm">{error}</p>
                  </div>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={DEFAULT_CONTENT_COLUMNS.length + 1} className="py-20 text-center">
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-12 h-12 rounded-xl bg-subtle border border-border flex items-center justify-center text-fg-muted mb-3">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-semibold text-fg">
                      No content items found
                    </h3>
                    <p className="text-xs text-fg-muted mt-1 max-w-sm">
                      Try adjusting your filters or click "+ Add Content" / "Import Excel" to load campaign assets.
                    </p>
                  </div>
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={DEFAULT_CONTENT_COLUMNS.length + 1} className="py-20 text-center">
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-12 h-12 rounded-xl bg-subtle border border-border flex items-center justify-center text-fg-muted mb-3">
                      <Filter className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-semibold text-fg">
                      No matching items
                    </h3>
                    <p className="text-xs text-fg-muted mt-1 max-w-sm mb-3">
                      No records match the active column filters.
                    </p>
                    <button
                      type="button"
                      onClick={() => setColumnFilters({})}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-accent rounded-md hover:bg-accent-hover transition cursor-pointer"
                    >
                      Clear all column filters
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr style={{ height: `${paddingTop}px` }} aria-hidden="true">
                    <td
                      colSpan={DEFAULT_CONTENT_COLUMNS.length + 1}
                      style={{ height: `${paddingTop}px`, padding: 0, border: 0 }}
                    />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const item = filteredItems[virtualRow.index];
                  if (!item) return null;
                  const customH = rowHeights[item.id];
                  const rowNumber = virtualRow.index + 1;

                  return (
                    <tr
                      key={item.id}
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      style={customH ? ({ '--cc-row-height': `${customH}px` } as React.CSSProperties) : undefined}
                      className="h-[var(--cc-row-height)] hover:bg-subtle/50 transition-colors group relative cursor-pointer"
                    >
                      {/* Row Serial Number (Click opens item drawer) */}
                      <td
                        onClick={() => onSelectItem(item)}
                        style={{ width: '44px', minWidth: '44px', maxWidth: '44px' }}
                        title="Click to view details in inspector"
                        className="h-[var(--cc-row-height)] p-2 text-center font-mono text-xs font-medium text-fg-muted border-b border-r border-border bg-subtle/30 select-none group-hover:bg-subtle/60 overflow-hidden py-0 align-middle relative cursor-pointer"
                      >
                        <span>{rowNumber}</span>
                        {/* Row Height Resize Handle */}
                        <div
                          onMouseDown={(e) => handleRowResizeStart(e, item.id, customH || defaultRowHeight)}
                          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-accent/80 z-20"
                          title="Drag to adjust row height"
                        />
                      </td>

                      {/* Editable Columns */}
                      {DEFAULT_CONTENT_COLUMNS.map((col) => {
                        const colW = columnWidths[col.key] || col.width;
                        const alignClass =
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                        const isEditing = editingCell?.rowId === item.id && editingCell?.colKey === col.key;
                        const rawVal = (item as any)[col.key] ?? '';
                        const isLongText = ['primary_text', 'headlines_hooks', 'content_on_creative'].includes(
                          col.key as string
                        );

                        return (
                          <td
                            key={col.key}
                            style={{ width: `${colW}px`, minWidth: `${colW}px` }}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              if (col.key === 'serial' || col.key === 'stage') {
                                onSelectItem(item);
                                return;
                              }
                              if (isLongText) {
                                setLongTextModal({
                                  rowId: item.id,
                                  colKey: col.key,
                                  title: `${col.label} — ${item.serial}`,
                                  value: String(rawVal),
                                });
                                return;
                              }
                              setEditingCell({ rowId: item.id, colKey: col.key });
                              setCellEditValue(String(rawVal));
                            }}
                            className={`h-[var(--cc-row-height)] p-1 border-b border-r border-border align-middle text-xs select-text overflow-hidden ${alignClass} ${
                              isEditing ? 'bg-accent-soft/30' : ''
                            }`}
                          >
                            {/* Serial Column (Read-Only) */}
                            {col.key === 'serial' ? (
                              <div
                                onClick={() => onSelectItem(item)}
                                className="flex items-center justify-center gap-1.5 cursor-pointer font-mono text-xs font-medium text-accent hover:underline text-center"
                                title="Click to view details"
                              >
                                {renderPlatformIcon(item)}
                                <span>{item.serial}</span>
                              </div>
                            ) : isEditing ? (
                              /* Active Inline Editor */
                              col.key === 'client_name' ? (
                                <CustomSelect
                                  size="xs"
                                  autoOpen
                                  usePortal
                                  value={cellEditValue}
                                  onChange={(val) => {
                                    setCellEditValue(val);
                                    commitCellEdit(item.id, col.key, val);
                                  }}
                                  onClose={() => setEditingCell(null)}
                                  options={ensureOption(clientSelectOptions, cellEditValue)}
                                  className="w-full"
                                />
                              ) : col.key === 'creative_type' ? (
                                <CustomSelect
                                  size="xs"
                                  autoOpen
                                  usePortal
                                  value={cellEditValue}
                                  onChange={(val) => {
                                    setCellEditValue(val);
                                    commitCellEdit(item.id, col.key, val);
                                  }}
                                  onClose={() => setEditingCell(null)}
                                  options={ensureOption(creativeTypeSelectOptions, cellEditValue)}
                                  className="w-full"
                                />
                              ) : col.key === 'content_type' ? (
                                <CustomSelect
                                  size="xs"
                                  autoOpen
                                  usePortal
                                  value={cellEditValue}
                                  onChange={(val) => {
                                    setCellEditValue(val);
                                    commitCellEdit(item.id, col.key, val);
                                  }}
                                  onClose={() => setEditingCell(null)}
                                  options={ensureOption(contentTypeSelectOptions, cellEditValue)}
                                  className="w-full"
                                />
                              ) : col.key === 'creative_category' ? (
                                <CustomSelect
                                  size="xs"
                                  autoOpen
                                  usePortal
                                  value={cellEditValue}
                                  onChange={(val) => {
                                    setCellEditValue(val);
                                    commitCellEdit(item.id, col.key, val);
                                  }}
                                  onClose={() => setEditingCell(null)}
                                  options={ensureOption(creativeCategorySelectOptions, cellEditValue)}
                                  className="w-full"
                                />
                              ) : col.key === 'stage' ? (
                                <CustomSelect
                                  size="xs"
                                  autoOpen
                                  usePortal
                                  value={cellEditValue}
                                  onChange={(val) => {
                                    setCellEditValue(val);
                                    commitCellEdit(item.id, col.key, val);
                                  }}
                                  onClose={() => setEditingCell(null)}
                                  options={ensureOption(stageSelectOptions, cellEditValue)}
                                  className="w-full"
                                />
                              ) : col.key === 'approval_status' ? (
                                <CustomSelect
                                  size="xs"
                                  autoOpen
                                  usePortal
                                  value={cellEditValue}
                                  onChange={(val) => {
                                    setCellEditValue(val);
                                    commitCellEdit(item.id, col.key, val);
                                  }}
                                  onClose={() => setEditingCell(null)}
                                  options={ensureOption(
                                    getApprovalStatusesForStage(item.stage).map((s) => ({ value: s, label: s })),
                                    cellEditValue
                                  )}
                                  className="w-full"
                                />
                              ) : col.key === 'setup_status' ? (
                                <CustomSelect
                                  size="xs"
                                  autoOpen
                                  usePortal
                                  value={cellEditValue}
                                  onChange={(val) => {
                                    setCellEditValue(val);
                                    commitCellEdit(item.id, col.key, val);
                                  }}
                                  onClose={() => setEditingCell(null)}
                                  options={ensureOption(setupStatusSelectOptions, cellEditValue)}
                                  className="w-full"
                                />
                              ) : col.key === 'design_due' || col.key === 'publish_date' ? (
                                <input
                                  type="date"
                                  autoFocus
                                  ref={(el) => {
                                    if (el) {
                                      try {
                                        el.showPicker?.();
                                      } catch (e) {}
                                    }
                                  }}
                                  value={cellEditValue}
                                  onChange={(e) => setCellEditValue(e.target.value)}
                                  onBlur={() => commitCellEdit(item.id, col.key, cellEditValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitCellEdit(item.id, col.key, cellEditValue);
                                    if (e.key === 'Escape') setEditingCell(null);
                                  }}
                                  className="w-full h-[26px] text-xs font-mono bg-surface text-fg border border-accent rounded-sm px-1.5 focus:outline-hidden cursor-pointer"
                                />
                              ) : col.key === 'design_owner' ? (
                                <CustomSelect
                                  size="xs"
                                  autoOpen
                                  usePortal
                                  value={cellEditValue}
                                  onChange={(val) => {
                                    setCellEditValue(val);
                                    commitCellEdit(item.id, col.key, val);
                                  }}
                                  onClose={() => setEditingCell(null)}
                                  options={ensureOption(designOwnerSelectOptions, cellEditValue)}
                                  className="w-full"
                                />
                              ) : (
                                <input
                                  type="text"
                                  autoFocus
                                  value={cellEditValue}
                                  onChange={(e) => setCellEditValue(e.target.value)}
                                  onBlur={() => commitCellEdit(item.id, col.key, cellEditValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitCellEdit(item.id, col.key, cellEditValue);
                                    if (e.key === 'Escape') setEditingCell(null);
                                  }}
                                  className="w-full h-[26px] text-xs font-sans bg-surface text-fg border border-accent rounded-sm px-1.5 focus:outline-hidden"
                                />
                              )
                            ) : (
                              /* Read-Only Cell Display with Quick Action Hooks */
                              <div className="flex items-center justify-between gap-1 w-full group/cell overflow-hidden">
                                {col.key === 'client_name' ? (
                                  <span
                                    className="font-medium text-fg truncate block flex-1"
                                    title={item.client_name || 'Apex Transfers LLC'}
                                  >
                                    {item.client_name || 'Apex Transfers LLC'}
                                  </span>
                                ) : col.key === 'creative_type' ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-subtle border border-border text-fg-muted">
                                    {item.creative_type}
                                  </span>
                                ) : col.key === 'content_type' ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-subtle border border-border text-fg-muted">
                                    {item.content_type || 'Scheduled'}
                                  </span>
                                ) : col.key === 'creative_category' ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-subtle border border-border text-fg-muted">
                                    {item.creative_category || item.posting_type || 'Organic Creative'}
                                  </span>
                                ) : col.key === 'stage' ? (
                                  <StatusPill
                                    variant={getStatusMapping(item.stage).variant}
                                    label={getStatusMapping(item.stage).label}
                                  />
                                ) : col.key === 'approval_status' ? (
                                  <StatusPill
                                    variant={getStatusMapping(item.approval_status).variant}
                                    label={getStatusMapping(item.approval_status).label}
                                  />
                                ) : col.key === 'setup_status' ? (
                                  <StatusPill
                                    variant={getStatusMapping(item.setup_status).variant}
                                    label={getStatusMapping(item.setup_status).label}
                                  />
                                ) : col.key === 'attachments' ? (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectItem(item);
                                    }}
                                    className="flex items-center justify-center gap-1 w-full cursor-pointer hover:opacity-85 transition"
                                    title="Click to view deliverables in inspector"
                                  >
                                    {(() => {
                                      const counts = getAssetCounts(item.attachments);
                                      if (counts.total === 0) {
                                        return <span className="text-fg-muted font-mono text-[10px]">—</span>;
                                      }
                                      return (
                                        <div className="flex items-center gap-1 overflow-hidden">
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-subtle border border-border text-fg">
                                            <Paperclip className="w-2.5 h-2.5 text-fg-muted" />
                                            <span>{counts.total}</span>
                                          </span>
                                          {counts.images > 0 && (
                                            <span className="text-[9px] px-1 py-0.5 rounded-sm bg-subtle border border-border text-fg-muted font-mono">
                                              {counts.images} img
                                            </span>
                                          )}
                                          {counts.videos > 0 && (
                                            <span className="text-[9px] px-1 py-0.5 rounded-sm bg-subtle border border-border text-fg-muted font-mono">
                                              {counts.videos} vid
                                            </span>
                                          )}
                                          {counts.links > 0 && (
                                            <span className="text-[9px] px-1 py-0.5 rounded-sm bg-subtle border border-border text-fg-muted font-mono">
                                              {counts.links} link
                                            </span>
                                          )}
                                          {counts.docs > 0 && (
                                            <span className="text-[9px] px-1 py-0.5 rounded-sm bg-subtle border border-border text-fg-muted font-mono">
                                              {counts.docs} doc
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ) : col.key === 'draft_preview_link' || col.key === 'final_asset_link' ? (
                                  <div className="flex items-center justify-center gap-1.5 w-full">
                                    {safeHttpUrl((item as any)[col.key]) ? (
                                      <a
                                        href={safeHttpUrl((item as any)[col.key]) || undefined}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 text-accent hover:underline text-xs font-medium"
                                      >
                                        <span>Link</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    ) : (
                                      <span className="text-fg-muted">—</span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCell({ rowId: item.id, colKey: col.key });
                                        setCellEditValue(String((item as any)[col.key] || ''));
                                      }}
                                      className="opacity-0 group-hover/cell:opacity-100 p-0.5 rounded text-fg-muted hover:text-fg hover:bg-hover transition"
                                      title="Edit link URL"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : isLongText ? (
                                  <div
                                    onClick={() => {
                                      setLongTextModal({
                                        rowId: item.id,
                                        colKey: col.key,
                                        title: `${col.label} — ${item.serial}`,
                                        value: String((item as any)[col.key] || ''),
                                      });
                                    }}
                                    className="flex items-center justify-between w-full cursor-pointer hover:text-accent transition"
                                  >
                                    <span
                                      className="truncate block flex-1 text-fg"
                                      title={String((item as any)[col.key] || '')}
                                    >
                                      {(item as any)[col.key] || <span className="text-fg-muted">—</span>}
                                    </span>
                                    <Maximize2 className="w-3 h-3 text-fg-muted opacity-0 group-hover/cell:opacity-100 shrink-0 ml-1" />
                                  </div>
                                ) : (
                                  <span
                                    className="truncate block flex-1 text-fg"
                                    title={String((item as any)[col.key] || '')}
                                  >
                                    {(item as any)[col.key] || <span className="text-fg-muted">—</span>}
                                  </span>
                                )}

                                {/* Quick edit hint icon for non-link, non-long-text fields */}
                                {!['serial', 'stage', 'draft_preview_link', 'final_asset_link', 'primary_text', 'headlines_hooks', 'content_on_creative'].includes(
                                  col.key as string
                                ) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingCell({ rowId: item.id, colKey: col.key });
                                      setCellEditValue(String((item as any)[col.key] || ''));
                                    }}
                                    className="opacity-0 group-hover/cell:opacity-100 p-0.5 rounded text-fg-muted hover:text-accent hover:bg-hover transition shrink-0"
                                    title="Click to edit field"
                                  >
                                    <Edit3 className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr style={{ height: `${paddingBottom}px` }} aria-hidden="true">
                    <td
                      colSpan={DEFAULT_CONTENT_COLUMNS.length + 1}
                      style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }}
                    />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>

        {/* Sticky Table Footer with Save Status Pill */}
        {!isLoading && !error && items.length > 0 && (
          <div
            style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px` }}
            className="px-4 py-1.5 h-8 min-h-[32px] bg-subtle border-t border-border flex items-center justify-between gap-3 text-xs select-none sticky bottom-0 z-20"
          >
            <div className="flex items-center gap-2.5 text-fg-muted">
              <span>
                Showing <strong className="text-fg font-medium">{filteredItems.length}</strong> of {items.length} items
              </span>
              {Object.keys(columnFilters).length > 0 && (
                <button
                  type="button"
                  onClick={() => setColumnFilters({})}
                  className="text-xs text-accent hover:underline font-medium cursor-pointer inline-flex items-center gap-1 ml-1"
                >
                  <X className="w-3 h-3" />
                  Clear {Object.keys(columnFilters).length} active {Object.keys(columnFilters).length === 1 ? 'filter' : 'filters'}
                </button>
              )}
            </div>

            {/* Status Feedback */}
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              {saveStatus === 'saving' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-subtle text-fg-muted border border-border">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Saving changes...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-subtle text-fg border border-border">
                  <Check className="w-3 h-3 text-success-fg" /> All changes saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-danger-soft text-danger border border-danger/30">
                  <AlertCircle className="w-3 h-3" /> Save failed (retrying...)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Long Text Editor Modal (for Ad Copy, Hooks, and Visuals) */}
      {longTextModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-100"
          onClick={() => setLongTextModal(null)}
        >
          <div
            className="bg-surface border border-border rounded-xl shadow-lg w-full max-w-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-accent" />
                <span>{longTextModal.title}</span>
              </h3>
              <button
                type="button"
                onClick={() => setLongTextModal(null)}
                className="p-1 rounded-sm text-fg-muted hover:text-fg hover:bg-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2">
              <textarea
                autoFocus
                rows={9}
                value={longTextModal.value}
                onChange={(e) =>
                  setLongTextModal((prev) => (prev ? { ...prev, value: e.target.value } : null))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    commitCellEdit(longTextModal.rowId, longTextModal.colKey, longTextModal.value);
                    setLongTextModal(null);
                  } else if (e.key === 'Escape') {
                    setLongTextModal(null);
                  }
                }}
                placeholder="Enter content..."
                className="w-full p-3 rounded-lg bg-subtle border border-border text-xs font-sans text-fg focus:outline-hidden focus:ring-1 focus:ring-accent resize-none leading-relaxed"
              />
              <div className="flex items-center justify-between text-xs text-fg-muted">
                <span>
                  {longTextModal.value.length} characters &bull;{' '}
                  {longTextModal.value.split(/\s+/).filter(Boolean).length} words
                </span>
                <span>Ctrl+Enter to save, Esc to cancel</span>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-border bg-subtle flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setLongTextModal(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  commitCellEdit(longTextModal.rowId, longTextModal.colKey, longTextModal.value);
                  setLongTextModal(null);
                }}
              >
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
