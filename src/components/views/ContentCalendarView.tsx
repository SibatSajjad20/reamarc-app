import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Table,
  Kanban,
  LayoutDashboard,
  Search,
  X,
  Plus,
  Download,
  Upload,
  ChevronDown,
  FileSpreadsheet,
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
import { ContentCalendarOverviewTab } from '../content-calendar/overview/ContentCalendarOverviewTab';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { CustomSelect } from '../ui/CustomSelect';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Button } from '../ui/button';
import { StatusPill } from '../ui/StatusPill';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';
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

  const initialFilterKey = JSON.stringify({
    search: '',
    stage: 'all',
    creative_type: 'all',
    approval_status: 'all',
  });
  const initialCached = contentCalendarService.getCachedItems(initialFilterKey);
  const hasCached = Boolean(initialCached || contentCalendarService.hasInitialCache());

  const [items, setItems] = useState<ContentCalendarItem[]>(() => {
    return initialCached?.data?.items || [];
  });
  const [stagesCount, setStagesCount] = useState<Record<string, number>>(() => {
    return initialCached?.data?.stages_count || {};
  });
  const [isLoading, setIsLoading] = useState(!hasCached);
  const [error, setError] = useState<string | null>(null);

  // Active View Mode: 'table' | 'pipeline' | 'calendar'
  const [viewMode, setViewMode] = useState<ContentCalendarViewMode>(() => {
    try {
      const saved = localStorage.getItem('reamarc_cc_view_mode') as ContentCalendarViewMode;
      if (saved && ['overview', 'table', 'pipeline', 'calendar'].includes(saved)) return saved;
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
  const [constants, setConstants] = useState<ContentCalendarConstants | null>(() => {
    return contentCalendarService.getCachedConstants()?.data || null;
  });

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
        contentCalendarService.setCachedConstants(consts);
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

  // Zoom & Row Height Display Preferences
  const [zoomLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_cc_zoom');
      if (saved) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed >= 50 && parsed <= 200) return parsed;
      }
    } catch {}
    return DEFAULT_ZOOM;
  });

  const [defaultRowHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_cc_row_height');
      if (saved) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed >= 24 && parsed <= 120) return parsed;
      }
    } catch {}
    return DEFAULT_ROW_HEIGHT;
  });

  const [rowHeightsResetKey] = useState<number>(0);

  // Export / Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [filteredItemsForExport, setFilteredItemsForExport] = useState<ContentCalendarItem[]>([]);

  // Rate limiting / Module load gate
  useModuleLoadGate(isLoading);

  // Fetch Items (supports silent background sync without showing skeleton)
  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      const filterKey = JSON.stringify(filter);
      const cached = contentCalendarService.getCachedItems(filterKey);
      const isSilent = opts?.silent ?? false;
      const shouldSilent = isSilent || Boolean(cached);

      if (cached && !isSilent) {
        setItems(cached.data.items);
        setStagesCount(cached.data.stages_count);
        setIsLoading(false);
      } else if (!shouldSilent) {
        setIsLoading(true);
      }

      try {
        setError(null);
        const res = await contentCalendarService.getItems(filter);
        contentCalendarService.setCachedItems(filterKey, res);
        setItems(res.items);
        setStagesCount(res.stages_count);
      } catch (err: any) {
        if (!cached) {
          setError(err?.message || 'Failed to load content calendar items');
        }
      } finally {
        setIsLoading(false);
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
    const toExport = filteredItemsForExport.length > 0 ? filteredItemsForExport : displayItems;
    if (toExport.length === 0) {
      addToast('No items to export', 'There are no items currently visible in the active filter.', 'info');
      return;
    }
    exportFilteredContentCalendarToExcel(toExport, filter.client_name);
    addToast(
      'Export complete',
      `Exported ${toExport.length} visible campaign ${toExport.length === 1 ? 'record' : 'records'} to Excel.`,
      'success'
    );
  };

  // Download template
  const handleDownloadTemplate = () => {
    downloadContentCalendarTemplate(constants);
    addToast('Template downloaded', 'Content Calendar blank Excel template saved to downloads.', 'info');
  };


  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-surface overflow-hidden select-none">
      {/* Module Header & Universal Toolbar */}
      <div className="relative z-40 bg-surface border-b border-border shadow-2xs shrink-0 select-none overflow-visible">
        {/* Row 1: Title, Status Counters, View Mode Switcher & Add Content */}
        <div className="px-5 py-3 flex items-center justify-between gap-4 border-b border-border flex-wrap">
          {/* Left: Module Title & Status Counters */}
          <div className="flex items-center gap-3">
            <h1 className="text-h1 font-semibold text-fg tracking-tight">
              Content calendar
            </h1>
            <div className="flex items-center gap-2">
              {(stagesCount['Ready to Post'] || 0) > 0 && (
                <StatusPill variant="info" label={`${stagesCount['Ready to Post']} ready`} />
              )}
              {(stagesCount['Posted'] || 0) > 0 && (
                <StatusPill variant="success" label={`${stagesCount['Posted']} posted`} />
              )}
            </div>
          </div>

          {/* Right: View Mode Switcher & Primary Action */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <SegmentedControl
              size="sm"
              value={viewMode}
              onValueChange={(val) => {
                const mode = val as ContentCalendarViewMode;
                setViewMode(mode);
                try {
                  localStorage.setItem('reamarc_cc_view_mode', mode);
                } catch (e) {}
              }}
              options={[
                { value: 'overview', label: 'Overview', icon: LayoutDashboard },
                { value: 'table', label: 'Sheet', icon: Table },
                { value: 'pipeline', label: 'Pipeline', icon: Kanban },
                { value: 'calendar', label: 'Calendar', icon: Calendar },
              ]}
            />

            {allowCreate && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingItem(null);
                  setIsModalOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                <span>Add content</span>
              </Button>
            )}
          </div>
        </div>

        {/* Row 2: Search, Filters & Secondary Actions (Sheet/Pipeline/Calendar specific) */}
        {viewMode !== 'overview' && (
          <div className="px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2 overflow-visible flex-wrap">
            {/* Left: Search & Filter Controls */}
            <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
              {/* Search Input */}
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search serial, copy, concept..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 rounded-md bg-subtle border border-border text-xs text-fg placeholder:text-fg-muted focus:border-accent focus:outline-hidden"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg transition cursor-pointer"
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

              {/* Quick Urgency Filter */}
              <SegmentedControl
                size="sm"
                value={quickFilter}
                onValueChange={(val) => setQuickFilter(val as any)}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'overdue', label: 'Overdue', count: overdueCount > 0 ? overdueCount : undefined },
                  { value: 'today', label: 'Today', count: todayCount > 0 ? todayCount : undefined },
                  { value: 'scheduled', label: 'Scheduled' },
                  { value: 'idle', label: 'Idle' },
                ]}
              />
            </div>

            {/* Right: Export, Import, Settings */}
            <div className="flex items-center gap-2 shrink-0 overflow-visible">
              {/* Export Dropdown Popover */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    title="Export campaigns to Excel or download template"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    <span>Export</span>
                    <ChevronDown className="w-3 h-3 ml-1 text-fg-muted" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem
                    onClick={handleExportVisible}
                    className="flex items-start gap-2.5 p-2 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-status-success-fg shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold text-fg">
                        Export visible view (.xlsx)
                      </div>
                      <div className="text-caption text-fg-muted leading-tight mt-0.5">
                        Exports strictly campaigns matching active filters
                      </div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDownloadTemplate}
                    className="flex items-start gap-2.5 p-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold text-fg">
                        Download template (.xlsx)
                      </div>
                      <div className="text-caption text-fg-muted leading-tight mt-0.5">
                        Blank formatted spreadsheet with options reference tab
                      </div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Import Excel Button */}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsImportModalOpen(true)}
                title="Import campaign rows from an Excel or CSV spreadsheet"
              >
                <Upload className="w-3.5 h-3.5 mr-1" />
                <span>Import</span>
              </Button>

            </div>
          </div>
        )}
      </div>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {viewMode === 'overview' && (
          <ContentCalendarOverviewTab
            items={items}
            activeClients={activeClients}
            isLoading={isLoading}
            activeClientFilter={clientFilter}
            onSelectClientFilter={(name) => setClientFilter(name)}
            onSwitchViewMode={(mode) => {
              setViewMode(mode);
              try {
                localStorage.setItem('reamarc_cc_view_mode', mode);
              } catch (e) {}
            }}
            onSelectItem={(it) => {
              setSelectedItem(it);
              setIsDrawerOpen(true);
            }}
            onRefresh={() => void loadData({ silent: false })}
          />
        )}

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

    </div>
  );
};
