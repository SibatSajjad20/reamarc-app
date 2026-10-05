import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Calendar,
  Table,
  Kanban,
  Search,
  X,
  Plus,
  Download,
  Upload,
  ChevronDown,
  FileSpreadsheet,
  Settings,
  Briefcase,
  User,
} from 'lucide-react';
import type {
  ContentCalendarItem,
  ContentCalendarConstants,
  ContentCalendarViewMode,
  ContentCalendarFilter,
  ContentCalendarQuickFilter,
} from '../../types/contentCalendar';
import { contentCalendarService } from '../../services/contentCalendarService';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useToast } from '../../context/ToastContext';
import { ContentCalendarTableView } from '../content-calendar/ContentCalendarTableView';
import { ContentCalendarPipelineView } from '../content-calendar/ContentCalendarPipelineView';
import { ContentCalendarMonthWeekView } from '../content-calendar/ContentCalendarMonthWeekView';
import { ContentCalendarDrawer } from '../content-calendar/ContentCalendarDrawer';
import { ContentCalendarModal } from '../content-calendar/ContentCalendarModal';
import { ContentCalendarImportModal } from '../content-calendar/ContentCalendarImportModal';
import { ContentCalendarSettingsModal } from '../content-calendar/ContentCalendarSettingsModal';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { CustomSelect } from '../ui/CustomSelect';
import { useAuth } from '../../context/AuthContext';
import {
  canCreateCampaign,
  visiblePipelineStages,
  getContentCalendarBucket,
} from '../../utils/contentCalendarWorkflow';
import type { StageAction } from '../../utils/contentCalendarWorkflow';
import {
  exportFilteredContentCalendarToExcel,
  downloadContentCalendarTemplate,
} from '../../utils/contentCalendarExcel';


const DEFAULT_ROW_HEIGHT = 40;
const DEFAULT_ZOOM = 100;

export const ContentCalendarView: React.FC = () => {
  const { addToast } = useToast();
  const { user } = useAuth();
  const { workspaces } = useWorkspaces();
  const stageColumns = React.useMemo(() => visiblePipelineStages(user), [user]);
  const allowCreate = canCreateCampaign(user);

  const activeClients = React.useMemo(() => {
    return workspaces
      .filter((w) => w.status !== 'inactive')
      .map((w) => ({ id: w.id, name: w.name }));
  }, [workspaces]);

  const [items, setItems] = useState<ContentCalendarItem[]>([]);
  const [stagesCount, setStagesCount] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active View Mode: 'table' | 'pipeline' | 'calendar'
  const [viewMode, setViewMode] = useState<ContentCalendarViewMode>(() => {
    try {
      const saved = localStorage.getItem('reamarc_cc_view_mode') as ContentCalendarViewMode;
      if (saved && ['table', 'pipeline', 'calendar'].includes(saved)) return saved;
    } catch (e) {}
    return 'table';
  });

  // Filter State
  const [filter, setFilter] = useState<ContentCalendarFilter>({
    search: '',
    stage: 'all',
    creative_type: 'all',
    approval_status: 'all',
  });
  const [searchInput, setSearchInput] = useState('');

  // Debounce search input to avoid spamming the backend
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Quick Filter (Matching Lead CRM: all | overdue | today | scheduled | idle)
  const [quickFilter, setQuickFilter] = useState<ContentCalendarQuickFilter>('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');

  const clientOptions = React.useMemo(() => {
    const names = new Set<string>();
    for (const it of items) {
      const n = (it.client_name || '').trim();
      if (n) names.add(n);
    }
    for (const c of activeClients) {
      if (c.name?.trim()) names.add(c.name.trim());
    }
    return [
      { value: 'all', label: 'All clients' },
      ...[...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name })),
    ];
  }, [items, activeClients]);

  const assigneeOptions = React.useMemo(() => {
    const people = new Map<string, string>();
    let hasUnassigned = false;
    for (const it of items) {
      const id = (it.assignee_id || '').trim();
      const name = (it.assignee_name || '').trim();
      if (id) {
        people.set(id, name || id);
      } else if (name) {
        people.set(`name:${name}`, name);
      } else {
        hasUnassigned = true;
      }
    }
    return [
      { value: 'all', label: 'All assignees' },
      ...(hasUnassigned ? [{ value: 'unassigned', label: 'Unassigned' }] : []),
      ...[...people.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [items]);

  const scopedItems = React.useMemo(() => {
    return items.filter((it) => {
      if (clientFilter !== 'all' && (it.client_name || '').trim() !== clientFilter) {
        return false;
      }
      if (assigneeFilter === 'unassigned') {
        if (it.assignee_id || (it.assignee_name || '').trim()) return false;
      } else if (assigneeFilter !== 'all') {
        if (assigneeFilter.startsWith('name:')) {
          if ((it.assignee_name || '').trim() !== assigneeFilter.slice(5)) return false;
        } else {
          if (it.assignee_id !== assigneeFilter) return false;
        }
      }
      return true;
    });
  }, [items, clientFilter, assigneeFilter]);

  const overdueCount = React.useMemo(
    () => scopedItems.filter((it) => getContentCalendarBucket(it) === 'overdue').length,
    [scopedItems]
  );

  const todayCount = React.useMemo(
    () => scopedItems.filter((it) => getContentCalendarBucket(it) === 'today').length,
    [scopedItems]
  );

  const displayItems = React.useMemo(() => {
    if (quickFilter === 'all') return scopedItems;
    return scopedItems.filter((it) => getContentCalendarBucket(it) === quickFilter);
  }, [scopedItems, quickFilter]);

  // Constants
  const [constants, setConstants] = useState<ContentCalendarConstants | null>(null);

  // Load constants once on mount
  useEffect(() => {
    let active = true;
    contentCalendarService
      .getConstants()
      .then((consts) => {
        if (!active) return;
        try {
          const localSaved = localStorage.getItem('reamarc_cc_creative_types');
          if (localSaved) {
            const parsed = JSON.parse(localSaved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              consts = { ...consts, creative_types: parsed };
            }
          }
        } catch {}
        setConstants(consts);
      })
      .catch((err) => {
        console.error('Failed to load content calendar constants', err);
      });
    return () => {
      active = false;
    };
  }, []);



  // Drawer & Modal State
  const [selectedItem, setSelectedItem] = useState<ContentCalendarItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentCalendarItem | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Zoom & Row Height Display Preferences
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_cc_zoom');
      if (saved) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed >= 50 && parsed <= 200) return parsed;
      }
    } catch {}
    return DEFAULT_ZOOM;
  });

  const [defaultRowHeight, setDefaultRowHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_cc_row_height');
      if (saved) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed >= 24 && parsed <= 120) return parsed;
      }
    } catch {}
    return DEFAULT_ROW_HEIGHT;
  });

  const [rowHeightsResetKey, setRowHeightsResetKey] = useState<number>(0);

  const handleZoomChange = (newZoom: number) => {
    setZoomLevel(newZoom);
    try {
      localStorage.setItem('reamarc_cc_zoom', String(newZoom));
    } catch {}
  };

  const handleRowHeightChange = (newHeight: number) => {
    setDefaultRowHeight(newHeight);
    try {
      localStorage.setItem('reamarc_cc_row_height', String(newHeight));
    } catch {}
  };

  const handleResetRowHeights = () => {
    setRowHeightsResetKey((prev) => prev + 1);
    try {
      localStorage.removeItem('reamarc_cc_row_heights');
    } catch {}
  };

  const handleUpdateConstants = async (newConstants: ContentCalendarConstants) => {
    setConstants(newConstants);
    try {
      localStorage.setItem('reamarc_cc_creative_types', JSON.stringify(newConstants.creative_types));
    } catch {}
    try {
      await contentCalendarService.updateConstants({
        creative_types: newConstants.creative_types,
      });
    } catch (err) {
      console.warn('Backend constants update failed, saved locally:', err);
    }
  };

  // Export / Import State
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [filteredItemsForExport, setFilteredItemsForExport] = useState<ContentCalendarItem[]>([]);

  // Rate limiting / Module load gate
  useModuleLoadGate(isLoading);

  // Click outside for popover menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Items (supports silent background sync without showing skeleton)
  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      const isSilent = opts?.silent ?? false;
      try {
        if (!isSilent) {
          setIsLoading(true);
        }
        setError(null);
        const res = await contentCalendarService.getItems(filter);
        setItems(res.items);
        setStagesCount(res.stages_count);
      } catch (err: any) {
        setError(err?.message || 'Failed to load content calendar items');
      } finally {
        if (!isSilent) {
          setIsLoading(false);
        }
      }
    },
    [filter],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Move stage with instant optimistic update
  const handleTransition = async (
    id: string,
    action: StageAction,
    extra?: { note?: string; assignee_id?: string; assignee_name?: string; target_stage?: string },
  ) => {
    try {
      const updated = await contentCalendarService.transition(id, { action, ...extra });

      // 1. Optimistic instant local update in state
      setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));

      // 2. Adjust stage counts locally
      setStagesCount((prev) => {
        const next = { ...prev };
        const prevItem = items.find((it) => it.id === id);
        if (prevItem && prevItem.stage !== updated.stage) {
          if (next[prevItem.stage] !== undefined) {
            next[prevItem.stage] = Math.max(0, next[prevItem.stage] - 1);
          }
          if (next[updated.stage] !== undefined) {
            next[updated.stage] = (next[updated.stage] || 0) + 1;
          }
        }
        return next;
      });

      if (!stageColumns.includes(updated.stage)) {
        setSelectedItem(null);
        setIsDrawerOpen(false);
      } else {
        setSelectedItem(updated);
      }
      addToast('Stage updated', `Moved to ${updated.stage}`, 'info');

      // 3. Silent background refresh (NEVER flashes skeleton screens)
      await loadData({ silent: true });
    } catch (err: any) {
      addToast('Could not move campaign', err?.message || 'That action is not allowed', 'error');
    }
  };

  // Save (Create or Update)
  const handleSaveItem = async (data: Partial<ContentCalendarItem>) => {
    try {
      if (data.id) {
        const updated = await contentCalendarService.updateItem(data.id, data);
        setItems((prev) => prev.map((it) => (it.id === data.id ? updated : it)));
        if (selectedItem?.id === data.id) setSelectedItem(updated);
        addToast('Saved', `Updated ${updated.serial}`, 'success');
      } else {
        const created = await contentCalendarService.createItem(data);
        setItems((prev) => [created, ...prev]);
        addToast('Created', `Created ${created.serial}`, 'success');
      }
      void loadData({ silent: true });
    } catch (err: any) {
      addToast('Save failed', err?.message || 'Could not save item', 'error');
    }
  };

  // Delete
  const handleDeleteItem = async (id: string) => {
    try {
      await contentCalendarService.deleteItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (selectedItem?.id === id) {
        setSelectedItem(null);
        setIsDrawerOpen(false);
      }
      addToast('Deleted', 'Item deleted successfully', 'info');
      void loadData({ silent: true });
    } catch (err: any) {
      addToast('Delete failed', err?.message || 'Could not delete item', 'error');
    }
  };

  // Local optimistic update for inline table editing
  const handleUpdateItemLocal = (id: string, changes: Partial<ContentCalendarItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...changes } : it))
    );
    if (selectedItem?.id === id) {
      setSelectedItem((prev) => (prev ? { ...prev, ...changes } : null));
    }
  };

  // Export visible view to Excel
  const handleExportVisible = () => {
    setIsExportMenuOpen(false);
    const toExport = filteredItemsForExport.length > 0 ? filteredItemsForExport : displayItems;
    if (toExport.length === 0) {
      addToast('No Items to Export', 'There are no items currently visible in the active filter.', 'info');
      return;
    }
    exportFilteredContentCalendarToExcel(toExport, filter.client_name);
    addToast(
      'Export Complete',
      `Exported ${toExport.length} visible campaign ${toExport.length === 1 ? 'record' : 'records'} to Excel.`,
      'success'
    );
  };

  // Download template
  const handleDownloadTemplate = () => {
    setIsExportMenuOpen(false);
    downloadContentCalendarTemplate(constants);
    addToast('Template Downloaded', 'Content Calendar blank Excel template saved to downloads.', 'info');
  };


  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-white dark:bg-[#0f1117] overflow-hidden select-none">
      {/* Module Header & Universal Toolbar */}
      <div className="relative z-40 bg-white dark:bg-[#12141c] border-b border-zinc-200 dark:border-zinc-800 shadow-2xs shrink-0 select-none overflow-visible">
        {/* Row 1: Title, Status Counters, View Mode Tabs & Add Content */}
        <div className="px-5 py-2.5 flex items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800/80">
          {/* Left: Module Title & Status Counters */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                Content Calendar
              </h1>
              {(stagesCount['Ready to Post'] || 0) > 0 && (
                <span className="text-[10px] font-numeric font-semibold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {stagesCount['Ready to Post']} Ready
                </span>
              )}
              {(stagesCount['Posted'] || 0) > 0 && (
                <span className="text-[10px] font-numeric font-semibold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {stagesCount['Posted']} Posted
                </span>
              )}
            </div>
          </div>

          {/* Right: View Mode Tabs & Primary Add Content Button */}
          <div className="flex items-center gap-3">
            {/* View Mode Tabs: Table (Excel) | Pipeline | Calendar */}
            <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/80 rounded-xl p-0.5 border border-zinc-200 dark:border-zinc-700/80">
              <button
                type="button"
                onClick={() => {
                  setViewMode('table');
                  try {
                    localStorage.setItem('reamarc_cc_view_mode', 'table');
                  } catch (e) {}
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                <span>Sheet</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode('pipeline');
                  try {
                    localStorage.setItem('reamarc_cc_view_mode', 'pipeline');
                  } catch (e) {}
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewMode === 'pipeline'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
                <span>Pipeline</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode('calendar');
                  try {
                    localStorage.setItem('reamarc_cc_view_mode', 'calendar');
                  } catch (e) {}
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewMode === 'calendar'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Calendar</span>
              </button>
            </div>

            {/* Add Content Button */}
            {allowCreate && (
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Content</span>
            </button>
            )}
          </div>
        </div>

        {/* Row 2: Search, Filters & Secondary Actions */}
        <div className="px-5 py-2 flex items-center justify-between gap-3 overflow-visible">
          {/* Left: Search & Filter Controls */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {/* Search Input */}
          <div className="relative w-48 sm:w-60">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search serial, copy, concept..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Client Filter */}
          <div className="w-40 sm:w-44 shrink-0">
            <CustomSelect
              size="sm"
              icon={Briefcase}
              value={clientFilter}
              onChange={setClientFilter}
              options={clientOptions}
              placeholder="All clients"
            />
          </div>

          {/* Assignee Filter */}
          <div className="w-40 sm:w-44 shrink-0">
            <CustomSelect
              size="sm"
              icon={User}
              value={assigneeFilter}
              onChange={setAssigneeFilter}
              options={assigneeOptions}
              placeholder="All assignees"
            />
          </div>

          {/* Quick Urgency Filter Pills (CRM Pipeline style: All | Overdue | Today | Scheduled | Idle) */}
          <div className="flex items-center gap-1 bg-zinc-100/80 dark:bg-zinc-800/80 p-0.5 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 shrink-0">
            {(
              [
                ['all', 'All'],
                ['overdue', 'Overdue'],
                ['today', 'Today'],
                ['scheduled', 'Scheduled'],
                ['idle', 'Idle'],
              ] as const
            ).map(([id, label]) => {
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setQuickFilter(id)}
                  className={`h-7 px-2.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                    quickFilter === id
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <span>{label}</span>
                  {id === 'overdue' && overdueCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white leading-none font-numeric">
                      {overdueCount}
                    </span>
                  )}
                  {id === 'today' && todayCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white leading-none font-numeric">
                      {todayCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          </div>

          {/* Right: Export and Import */}
          <div className="flex items-center gap-2 shrink-0 overflow-visible">
          {/* Export Dropdown Popover */}
          <div className="relative z-50" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                isExportMenuOpen
                  ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400'
                  : 'bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
              }`}
              title="Export campaigns to Excel or download template"
            >
              <Download className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-64 bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl p-1.5 space-y-1 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none">
                <button
                  type="button"
                  onClick={handleExportVisible}
                  className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      Export Visible View (.xlsx)
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                      Exports strictly the campaigns matching your active filters
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Download className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      Download Template (.xlsx)
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                      Blank formatted spreadsheet with allowed options reference tab
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Import Excel Button */}
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
            title="Import campaign rows from an Excel or CSV spreadsheet"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
            <span>Import Excel</span>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
            title="Settings (Zoom, Row Height, Field Values)"
          >
            <Settings className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
            <span>Settings</span>
          </button>
        </div>
      </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {viewMode === 'table' && (
          <ContentCalendarTableView
            items={displayItems}
            isLoading={isLoading}
            error={error}
            onSelectItem={(it) => {
              setSelectedItem(it);
              setIsDrawerOpen(true);
            }}
            zoomLevel={zoomLevel}
            defaultRowHeight={defaultRowHeight}
            rowHeightsResetKey={rowHeightsResetKey}
            onUpdateItemLocal={handleUpdateItemLocal}
            onFilteredItemsChange={setFilteredItemsForExport}
            constants={constants}
            activeClients={activeClients}
          />
        )}

        {viewMode === 'pipeline' && (
          <ContentCalendarPipelineView
            items={displayItems}
            stages={stageColumns}
            actor={user}
            isLoading={isLoading}
            onSelectItem={(it) => {
              setSelectedItem(it);
              setIsDrawerOpen(true);
            }}
            onTransition={handleTransition}
          />
        )}

        {viewMode === 'calendar' && (
          <ContentCalendarMonthWeekView
            items={displayItems}
            isLoading={isLoading}
            onSelectItem={(it) => {
              setSelectedItem(it);
              setIsDrawerOpen(true);
            }}
            onUpdateItem={async (id, payload) => {
              await handleSaveItem({ id, ...payload });
            }}
          />
        )}
      </div>

      {/* Item Detail Inspector Drawer */}
      <ContentCalendarDrawer
        item={selectedItem}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedItem(null);
        }}
        onEdit={(it) => {
          setEditingItem(it);
          setIsModalOpen(true);
        }}
        onDelete={handleDeleteItem}
        actor={user}
        onTransition={handleTransition}
        onItemUpdated={(updated) => {
          setSelectedItem(updated);
          setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        }}
      />

      {/* Item Create / Edit Modal */}
      <ContentCalendarModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
        }}
        onSave={handleSaveItem}
        item={editingItem}
        constants={constants}
        activeClients={activeClients}
      />

      {/* Excel Sheet Import Modal */}
      <ContentCalendarImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={loadData}
        activeClients={activeClients}
      />

      {/* Settings Modal */}
      <ContentCalendarSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        zoomLevel={zoomLevel}
        onZoomChange={handleZoomChange}
        defaultRowHeight={defaultRowHeight}
        onRowHeightChange={handleRowHeightChange}
        onResetRowHeights={handleResetRowHeights}
        constants={constants}
        onUpdateConstants={handleUpdateConstants}
      />
    </div>
  );
};
