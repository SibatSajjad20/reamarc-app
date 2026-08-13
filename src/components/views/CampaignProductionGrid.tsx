import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileSpreadsheet,
  Download,
  Plus,
  Trash2,
  Eye,
  X,
  Sparkles,
  Layers,
  Building2,
  BarChart3,
  Loader2,
  CheckCircle2,
  Settings2,
  SlidersHorizontal,
  RefreshCcw,
  MoveHorizontal,
  MoveVertical,
  ChevronDown,
  Search,
  Filter,
  Brain,
  BookmarkPlus,
  Zap,
  PanelTop,
  Table2,
  GripVertical,
  ChevronUp,
  MessageSquare,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { CampaignMatrixRow } from '../../data/staticMatrixData';
import {
  CREATIVE_TYPE_OPTIONS,
  CONTENT_PILLAR_OPTIONS,
  CAMPAIGN_TYPE_OPTIONS,
  OFFER_OPTIONS,
  CTA_OPTIONS,
  APPROVAL_STATUS_OPTIONS,
  SETUP_STATUS_OPTIONS,
  DESIGN_OWNER_OPTIONS
} from '../../data/staticMatrixData';
import type { Workspace, Campaign } from '../../types';
import { campaignService } from '../../services/campaignService';
import { matrixService } from '../../services/matrixService';
import type { SmartFilterRule, SmartSort } from '../../services/matrixService';
import { useToast } from '../../context/ToastContext';
import { CampaignWizardModal } from '../modals/CampaignWizardModal';
import { useAuth } from '../../context/AuthContext';


interface MultiSelectFilterDropdownProps {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (selected: string[]) => void;
  width: number;
}

const MultiSelectFilterDropdown: React.FC<MultiSelectFilterDropdownProps> = ({
  label,
  options,
  selectedValues = [],
  onChange,
  width
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isActive = selectedValues.length > 0;

  const toggleOption = (opt: string) => {
    let next: string[];
    if (selectedValues.includes(opt)) {
      next = selectedValues.filter(v => v !== opt);
    } else {
      next = [...selectedValues, opt];
    }
    onChange(next);
  };

  const handleSelectAll = () => {
    onChange([]);
    setSearchQuery('');
  };

  const handleClear = () => {
    onChange([]);
    setSearchQuery('');
  };

  const getDisplayText = () => {
    if (selectedValues.length === 0 || selectedValues.length === options.length) {
      return 'All';
    }
    if (selectedValues.length === 1) {
      return selectedValues[0];
    }
    return `${selectedValues.length} Selected`;
  };

  return (
    <div
      ref={dropdownRef}
      className="relative w-full"
      style={{ width: `${Math.max(60, width - 8)}px`, maxWidth: `${Math.max(60, width - 8)}px` }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-1 px-1.5 py-0.5 text-[10px] rounded border transition-all cursor-pointer select-none font-medium ${
          isActive
            ? 'bg-teal-500/10 dark:bg-teal-950/60 border-teal-500 text-teal-700 dark:text-teal-300 shadow-sm font-bold'
            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
        }`}
        title={`Filter ${label}: ${selectedValues.length > 0 ? selectedValues.join(', ') : 'All'}`}
      >
        <span className="truncate text-left">{getDisplayText()}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          {isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
          )}
          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-teal-500' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[220px] w-max max-w-[280px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[100] p-2.5 text-xs">
          {/* Header & Quick Action Buttons */}
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800 gap-2">
            <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 truncate">
              {label} Filter
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline font-semibold cursor-pointer"
              >
                Select All
              </button>
              {isActive && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-[10px] text-rose-500 hover:underline font-semibold cursor-pointer"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Search box if options > 4 */}
          {options.length > 4 && (
            <div className="relative mb-2">
              <Search className="w-3 h-3 absolute left-2 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="Search options..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg pl-7 pr-2 py-1 text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>
          )}

          {/* Option Checkboxes List */}
          <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {filteredOptions.length === 0 ? (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 py-2 text-center">
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selectedValues.includes(opt);
                return (
                  <label
                    key={opt}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    className={`flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] cursor-pointer transition-colors select-none ${
                      checked
                        ? 'bg-teal-500/10 text-teal-800 dark:text-teal-300 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(opt)}
                      className="w-3.5 h-3.5 rounded text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-600 cursor-pointer"
                    />
                    <span className="truncate">{opt}</span>
                  </label>
                );
              })
            )}
          </div>

          {/* Footer stats */}
          <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
            <span>
              {selectedValues.length > 0 ? `${selectedValues.length} of ${options.length} selected` : 'All options shown'}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Smart View Types ──────────────────────────────────────────────────────────

interface CustomTab {
  id: string;
  name: string;
  filters: SmartFilterRule[];
  sort: SmartSort | null;
  keyword: string;
  createdAt: string;
}

// Columns available for AI filter queries
const AVAILABLE_FILTER_COLUMNS = [
  'serial', 'campaignType', 'creativeType', 'contentPillar',
  'contentConcept', 'offer', 'productionDirection', 'primaryText',
  'headlinesHooks', 'contentOnCreative', 'cta', 'hashtagsKeywords',
  'designOwner', 'designDue', 'approvalStatus', 'setupStatus', 'notes'
];

// Quick-filter presets
const SMART_PRESETS = [
  { label: 'Videos Only', filters: [{ column: 'creativeType', operator: 'contains' as const, value: 'Video' }], keyword: '', sort: null },
  { label: 'Industry Demand', filters: [{ column: 'contentPillar', operator: 'contains' as const, value: 'Industry' }], keyword: '', sort: null },
  { label: 'Sample Pack Offers', filters: [{ column: 'offer', operator: 'contains' as const, value: 'Sample Pack' }], keyword: '', sort: null },
  { label: 'Pending Review', filters: [{ column: 'approvalStatus', operator: 'equals' as const, value: 'Pending Review' }], keyword: '', sort: null },
  { label: 'Approved', filters: [{ column: 'approvalStatus', operator: 'equals' as const, value: 'Approved' }], keyword: '', sort: null },
  { label: 'Not Started', filters: [{ column: 'setupStatus', operator: 'equals' as const, value: 'Not Started' }], keyword: '', sort: null },
];

// ─── Fuzzy String Normalization & Filtering Engine ───────────────────────────

function extractCellString(rawVal: any): string {
  if (rawVal == null) return '';
  if (typeof rawVal === 'object') {
    return String(rawVal.value ?? rawVal.label ?? rawVal.name ?? JSON.stringify(rawVal));
  }
  return String(rawVal);
}

function singularizeWord(word: string): string {
  let w = word.toLowerCase().trim();
  if (w.endsWith('ies') && w.length > 4) {
    return w.slice(0, -3) + 'y';
  }
  if (w.endsWith('es') && w.length > 3 && !w.endsWith('ss')) {
    return w.slice(0, -2);
  }
  if (w.endsWith('s') && w.length > 2 && !w.endsWith('ss')) {
    return w.slice(0, -1);
  }
  return w;
}

function tokenizeAndSingularize(text: string): string[] {
  if (!text) return [];
  const clean = text.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
  return clean.split(/\s+/).filter(Boolean).map(singularizeWord);
}

const FREE_TEXT_COLUMNS = new Set([
  'contentConcept', 'productionDirection', 'primaryText',
  'headlinesHooks', 'contentOnCreative', 'cta', 'hashtagsKeywords', 'notes'
]);

function fuzzyMatchValue(cellText: string, ruleValText: string, operator: string, isFreeTextCol: boolean): boolean {
  const cellNorm = cellText.toLowerCase().trim();
  const ruleNorm = ruleValText.toLowerCase().trim();

  if (operator === 'is_empty') {
    return cellNorm === '';
  }

  if (!cellNorm) return false;

  // Direct substring or exact match
  if (operator === 'equals' && cellNorm === ruleNorm) return true;
  if (operator === 'contains' && cellNorm.includes(ruleNorm)) return true;
  if (operator === 'not_equals') return cellNorm !== ruleNorm;

  // Tokenized singularized comparison (handles plurals, typos, partial word phrases)
  const cellTokens = tokenizeAndSingularize(cellText);
  const ruleTokens = tokenizeAndSingularize(ruleValText);

  if (ruleTokens.length === 0) return true;

  if (isFreeTextCol) {
    // For free-text fields: match if ANY query token appears in any cell token/substring
    return ruleTokens.some(rToken =>
      cellTokens.some(cToken => cToken.includes(rToken) || rToken.includes(cToken))
    );
  } else {
    // For dropdown fields: match if ALL rule tokens match at least one cell token
    return ruleTokens.every(rToken =>
      cellTokens.some(cToken => cToken.includes(rToken) || rToken.includes(cToken))
    );
  }
}

function applySmartFilters(
  rows: CampaignMatrixRow[],
  filters: SmartFilterRule[],
  keyword: string,
  sort: SmartSort | null
): CampaignMatrixRow[] {
  let result = rows;

  // Apply each filter rule with flexible fuzzy matching
  if (filters.length > 0) {
    const ALIASES: Record<string, string[]> = {
      contentPillar: ['pillar', 'content_pillar', 'contentPillar'],
      creativeType: ['creative_type', 'creativeType'],
      campaignType: ['campaign_type', 'campaignType'],
      primaryText: ['primary_copy', 'primaryCopy', 'primaryText'],
      contentOnCreative: ['script_outline', 'scriptOutline', 'contentOnCreative'],
      designDue: ['due_date', 'dueDate', 'designDue'],
      approvalStatus: ['approval_status', 'approvalStatus'],
      setupStatus: ['setup_status', 'setupStatus'],
      designOwner: ['design_owner', 'designOwner'],
    };
    result = result.filter(row => {
      return filters.every(rule => {
        const colAliases = ALIASES[rule.column] || [rule.column];
        let rawVal: any = undefined;
        for (const alias of colAliases) {
          if ((row as any)[alias] !== undefined && (row as any)[alias] !== null) {
            rawVal = (row as any)[alias];
            break;
          }
        }
        const cellText = extractCellString(rawVal);
        const isFreeText = FREE_TEXT_COLUMNS.has(rule.column);
        return fuzzyMatchValue(cellText, rule.value, rule.operator, isFreeText);
      });
    });
  }

  // Apply global keyword search with token singularization
  if (keyword.trim()) {
    const kwTokens = tokenizeAndSingularize(keyword);
    if (kwTokens.length > 0) {
      result = result.filter(row =>
        AVAILABLE_FILTER_COLUMNS.some(col => {
          const rawVal = (row as any)[col];
          const cellText = extractCellString(rawVal);
          if (!cellText) return false;
          const cellTokens = tokenizeAndSingularize(cellText);
          return kwTokens.some(kwToken =>
            cellTokens.some(cToken => cToken.includes(kwToken) || kwToken.includes(cToken))
          );
        })
      );
    }
  }

  // Apply sort
  if (sort && sort.column) {
    result = [...result].sort((a, b) => {
      const aVal = extractCellString((a as any)[sort.column]).toLowerCase();
      const bVal = extractCellString((b as any)[sort.column]).toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return sort.direction === 'desc' ? -cmp : cmp;
    });
  }

  return result;
}




const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  serial: 100,
  campaignType: 170,
  creativeType: 160,
  contentPillar: 180,
  contentConcept: 220,
  offer: 160,
  productionDirection: 280,
  primaryText: 340,
  headlinesHooks: 300,
  contentOnCreative: 320,
  cta: 160,
  hashtagsKeywords: 220,
  designOwner: 150,
  designDue: 110,
  approvalStatus: 150,
  setupStatus: 140,
  notes: 220,
  action: 70,
};

const DEFAULT_COLUMN_KEYS = [
  'serial',
  'campaignType',
  'creativeType',
  'contentPillar',
  'contentConcept',
  'offer',
  'productionDirection',
  'primaryText',
  'headlinesHooks',
  'contentOnCreative',
  'cta',
  'hashtagsKeywords',
  'designOwner',
  'designDue',
  'approvalStatus',
  'setupStatus',
  'notes',
  'action',
];

const DEFAULT_COLUMN_LABELS: Record<string, string> = {
  serial: 'Serial',
  campaignType: 'Campaign Type',
  creativeType: 'Creative Type',
  contentPillar: 'Content Pillar',
  contentConcept: 'Content Concept',
  offer: 'Offer',
  productionDirection: 'Production Direction',
  primaryText: 'Primary Text',
  headlinesHooks: 'Headlines',
  contentOnCreative: 'Content On Creative',
  cta: 'CTA',
  hashtagsKeywords: 'Hashtags & Keywords',
  designOwner: 'Design Owner',
  designDue: 'Design Due',
  approvalStatus: 'Approval Status',
  setupStatus: 'Setup Status',
  notes: 'Notes',
  action: 'Action',
};

interface CampaignProductionGridProps {
  selectedWorkspace?: Workspace | null;
  workspaces?: Workspace[];
}

export const CampaignProductionGrid: React.FC<CampaignProductionGridProps> = ({ selectedWorkspace }) => {
  const { addToast } = useToast();
  const { role } = useAuth();
  const isViewer = role === 'viewer';
  const [activeTab, setActiveTab] = useState<'production' | 'brand' | 'overview'>('production');

  // Zoom Controls State
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_matrix_zoom');
      if (saved) return Number(saved);
    } catch (e) {}
    return 100;
  });

  useEffect(() => {
    try {
      localStorage.setItem('reamarc_matrix_zoom', String(zoomLevel));
    } catch (e) {}
  }, [zoomLevel]);

  // Draggable Column Widths State & Mouse Drag logic
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_matrix_col_widths');
      if (saved) {
        return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) };
      }
    } catch (e) {}
    return DEFAULT_COLUMN_WIDTHS;
  });

  const [resizingCol, setResizingCol] = useState<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
  const columnWidthsRef = useRef(columnWidths);
  columnWidthsRef.current = columnWidths;

  const handleResizeStart = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(colKey);
    startXRef.current = e.clientX;
    startWidthRef.current = columnWidths[colKey] || 150;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (!resizingCol) return;
    let animationFrameId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        const diff = e.clientX - startXRef.current;
        const newWidth = Math.max(65, startWidthRef.current + diff);
        setColumnWidths((prev) => ({
          ...prev,
          [resizingCol]: newWidth,
        }));
      });
    };

    const handleMouseUp = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      setResizingCol(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem('reamarc_matrix_col_widths', JSON.stringify(columnWidthsRef.current));
      } catch (e) {}
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingCol]);

  const resetColumnWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    try {
      localStorage.removeItem('reamarc_matrix_col_widths');
    } catch (e) {}
  };

  // Draggable Horizontal Row Line Resizing State
  const DEFAULT_ROW_HEIGHT = 48;
  const [rowHeights, setRowHeights] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_matrix_row_heights');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  const [resizingRow, setResizingRow] = useState<string | null>(null);
  const startYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(0);
  const rowHeightsRef = useRef(rowHeights);
  rowHeightsRef.current = rowHeights;

  const handleRowResizeStart = (e: React.MouseEvent, rowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingRow(rowId);
    startYRef.current = e.clientY;
    startHeightRef.current = rowHeights[rowId] || DEFAULT_ROW_HEIGHT;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (!resizingRow) return;
    let animationFrameId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        const diff = e.clientY - startYRef.current;
        const newHeight = Math.max(36, Math.min(800, startHeightRef.current + diff));
        setRowHeights((prev) => ({
          ...prev,
          [resizingRow]: newHeight,
        }));
      });
    };

    const handleMouseUp = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      setResizingRow(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem('reamarc_matrix_row_heights', JSON.stringify(rowHeightsRef.current));
      } catch (e) {}
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingRow]);

  const resetRowHeights = () => {
    setRowHeights({});
    try {
      localStorage.removeItem('reamarc_matrix_row_heights');
    } catch (e) {}
  };

  const resetAllLayouts = () => {
    resetColumnWidths();
    resetRowHeights();
  };

  // Campaigns list & Active selection
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [isFetchingCampaigns, setIsFetchingCampaigns] = useState<boolean>(true);
  const [isLoadingMatrix, setIsLoadingMatrix] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Matrix rows state
  const [rows, setRows] = useState<CampaignMatrixRow[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; field: keyof CampaignMatrixRow; title: string; content: string } | null>(null);
  const [clientNotesRow, setClientNotesRow] = useState<{ serial: string; feedback: any } | null>(null);

  // Per-column filter state (empty array [] = show all options)
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({
    campaignType: [], creativeType: [], contentPillar: [],
    offer: [], cta: [], approvalStatus: [], setupStatus: [], designOwner: []
  });

  // Active column keys state (localStorage)
  const [columnKeys, setColumnKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('reamarc_matrix_column_keys');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_COLUMN_KEYS;
  });

  const totalTableWidth = columnKeys.reduce((sum: number, key: string) => sum + (columnWidths[key] || 160), 0);

  // Settings panel state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_matrix_column_labels');
      if (saved) {
        return { ...DEFAULT_COLUMN_LABELS, ...JSON.parse(saved) };
      }
    } catch {}
    return DEFAULT_COLUMN_LABELS;
  });
  const [newFieldInput, setNewFieldInput] = useState('');
  const [columnOptions, setColumnOptions] = useState<Record<string, string[]>>({
    campaignType: [...CAMPAIGN_TYPE_OPTIONS],
    creativeType: [...CREATIVE_TYPE_OPTIONS],
    contentPillar: [...CONTENT_PILLAR_OPTIONS],
    offer: [...OFFER_OPTIONS],
    cta: [...CTA_OPTIONS],
    approvalStatus: [...APPROVAL_STATUS_OPTIONS],
    setupStatus: [...SETUP_STATUS_OPTIONS],
    designOwner: [...DESIGN_OWNER_OPTIONS],
  });
  const [newOptionInputs, setNewOptionInputs] = useState<Record<string, string>>({});
  const [expandedSettingsSection, setExpandedSettingsSection] = useState<string | null>(null);
  const [draggedFieldKey, setDraggedFieldKey] = useState<string | null>(null);
  const [dragOverFieldKey, setDragOverFieldKey] = useState<string | null>(null);

  // Wizard modal state
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);

  // ─── Smart View State ─────────────────────────────────────────────────────────
  // 'master' | 'smart' | custom tab id
  const [matrixViewTab, setMatrixViewTab] = useState<string>('master');

  // NL query input
  const [smartPrompt, setSmartPrompt] = useState<string>('');
  const [isParsingQuery, setIsParsingQuery] = useState<boolean>(false);

  // Active AI-generated filter state
  const [smartFilters, setSmartFilters] = useState<SmartFilterRule[]>([]);
  const [smartSort, setSmartSort] = useState<SmartSort | null>(null);
  const [smartKeyword, setSmartKeyword] = useState<string>('');

  // Save-as-tab dialog
  const [isSaveTabOpen, setIsSaveTabOpen] = useState<boolean>(false);
  const [newTabName, setNewTabName] = useState<string>('');

  // Persistent custom tabs (localStorage)
  const [customTabs, setCustomTabs] = useState<CustomTab[]>(() => {
    try {
      const saved = localStorage.getItem('reamarc_matrix_custom_tabs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // State for currently-viewed custom tab's filters (so edits sync)
  const [customTabState, setCustomTabState] = useState<{
    filters: SmartFilterRule[];
    sort: SmartSort | null;
    keyword: string;
  } | null>(null);

  // Helper to normalize creativeType from backend/legacy strings to standard options
  const normalizeCreativeType = (val: string): string => {
    if (!val) return CREATIVE_TYPE_OPTIONS[0];
    if (CREATIVE_TYPE_OPTIONS.includes(val)) return val;
    const lower = val.toLowerCase();
    if (lower.includes('reel')) return 'Reel';
    if (lower.includes('video') || lower.includes('clip') || lower.includes('mp4')) return 'Video';
    if (lower.includes('carousel') || lower.includes('slide')) return 'Carousel';
    if (lower.includes('single image') || lower.includes('static') || lower.includes('banner') || lower.includes('graphic') || lower.includes('card')) return 'Static';
    if (lower.includes('ugc')) return 'UGC';
    if (lower.includes('story')) return 'Story';
    if (lower.includes('gif')) return 'GIF';
    if (lower.includes('lead magnet')) return 'Lead Magnet';
    if (lower.includes('testimonial')) return 'Testimonial';
    return CREATIVE_TYPE_OPTIONS[0];
  };

  // Helper to normalize contentPillar from backend/legacy strings to standard options
  const normalizeContentPillar = (val: string): string => {
    if (!val) return CONTENT_PILLAR_OPTIONS[0];
    if (CONTENT_PILLAR_OPTIONS.includes(val)) return val;
    const lower = val.toLowerCase();
    if (lower.includes('demand') || lower.includes('industry')) return 'Industry Demand';
    if (lower.includes('advantage') || lower.includes('production')) return 'Production Advantage';
    if (lower.includes('growth') || lower.includes('business')) return 'Business Growth';
    if (lower.includes('comparison') || lower.includes('compare')) return 'Comparison';
    if (lower.includes('product') || lower.includes('showcase') || lower.includes('solution')) return 'Product';
    if (lower.includes('success') || lower.includes('customer')) return 'Customer Success';
    if (lower.includes('educational') || lower.includes('education')) return 'Educational';
    if (lower.includes('partner')) return 'Partnership';
    return CONTENT_PILLAR_OPTIONS[0];
  };

  // Helper to normalize campaignType
  const normalizeCampaignType = (val: string): string => {
    if (!val) return CAMPAIGN_TYPE_OPTIONS[0];
    if (CAMPAIGN_TYPE_OPTIONS.includes(val)) return val;
    const lower = val.toLowerCase();
    const match = CAMPAIGN_TYPE_OPTIONS.find(opt => opt.toLowerCase().includes(lower) || lower.includes(opt.toLowerCase()));
    return match || CAMPAIGN_TYPE_OPTIONS[0];
  };

  // Helper to normalize offer
  const normalizeOffer = (val: string): string => {
    if (!val) return OFFER_OPTIONS[0];
    if (OFFER_OPTIONS.includes(val)) return val;
    const lower = val.toLowerCase();
    const match = OFFER_OPTIONS.find(opt => opt.toLowerCase().includes(lower) || lower.includes(opt.toLowerCase()));
    return match || OFFER_OPTIONS[0];
  };

  // Helper to normalize cta
  const normalizeCta = (val: string): string => {
    if (!val) return CTA_OPTIONS[0];
    if (CTA_OPTIONS.includes(val)) return val;
    const lower = val.toLowerCase();
    const match = CTA_OPTIONS.find(opt => opt.toLowerCase().includes(lower) || lower.includes(opt.toLowerCase()));
    return match || CTA_OPTIONS[0];
  };

  // Map backend matrix schema item to CampaignMatrixRow
  const mapBackendRowToMatrix = (raw: any, index: number): CampaignMatrixRow => {
    const numStr = (index + 1).toString().padStart(3, '0');
    const rawPillar = raw.pillar || raw.contentPillar || raw.content_pillar || '';
    const rawCreative = raw.creativeType || raw.creative_type || '';
    const rawCampaign = raw.campaignType || raw.campaign_type || '';
    const rawOffer = raw.offer || '';
    const rawCta = raw.cta || '';

    return {
      id: raw.id || `row-${index}`,
      serial: raw.serial || `AC-${numStr}`,
      campaignType: normalizeCampaignType(rawCampaign),
      creativeType: normalizeCreativeType(rawCreative),
      contentPillar: normalizeContentPillar(rawPillar),
      contentConcept: raw.contentConcept || raw.content_concept || raw.notes || 'Dynamic AI Generated Asset',
      offer: normalizeOffer(rawOffer),
      productionDirection: raw.productionDirection || raw.production_direction || 'High impact B2B visual direction',
      primaryText: raw.primaryCopy || raw.primaryText || raw.primary_copy || '',
      headlinesHooks: raw.headlinesHooks || `--- Hook 1 ---\n${raw.hookA || ''}\n\n--- Hook 2 ---\n${raw.hookB || ''}\n\n--- Hook 3 ---\n${raw.hookC || ''}`,
      contentOnCreative: raw.scriptOutline || raw.contentOnCreative || raw.script_outline || '',
      cta: normalizeCta(rawCta),
      hashtagsKeywords: raw.hashtagsKeywords || raw.hashtags_keywords || '#b2bgrowth #reamarcai',
      designOwner: raw.designOwner || raw.design_owner || 'Design Team',
      designDue: raw.dueDate || raw.designDue || raw.due_date || 'Wk 1',
      draftPreviewLink: raw.assetLink || raw.draftPreviewLink || raw.asset_link || '',
      finalAssetLink: raw.assetLink || raw.finalAssetLink || raw.asset_link || '',
      approvalStatus: raw.approvalStatus || raw.approval_status || 'Pending Review',
      setupStatus: raw.setupStatus || raw.setup_status || 'Not Started',
      notes: raw.notes || ''
    };
  };

  // Map CampaignMatrixRow to backend schema
  const mapMatrixRowToBackend = (row: CampaignMatrixRow) => {
    return {
      id: row.id,
      serial: row.serial,
      campaignType: row.campaignType,
      creativeType: row.creativeType,
      contentPillar: row.contentPillar,
      pillar: row.contentPillar,
      contentConcept: row.contentConcept,
      offer: row.offer,
      cta: row.cta,
      productionDirection: row.productionDirection,
      primaryText: row.primaryText,
      primaryCopy: row.primaryText,
      headlinesHooks: row.headlinesHooks,
      hookA: row.headlinesHooks.split('\n')[1] || '',
      hookB: row.headlinesHooks.split('\n')[5] || '',
      hookC: row.headlinesHooks.split('\n')[9] || '',
      contentOnCreative: row.contentOnCreative,
      scriptOutline: row.contentOnCreative,
      hashtagsKeywords: row.hashtagsKeywords,
      designOwner: row.designOwner,
      designDue: row.designDue,
      approvalStatus: row.approvalStatus,
      setupStatus: row.setupStatus,
      notes: row.notes,
      assetLink: row.finalAssetLink,
      dueDate: row.designDue,
    };
  };

  // Load user campaigns from MongoDB
  const loadCampaigns = useCallback(async () => {
    setIsFetchingCampaigns(true);
    try {
      const data = await campaignService.getCampaigns(selectedWorkspace?.id);
      setCampaigns(data || []);

      if (data && data.length > 0) {
        // If currently selected ID exists in data, keep it; otherwise select first
        setSelectedCampaignId((prevSelected) => {
          const exists = data.some((c) => c.id === prevSelected);
          const activeCamp = exists ? data.find((c) => c.id === prevSelected)! : data[0];

          if (activeCamp.matrixRows && activeCamp.matrixRows.length > 0) {
            setRows(activeCamp.matrixRows.map(mapBackendRowToMatrix));
          }
          return activeCamp.id;
        });
      } else {
        setSelectedCampaignId('');
        setRows([]);
      }
    } catch (err: any) {
      console.warn('Failed to load workspace campaigns:', err);
      setCampaigns([]);
      setSelectedCampaignId('');
      setRows([]);
    } finally {
      setIsFetchingCampaigns(false);
    }
  }, [selectedWorkspace]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Load matrix rows, custom layout, and custom tabs when selected campaign changes
  useEffect(() => {
    if (!selectedCampaignId) {
      setRows([]);
      setCustomTabs([]);
      setColumnKeys(DEFAULT_COLUMN_KEYS);
      setColumnLabels(DEFAULT_COLUMN_LABELS);
      setMatrixViewTab('master');
      return;
    }

    // Load Campaign-Specific Column Keys
    try {
      const savedKeys = localStorage.getItem(`reamarc_matrix_column_keys_${selectedCampaignId}`) || localStorage.getItem('reamarc_matrix_column_keys');
      if (savedKeys) {
        const parsed = JSON.parse(savedKeys);
        if (Array.isArray(parsed) && parsed.length > 0) setColumnKeys(parsed);
        else setColumnKeys(DEFAULT_COLUMN_KEYS);
      } else {
        setColumnKeys(DEFAULT_COLUMN_KEYS);
      }
    } catch {
      setColumnKeys(DEFAULT_COLUMN_KEYS);
    }

    // Load Campaign-Specific Column Labels
    try {
      const savedLabels = localStorage.getItem(`reamarc_matrix_column_labels_${selectedCampaignId}`) || localStorage.getItem('reamarc_matrix_column_labels');
      if (savedLabels) {
        setColumnLabels({ ...DEFAULT_COLUMN_LABELS, ...JSON.parse(savedLabels) });
      } else {
        setColumnLabels(DEFAULT_COLUMN_LABELS);
      }
    } catch {
      setColumnLabels(DEFAULT_COLUMN_LABELS);
    }

    // Load Campaign-Specific Custom Tabs
    try {
      const savedTabs = localStorage.getItem(`reamarc_matrix_custom_tabs_${selectedCampaignId}`);
      setCustomTabs(savedTabs ? JSON.parse(savedTabs) : []);
    } catch {
      setCustomTabs([]);
    }

    setMatrixViewTab('master');

    const fetchMatrixData = async () => {
      setIsLoadingMatrix(true);
      try {
        const res = await campaignService.getMatrix(selectedCampaignId);
        if (res && res.matrixRows && res.matrixRows.length > 0) {
          const mapped = res.matrixRows.map(mapBackendRowToMatrix);
          setRows(mapped);
        } else {
          const activeCamp = campaigns.find((c) => c.id === selectedCampaignId);
          if (activeCamp && activeCamp.matrixRows && activeCamp.matrixRows.length > 0) {
            setRows(activeCamp.matrixRows.map(mapBackendRowToMatrix));
          } else {
            setRows([]);
          }
        }
      } catch (err: any) {
        addToast('Matrix Load Failed', err.message || 'Could not load matrix rows.', 'warning');
      } finally {
        setIsLoadingMatrix(false);
      }
    };

    fetchMatrixData();
  }, [selectedCampaignId]);

  // Save rows to backend database
  const saveMatrixToDatabase = async (updatedRows: CampaignMatrixRow[]) => {
    if (!selectedCampaignId) return;
    setIsSaving(true);
    try {
      const backendPayload = updatedRows.map(mapMatrixRowToBackend);
      await campaignService.updateMatrix(selectedCampaignId, backendPayload);
    } catch (err: any) {
      console.warn('Matrix persistence failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Excel Export Handler
  const handleExportXLSX = () => {
    if (rows.length === 0) {
      addToast('No Data to Export', 'Please select or generate a campaign matrix first.', 'warning');
      return;
    }

    try {
      const exportData = rows.map((r) => ({
        'Serial': r.serial,
        'Campaign Type': r.campaignType,
        'Creative Type': r.creativeType,
        'Content Pillar / Theme': r.contentPillar,
        'Content Concept': r.contentConcept,
        'Offer': r.offer,
        'Production Direction': r.productionDirection,
        'Primary Text (ad copy)': r.primaryText,
        'Headlines / Hooks': r.headlinesHooks,
        'Content On Creative': r.contentOnCreative,
        'CTA': r.cta,
        'Captions / Hashtags / Keywords': r.hashtagsKeywords,
        'Design Owner': r.designOwner,
        'Design Due': r.designDue,
        'Draft / Preview Link': r.draftPreviewLink,
        'Final Asset Link': r.finalAssetLink,
        'Approval Status': r.approvalStatus,
        'Setup Status': r.setupStatus,
        'Notes': r.notes,
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Production & Approval');

      // Add Brand & Profile Sheet
      const brandData = [
        { Category: 'Business Details', Field: 'Official Business Name', Value: 'Apex Transfers LLC' },
        { Category: 'Business Details', Field: 'Tagline / Slogan', Value: 'Decorate with Confidence' },
        { Category: 'Business Details', Field: 'Registered Address', Value: '9785 Gateway Road, Elk River, MN 55330' },
        { Category: 'Business Details', Field: 'Contact Numbers', Value: '1.877.935.7766 or 763.241.4634' },
        { Category: 'Business Details', Field: 'Sales Email', Value: 'orders@apextransfers.com' },
        { Category: 'Business Details', Field: 'Website URL', Value: 'www.apextransfers.com' },
      ];
      const brandSheet = XLSX.utils.json_to_sheet(brandData);
      XLSX.utils.book_append_sheet(workbook, brandSheet, 'Brand & Profile');

      const activeCampTitle = campaigns.find(c => c.id === selectedCampaignId)?.title || 'Campaign';
      const cleanTitle = activeCampTitle.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${cleanTitle}_Production_Matrix_${new Date().toISOString().split('T')[0]}.xlsx`;

      XLSX.writeFile(workbook, filename);
      addToast('Excel Downloaded! 📊', `Exported "${filename}".`, 'success');
    } catch (err: any) {
      console.error('XLSX Export Error:', err);
      try {
        const headers = ['Serial', 'Campaign Type', 'Creative Type', 'Content Pillar', 'Content Concept', 'Offer', 'Primary Text', 'CTA', 'Approval Status', 'Setup Status'];
        const csvRows = [headers.join(',')];
        rows.forEach(r => {
          const rowVals = [
            `"${r.serial}"`,
            `"${r.campaignType}"`,
            `"${r.creativeType}"`,
            `"${r.contentPillar}"`,
            `"${(r.contentConcept || '').replace(/"/g, '""')}"`,
            `"${r.offer}"`,
            `"${(r.primaryText || '').replace(/"/g, '""')}"`,
            `"${r.cta}"`,
            `"${r.approvalStatus}"`,
            `"${r.setupStatus}"`,
          ];
          csvRows.push(rowVals.join(','));
        });
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Campaign_Matrix_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addToast('CSV Downloaded 📊', 'Exported production matrix spreadsheet as CSV.', 'success');
      } catch (fallbackErr: any) {
        addToast('Export Failed', err.message || 'Could not generate spreadsheet file.', 'error');
      }
    }
  };

  // Add New Row
  const handleAddRow = () => {
    if (!selectedCampaignId) {
      setIsWizardOpen(true);
      return;
    }
    const nextSerialNum = rows.length + 1;
    const serialStr = `AC-${nextSerialNum.toString().padStart(3, '0')}`;
    const newRow: CampaignMatrixRow = {
      id: `row-${Date.now()}`,
      serial: serialStr,
      campaignType: CAMPAIGN_TYPE_OPTIONS[0],
      creativeType: CREATIVE_TYPE_OPTIONS[0],
      contentPillar: CONTENT_PILLAR_OPTIONS[0],
      contentConcept: 'New Campaign Angle',
      offer: OFFER_OPTIONS[0],
      productionDirection: 'Describe visual style, pacing, and mood notes...',
      primaryText: '--- Version A ---\nInsert your primary copy here...',
      headlinesHooks: '--- Hooks ---\nHook 1: Insert catchy hook here...',
      contentOnCreative: 'On-Screen Headline & Visual Script Breakdown...',
      cta: CTA_OPTIONS[0],
      hashtagsKeywords: '#b2bgrowth #reamarcai',
      designOwner: 'Design Team',
      designDue: 'Wk 1',
      draftPreviewLink: '',
      finalAssetLink: '',
      approvalStatus: 'Pending Review',
      setupStatus: 'Not Started',
      notes: ''
    };
    const updated = [...rows, newRow];
    setRows(updated);
    saveMatrixToDatabase(updated);
  };

  // Update Field Helper by unique row id
  const updateRowField = (rowId: string, field: keyof CampaignMatrixRow, value: string) => {
    const updated = rows.map((r) => (r.id === rowId ? { ...r, [field]: value } : r));
    setRows(updated);
    saveMatrixToDatabase(updated);
  };

  // Delete Row by unique row id
  const handleDeleteRow = (rowId: string) => {
    const rowToDelete = rows.find((r) => r.id === rowId);
    const updated = rows.filter((r) => r.id !== rowId);
    setRows(updated);
    saveMatrixToDatabase(updated);
    addToast('Row Deleted 🗑️', `Removed asset row ${rowToDelete?.serial || ''}.`, 'info');
  };

  // Handle Wizard Generation Result
  const handleLaunchFromWizard = async (payload: any) => {
    addToast('Generating Master Matrix...', 'Gemini AI is generating dynamic matrix rows.', 'info');
    try {
      const created = await campaignService.generateMatrix(payload);
      addToast('Matrix Created! 🚀', `Generated ${created.matrixRows?.length || created.totalDays} creative rows for "${created.title}".`, 'success');
      await loadCampaigns();
      setSelectedCampaignId(created.id);
      if (created.matrixRows && created.matrixRows.length > 0) {
        const mapped = created.matrixRows.map(mapBackendRowToMatrix);
        setRows(mapped);
      }
    } catch (err: any) {
      addToast('Matrix Generation Failed', err.message || 'Could not generate matrix.', 'error');
    }
  };

  // Field aliases for robust backend property matching
  const FIELD_ALIASES: Record<string, string[]> = {
    contentPillar: ['pillar', 'content_pillar', 'contentPillar'],
    creativeType: ['creative_type', 'creativeType'],
    campaignType: ['campaign_type', 'campaignType'],
    primaryText: ['primary_copy', 'primaryCopy', 'primaryText'],
    contentOnCreative: ['script_outline', 'scriptOutline', 'contentOnCreative'],
    designDue: ['due_date', 'dueDate', 'designDue'],
    approvalStatus: ['approval_status', 'approvalStatus'],
    setupStatus: ['setup_status', 'setupStatus'],
    designOwner: ['design_owner', 'designOwner'],
  };

  // Multi-column filter logic with fuzzy fallback & normalization for robust matching
  const activeFilterCount = Object.values(columnFilters).filter(v => v && v.length > 0).length;
  const filteredRows = rows.filter(row =>
    Object.entries(columnFilters).every(([field, selectedOpts]) => {
      if (!selectedOpts || selectedOpts.length === 0) return true;

      const aliases = FIELD_ALIASES[field] || [field];
      let rawVal: any = undefined;
      for (const alias of aliases) {
        if ((row as any)[alias] !== undefined && (row as any)[alias] !== null) {
          rawVal = (row as any)[alias];
          break;
        }
      }

      let cellText = extractCellString(rawVal);

      if (field === 'contentPillar') cellText = normalizeContentPillar(cellText);
      else if (field === 'creativeType') cellText = normalizeCreativeType(cellText);
      else if (field === 'campaignType') cellText = normalizeCampaignType(cellText);
      else if (field === 'offer') cellText = normalizeOffer(cellText);
      else if (field === 'cta') cellText = normalizeCta(cellText);

      return selectedOpts.some(opt =>
        opt === cellText || fuzzyMatchValue(cellText, opt, 'contains', false)
      );
    })
  );

  // Settings field & column management helpers (Scoped per Campaign)
  const updateColumnKeys = (nextKeys: string[]) => {
    setColumnKeys(nextKeys);
    if (selectedCampaignId) {
      try {
        localStorage.setItem(`reamarc_matrix_column_keys_${selectedCampaignId}`, JSON.stringify(nextKeys));
      } catch {}
    }
  };

  const updateColumnLabels = (updater: (prev: Record<string, string>) => Record<string, string>) => {
    setColumnLabels(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (selectedCampaignId) {
        try {
          localStorage.setItem(`reamarc_matrix_column_labels_${selectedCampaignId}`, JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  const persistCustomTabs = (tabs: CustomTab[]) => {
    if (selectedCampaignId) {
      try {
        localStorage.setItem(`reamarc_matrix_custom_tabs_${selectedCampaignId}`, JSON.stringify(tabs));
      } catch {}
    }
  };

  const handleAddNewField = () => {
    const label = newFieldInput.trim();
    if (!label) {
      addToast('Field Name Required', 'Please enter a title for the new field.', 'warning');
      return;
    }
    const slug = label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    const fieldKey = `custom_${slug}_${Date.now().toString().slice(-4)}`;

    const newKeys = [...columnKeys];
    const actionIndex = newKeys.indexOf('action');
    if (actionIndex !== -1) {
      newKeys.splice(actionIndex, 0, fieldKey);
    } else {
      newKeys.push(fieldKey);
    }

    updateColumnKeys(newKeys);
    updateColumnLabels(prev => ({ ...prev, [fieldKey]: label }));
    setColumnWidths(prev => ({ ...prev, [fieldKey]: 170 }));
    setNewFieldInput('');
    addToast('Field Added 🚀', `Added custom field "${label}".`, 'success');
  };

  const handleRemoveField = (fieldKey: string) => {
    if (fieldKey === 'action' || fieldKey === 'serial') {
      addToast('System Column', `The "${columnLabels[fieldKey] || fieldKey}" column cannot be removed.`, 'warning');
      return;
    }
    const label = columnLabels[fieldKey] || fieldKey;
    const newKeys = columnKeys.filter(k => k !== fieldKey);
    updateColumnKeys(newKeys);
    addToast('Field Removed 🗑️', `Removed "${label}" field from matrix view.`, 'info');
  };

  const handleResetFieldsToDefault = () => {
    updateColumnKeys(DEFAULT_COLUMN_KEYS);
    updateColumnLabels(() => DEFAULT_COLUMN_LABELS);
    if (selectedCampaignId) {
      try {
        localStorage.removeItem(`reamarc_matrix_column_keys_${selectedCampaignId}`);
        localStorage.removeItem(`reamarc_matrix_column_labels_${selectedCampaignId}`);
      } catch {}
    }
    addToast('Fields Reset 🔄', 'Restored all matrix fields to default layout.', 'info');
  };

  const handleFieldDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedFieldKey(key);
  };

  const handleFieldDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverFieldKey !== key) {
      setDragOverFieldKey(key);
    }
  };

  const handleFieldDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    const sourceKey = draggedFieldKey || e.dataTransfer.getData('text/plain');
    if (!sourceKey || sourceKey === targetKey) {
      setDraggedFieldKey(null);
      setDragOverFieldKey(null);
      return;
    }

    const fromIndex = columnKeys.indexOf(sourceKey);
    const toIndex = columnKeys.indexOf(targetKey);
    if (fromIndex !== -1 && toIndex !== -1) {
      const newKeys = [...columnKeys];
      const [moved] = newKeys.splice(fromIndex, 1);
      newKeys.splice(toIndex, 0, moved);
      updateColumnKeys(newKeys);
    }
    setDraggedFieldKey(null);
    setDragOverFieldKey(null);
  };

  const handleFieldDragEnd = () => {
    setDraggedFieldKey(null);
    setDragOverFieldKey(null);
  };

  const handleMoveFieldOrder = (key: string, direction: 'up' | 'down') => {
    const index = columnKeys.indexOf(key);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columnKeys.length) return;

    const newKeys = [...columnKeys];
    const [moved] = newKeys.splice(index, 1);
    newKeys.splice(targetIndex, 0, moved);
    updateColumnKeys(newKeys);
  };

  const addOption = (col: string) => {
    const val = (newOptionInputs[col] || '').trim();
    if (!val) return;
    setColumnOptions(prev => ({ ...prev, [col]: [...(prev[col] || []), val] }));
    setNewOptionInputs(prev => ({ ...prev, [col]: '' }));
  };
  const removeOption = (col: string, opt: string) => {
    setColumnOptions(prev => ({ ...prev, [col]: (prev[col] || []).filter(o => o !== opt) }));
  };
  const setFilter = (col: string, vals: string[]) =>
    setColumnFilters(prev => ({ ...prev, [col]: vals }));
  const removeFilterValue = (col: string, val: string) =>
    setColumnFilters(prev => ({ ...prev, [col]: (prev[col] || []).filter(v => v !== val) }));
  const clearAllFilters = () =>
    setColumnFilters({
      campaignType: [], creativeType: [], contentPillar: [],
      offer: [], cta: [], approvalStatus: [], setupStatus: [], designOwner: []
    });

  // ─── Smart View Handlers ─────────────────────────────────────────────────────

  const handleParseQuery = async () => {
    const prompt = smartPrompt.trim();
    if (!prompt) {
      addToast('Empty Prompt', 'Please describe the view you want to see.', 'warning');
      return;
    }
    setIsParsingQuery(true);
    try {
      const schemaOptions: Record<string, string[]> = {
        campaignType: columnOptions.campaignType || [],
        creativeType: columnOptions.creativeType || [],
        contentPillar: columnOptions.contentPillar || [],
        offer: columnOptions.offer || [],
        approvalStatus: columnOptions.approvalStatus || [],
        setupStatus: columnOptions.setupStatus || [],
        designOwner: columnOptions.designOwner || [],
      };

      const result = await matrixService.parseQuery(prompt, AVAILABLE_FILTER_COLUMNS, schemaOptions);
      setSmartFilters(result.filters);
      setSmartSort(result.sort);
      setSmartKeyword(result.search_keyword || '');
      if (result.filters.length === 0 && !result.search_keyword && !result.sort) {
        addToast('No Filters Found', 'AI could not extract filter rules. Try rephrasing your query.', 'warning');
      } else {
        addToast('Smart View Generated ✨', `Applied ${result.filters.length} filter rule${result.filters.length !== 1 ? 's' : ''}${result.search_keyword ? ` + keyword "${result.search_keyword}"` : ''}.`, 'success');
      }
    } catch (err: any) {
      addToast('Query Failed', err.message || 'Could not parse AI query.', 'warning');
    } finally {
      setIsParsingQuery(false);
    }
  };


  const applyPreset = (preset: typeof SMART_PRESETS[0]) => {
    setSmartFilters(preset.filters);
    setSmartSort(preset.sort);
    setSmartKeyword(preset.keyword);
    setSmartPrompt('');
    setMatrixViewTab('smart');
  };

  const removeSmartFilter = (index: number) => {
    setSmartFilters(prev => prev.filter((_, i) => i !== index));
  };

  const clearSmartFilters = () => {
    setSmartFilters([]);
    setSmartSort(null);
    setSmartKeyword('');
    setSmartPrompt('');
  };

  const handleSaveCustomTab = () => {
    const name = newTabName.trim();
    if (!name) {
      addToast('Name Required', 'Please enter a name for this tab.', 'warning');
      return;
    }
    const newTab: CustomTab = {
      id: `tab-${Date.now()}`,
      name,
      filters: smartFilters,
      sort: smartSort,
      keyword: smartKeyword,
      createdAt: new Date().toISOString(),
    };
    const updated = [...customTabs, newTab];
    setCustomTabs(updated);
    persistCustomTabs(updated);
    setMatrixViewTab(newTab.id);
    setCustomTabState({ filters: smartFilters, sort: smartSort, keyword: smartKeyword });
    setIsSaveTabOpen(false);
    setNewTabName('');
    addToast('Tab Saved! 📌', `Custom view "${name}" saved and pinned.`, 'success');
  };

  const handleDeleteCustomTab = (tabId: string) => {
    const updated = customTabs.filter(t => t.id !== tabId);
    setCustomTabs(updated);
    persistCustomTabs(updated);
    if (matrixViewTab === tabId) {
      setMatrixViewTab('master');
    }
  };

  const switchToCustomTab = (tab: CustomTab) => {
    setMatrixViewTab(tab.id);
    setCustomTabState({ filters: tab.filters, sort: tab.sort, keyword: tab.keyword });
  };

  // Derive Smart View rows from master data
  const getActiveSmartState = () => {
    if (matrixViewTab === 'smart') {
      return { filters: smartFilters, sort: smartSort, keyword: smartKeyword };
    }
    if (matrixViewTab !== 'master') {
      const customTab = customTabs.find(t => t.id === matrixViewTab);
      if (customTab) {
        return customTabState || { filters: customTab.filters, sort: customTab.sort, keyword: customTab.keyword };
      }
    }
    return null;
  };

  const activeSmartState = getActiveSmartState();
  const smartViewRows = activeSmartState
    ? applySmartFilters(rows, activeSmartState.filters, activeSmartState.keyword, activeSmartState.sort)
    : rows;

  // Which rows to render in the table (Smart View uses smartViewRows, Master uses filteredRows)
  const displayRows = (matrixViewTab === 'master') ? filteredRows : smartViewRows;

  // Status Badges Styling (Light & Dark Adaptive)
  const getApprovalBadge = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
      case 'Review Content':
      case 'Review Concept':
      case 'Pending Review':
        return 'bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/30';
      case 'Revision Needed':
        return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600';
    }
  };

  const getSetupBadge = (status: string) => {
    switch (status) {
      case 'Live':
        return 'bg-cyan-500/10 text-cyan-800 dark:text-cyan-400 border-cyan-500/30';
      case 'In Setup':
        return 'bg-blue-500/10 text-blue-800 dark:text-blue-400 border-blue-500/30';
      case 'Paused':
        return 'bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/30';
      default:
        return 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-400 border-slate-300 dark:border-slate-600';
    }
  };

return (
    <div className="flex flex-col h-full min-w-0 bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 p-6 overflow-hidden transition-colors relative">
      {/* Active Drag Overlay to capture fast mouse movements smoothly without pointer interruption */}
      {resizingRow && (
        <div className="fixed inset-0 z-[9999] cursor-row-resize select-none bg-transparent" />
      )}
      {resizingCol && (
        <div className="fixed inset-0 z-[9999] cursor-col-resize select-none bg-transparent" />
      )}

      {/* Top Header & Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Production & Approval Matrix</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-500/10 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                  Enterprise AI Engine
                </span>
                {selectedCampaignId && (
                  isSaving ? (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-mono">
                      <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400/80 flex items-center gap-1 font-mono">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Synced to DB
                    </span>
                  )
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Dynamic LLM Campaign Matrix • {campaigns.length > 0 ? `${rows.length} Total Asset Rows` : 'No Saved Campaigns'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Campaign Matrix Dropdown Selector */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900/80 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 pl-2">Campaign:</span>
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              disabled={campaigns.length === 0}
              className="bg-slate-100 dark:bg-slate-950 text-teal-700 dark:text-teal-300 text-xs font-bold border border-slate-300 dark:border-slate-700/60 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-500 max-w-[220px] truncate cursor-pointer disabled:opacity-50"
            >
              {campaigns.length === 0 ? (
                <option value="">No Campaigns Found</option>
              ) : (
                campaigns.map((c) => (
                  <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {c.title} ({c.totalDays || c.matrixRows?.length || 0} Assets)
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Stats chips */}
          {rows.length > 0 && (
            <div className="hidden lg:flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold border border-emerald-500/20">
                ✓ {rows.filter(r => r.approvalStatus === 'Approved').length} Approved
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] font-semibold border border-amber-500/20">
                ⏳ {rows.filter(r => r.approvalStatus?.includes('Review')).length} In Review
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 text-[11px] font-semibold border border-cyan-500/20">
                🟢 {rows.filter(r => r.setupStatus === 'Live').length} Live
              </span>
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex items-center bg-white dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <button
              onClick={() => setActiveTab('production')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${activeTab === 'production'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Production Matrix
            </button>
            <button
              onClick={() => setActiveTab('brand')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${activeTab === 'brand'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Brand & Profile
            </button>
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${activeTab === 'overview'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Overview & Rollup
            </button>
          </div>

          {!isViewer && (
            <button
              onClick={() => setIsWizardOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              New AI Matrix
            </button>
          )}

          {!isViewer && (
            <button
              onClick={handleAddRow}
              disabled={campaigns.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-teal-700 dark:text-teal-300 text-xs font-semibold transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add Row
            </button>
          )}

          <button
            onClick={handleExportXLSX}
            disabled={rows.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white text-xs font-semibold shadow-lg shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export (.xlsx)
          </button>

          {/* Reset Layout button */}
          <button
            onClick={resetAllLayouts}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-300 text-xs font-semibold transition-all shadow-sm cursor-pointer"
            title="Reset all draggable column widths & row heights to default"
          >
            <MoveHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Reset Layout</span>
          </button>

          {/* Settings button */}
          {!isViewer && (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold transition-all shadow-sm cursor-pointer"
              title="Matrix Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>


      {/* Main Content Area */}
      {activeTab === 'production' && (
        <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl dark:shadow-2xl relative overflow-hidden">
          {/* Loading Matrix Overlay */}
          {(isFetchingCampaigns || isLoadingMatrix) && (
            <div className="absolute inset-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm z-40 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-teal-600 dark:text-teal-400 animate-spin" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {isFetchingCampaigns ? 'Fetching Saved Campaigns...' : 'Loading Campaign Matrix Rows...'}
              </p>
            </div>
          )}

          {/* Empty State View */}
          {!isFetchingCampaigns && campaigns.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-5 bg-slate-50/50 dark:bg-slate-950/40">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/20 to-indigo-500/20 border border-teal-500/30 text-teal-600 dark:text-teal-400 flex items-center justify-center shadow-lg">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">No Campaign Matrix Found</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {isViewer
                    ? "No campaign production matrices have been generated for this workspace yet."
                    : "You haven't generated any campaign production matrices for this workspace yet. Launch your first AI matrix to start generating multi-variant ad copy, hooks, and production directives."}
                </p>
              </div>
              {!isViewer && (
                <button
                  onClick={() => setIsWizardOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-400 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-teal-500/20 transition-all transform hover:scale-[1.02] cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  + Create Your First AI Matrix
                </button>
              )}
            </div>
          ) : (
            <>
              {/* ─── Matrix Sub-Tab Navigation Bar ───────────────────────── */}

              <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/60 rounded-t-2xl overflow-x-auto">
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* Master View Tab */}
                  <button
                    onClick={() => setMatrixViewTab('master')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      matrixViewTab === 'master'
                        ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    Master View
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      matrixViewTab === 'master'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}>
                      {rows.length}
                    </span>
                  </button>

                  {/* Smart View Tab */}
                  <button
                    onClick={() => setMatrixViewTab('smart')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      matrixViewTab === 'smart'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Brain className="w-3.5 h-3.5" />
                    Smart AI View
                    {smartFilters.length > 0 && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        matrixViewTab === 'smart'
                          ? 'bg-white/20 text-white'
                          : 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
                      }`}>
                        {smartViewRows.length}
                      </span>
                    )}
                  </button>

                  {/* Divider */}
                  {customTabs.length > 0 && (
                    <div className="w-px h-5 bg-slate-300 dark:bg-slate-700 mx-1 flex-shrink-0" />
                  )}

                  {/* Custom Saved Tabs */}
                  {customTabs.map(tab => {
                    const isTabActive = matrixViewTab === tab.id;
                    const tabRowCount = applySmartFilters(rows, tab.filters, tab.keyword, tab.sort).length;
                    return (
                      <div key={tab.id} className="relative group flex-shrink-0">
                        <button
                          onClick={() => switchToCustomTab(tab)}
                          className={`flex items-center gap-2 pl-3.5 pr-8 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                            isTabActive
                              ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <PanelTop className="w-3.5 h-3.5" />
                          {tab.name}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            isTabActive
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}>
                            {tabRowCount}
                          </span>
                        </button>
                        {/* Delete custom tab button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCustomTab(tab.id); }}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-md transition-colors cursor-pointer ${
                            isTabActive
                              ? 'text-white/70 hover:text-white hover:bg-white/20'
                              : 'text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100'
                          }`}
                          title={`Delete tab "${tab.name}"`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Sub-tab view status info */}
                <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  {matrixViewTab === 'master' ? (
                    <span className="flex items-center gap-1.5 text-teal-600 dark:text-teal-400 font-semibold bg-teal-500/10 border border-teal-500/20 px-2.5 py-1 rounded-lg">
                      <Table2 className="w-3 h-3" /> Unfiltered Central Matrix
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg">
                      <Brain className="w-3 h-3" /> AI Dynamic Smart View
                    </span>
                  )}
                </div>
              </div>

              {/* ─── Smart Filter Bar (visible in Smart View and custom tabs) ─ */}
              {matrixViewTab !== 'master' && (
                <div className="flex flex-col gap-3.5 px-6 py-4 bg-gradient-to-b from-indigo-50/70 via-slate-50/50 to-transparent dark:from-indigo-950/40 dark:via-slate-900/30 dark:to-transparent border-b border-slate-200/80 dark:border-slate-800">
                  {/* NL Prompt Row */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
                    <div className="flex-1 min-w-[280px] flex items-center gap-2.5 bg-white dark:bg-slate-900/90 border border-indigo-200 dark:border-indigo-800/80 rounded-xl px-3.5 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-500 transition-all">
                      <Sparkles className="w-4 h-4 text-indigo-500 flex-shrink-0 animate-pulse" />
                      <input
                        type="text"
                        value={smartPrompt}
                        onChange={e => setSmartPrompt(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleParseQuery(); }}
                        placeholder="Describe your view... (e.g., 'Show all Video assets with Industry Demand pillar')"
                        className="flex-1 text-xs text-slate-800 dark:text-slate-100 bg-transparent outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium"
                      />
                      {smartPrompt && (
                        <button onClick={() => setSmartPrompt('')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleParseQuery}
                        disabled={isParsingQuery || !smartPrompt.trim()}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {isParsingQuery ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
                        ) : (
                          <><Sparkles className="w-4 h-4" /> Generate View</>
                        )}
                      </button>

                      <button
                        onClick={() => setIsSaveTabOpen(true)}
                        disabled={smartFilters.length === 0 && !smartKeyword && !smartSort}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 text-xs font-bold transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                        title="Save current filters as a tab view"
                      >
                        <BookmarkPlus className="w-4 h-4 text-violet-500" />
                        <span className="hidden sm:inline">Save View Tab</span>
                      </button>

                      {(smartFilters.length > 0 || smartKeyword || smartSort) && (
                        <button
                          onClick={clearSmartFilters}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                          title="Clear all smart view filters"
                        >
                          <RefreshCcw className="w-3.5 h-3.5" /> Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Preset Quick Chips */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" /> Quick Filter Presets:
                    </span>
                    {SMART_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        onClick={() => applyPreset(preset)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-medium transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Applied Filter Pills Header */}
                  {(smartFilters.length > 0 || smartKeyword || smartSort) && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        <Filter className="w-3.5 h-3.5 text-indigo-500" />
                        Active Rules ({smartViewRows.length} of {rows.length} rows match):
                      </span>
                      {smartFilters.map((rule, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100/80 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-200 text-xs font-medium border border-indigo-300/80 dark:border-indigo-800 shadow-2xs"
                        >
                          <span className="font-bold opacity-75">{rule.column}:</span>
                          <span>{rule.operator === 'is_empty' ? 'is empty' : `${rule.operator} "${rule.value}"`}</span>
                          <button
                            onClick={() => removeSmartFilter(idx)}
                            className="ml-1 hover:bg-indigo-200 dark:hover:bg-indigo-800 rounded-full p-0.5 transition-colors cursor-pointer text-indigo-600 dark:text-indigo-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      {smartKeyword && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100/80 dark:bg-violet-950 text-violet-900 dark:text-violet-200 text-xs font-medium border border-violet-300/80 dark:border-violet-800 shadow-2xs">
                          <Search className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                          keyword: "{smartKeyword}"
                          <button onClick={() => setSmartKeyword('')} className="ml-1 hover:bg-violet-200 dark:hover:bg-violet-800 rounded-full p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
                        </span>
                      )}
                      {smartSort && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100/80 dark:bg-teal-950 text-teal-900 dark:text-teal-200 text-xs font-medium border border-teal-300/80 dark:border-teal-800 shadow-2xs">
                          ↕ sort: {smartSort.column} ({smartSort.direction})
                          <button onClick={() => setSmartSort(null)} className="ml-1 hover:bg-teal-200 dark:hover:bg-teal-800 rounded-full p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Save Tab Dialog */}
                  {isSaveTabOpen && (
                    <div className="flex items-center gap-3 mt-1 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-violet-300 dark:border-violet-800 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                      <BookmarkPlus className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                      <input
                        type="text"
                        value={newTabName}
                        onChange={e => setNewTabName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveCustomTab(); if (e.key === 'Escape') setIsSaveTabOpen(false); }}
                        placeholder="Enter custom view tab name... (e.g., 'Video Creatives View')"
                        className="flex-1 text-xs text-slate-800 dark:text-slate-100 bg-transparent outline-none font-semibold placeholder:font-normal placeholder:text-slate-400"
                        autoFocus
                      />
                      <button onClick={handleSaveCustomTab} className="px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-sm cursor-pointer">Save View Tab</button>
                      <button onClick={() => { setIsSaveTabOpen(false); setNewTabName(''); }} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold cursor-pointer">Cancel</button>
                    </div>
                  )}
                </div>
              )}


              {/* Active Filters & Column Widths Control Bar (Master View only) */}
              {matrixViewTab === 'master' && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2 bg-teal-50 dark:bg-teal-950/40 border-b border-teal-200 dark:border-teal-800/60 text-xs">
                {activeFilterCount > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span className="text-teal-700 dark:text-teal-300 font-semibold">{activeFilterCount} column filter{activeFilterCount > 1 ? 's' : ''} active</span>
                      <span className="text-teal-600 dark:text-teal-400">— showing {filteredRows.length} of {rows.length} rows</span>
                    </div>


                    {/* Active Filter Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 ml-2">
                      {Object.entries(columnFilters).flatMap(([col, selectedOpts]) =>
                        selectedOpts.map((val) => (
                          <span
                            key={`${col}-${val}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 text-[10px] font-medium border border-teal-300 dark:border-teal-700/60 shadow-sm"
                          >
                            <span className="font-bold opacity-75">{columnLabels[col] || col}:</span>
                            <span>{val}</span>
                            <button
                              type="button"
                              onClick={() => removeFilterValue(col, val)}
                              className="hover:bg-rose-100 dark:hover:bg-rose-900/50 hover:text-rose-600 dark:hover:text-rose-400 rounded p-0.5 transition-colors cursor-pointer ml-0.5"
                              title={`Remove ${val} filter`}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <MoveHorizontal className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>Drag vertical lines (columns) &amp; horizontal lines (rows) to resize</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 ml-auto">
                  {/* Grid Zoom Toolbar */}
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-teal-200 dark:border-teal-800/80 shadow-2xs">
                    <button
                      onClick={() => setZoomLevel((prev) => Math.max(50, prev - 10))}
                      className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer rounded"
                      title="Zoom Out Grid"
                    >
                      <ZoomOut className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 min-w-[32px] text-center">
                      {zoomLevel}%
                    </span>
                    <button
                      onClick={() => setZoomLevel((prev) => Math.min(150, prev + 10))}
                      className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer rounded"
                      title="Zoom In Grid"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                    {zoomLevel !== 100 && (
                      <button
                        onClick={() => setZoomLevel(100)}
                        className="px-1 text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50 rounded cursor-pointer"
                        title="Reset Zoom"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <button
                    onClick={resetColumnWidths}
                    className="flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-300 font-medium cursor-pointer transition-colors text-[11px]"
                    title="Reset all column widths to default"
                  >
                    <MoveHorizontal className="w-3 h-3" /> Reset widths
                  </button>
                  <button
                    onClick={resetRowHeights}
                    className="flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-300 font-medium cursor-pointer transition-colors text-[11px]"
                    title="Reset all row heights to default"
                  >
                    <MoveVertical className="w-3 h-3" /> Reset heights
                  </button>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearAllFilters}
                      className="flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:text-rose-600 dark:hover:text-rose-400 font-medium cursor-pointer text-[11px] transition-colors"
                    >
                      <RefreshCcw className="w-3 h-3" /> Clear all filters
                    </button>
                  )}
                </div>
              </div>
              )} {/* end matrixViewTab === 'master' filter bar */}


              {/* Interactive Matrix Grid */}
              <div className="matrix-grid-scroll flex-1 min-h-0 overflow-x-auto overflow-y-auto w-full relative pb-16">
                <div
                  style={{
                    transform: `scale(${zoomLevel / 100})`,
                    transformOrigin: 'top left',
                    width: `${(totalTableWidth * 100) / zoomLevel}px`,
                    minWidth: `${(totalTableWidth * 100) / zoomLevel}px`,
                  }}
                >
                  <table
                    className="border-separate border-spacing-0 table-fixed text-left text-xs"
                    style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px` }}
                  >
                  <colgroup>
                    {columnKeys.map((key) => (
                      <col key={key} style={{ width: `${columnWidths[key] || 160}px` }} />
                    ))}
                  </colgroup>

                  {/* Grouped Master Header Row 1 */}
                  <thead className="sticky top-0 z-30 shadow-xs">
                    <tr className="bg-slate-200 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800 text-[10px] uppercase font-bold tracking-wider select-none">
                      <th
                        colSpan={3}
                        style={{ zIndex: 1 }}
                        className="px-3 py-2 text-emerald-900 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-950 border-r-2 border-b border-slate-300 dark:border-slate-700 text-left font-bold uppercase tracking-wider text-[10px]"
                      >
                        DEFINITION
                      </th>
                      <th colSpan={8} style={{ zIndex: 1 }} className="px-3 py-2 text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 border-r border-b border-slate-300 dark:border-slate-800">
                        PRODUCTION DIRECTION & CREATIVE COPY MATRIX
                      </th>
                      <th colSpan={3} style={{ zIndex: 1 }} className="px-3 py-2 text-cyan-800 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-950/80 border-r border-b border-slate-300 dark:border-slate-800">
                        ASSETS & DUE DATES
                      </th>
                      <th colSpan={1} style={{ zIndex: 1 }} className="px-3 py-2 text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 border-r border-b border-slate-300 dark:border-slate-800">
                        APPROVAL
                      </th>
                      <th colSpan={Math.max(1, columnKeys.length - 16)} style={{ zIndex: 1 }} className="px-3 py-2 text-purple-800 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 border-b border-slate-300 dark:border-slate-800">
                        SETUP & NOTES
                      </th>
                      <th colSpan={1} style={{ zIndex: 1 }} className="px-3 py-2 text-slate-500 dark:text-slate-400 text-center border-b border-slate-300 dark:border-slate-800">
                        ACTIONS
                      </th>
                    </tr>

                    {/* Sub-Header Column Titles Row 2 with Draggable Resizer Handles */}
                    <tr className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px] whitespace-nowrap select-none">
                      {columnKeys.map((key) => {
                        const label = key === 'action' ? 'Action' : (columnLabels[key] || key);
                        const isBorderRight2 = key === 'creativeType';
                        const isCenter = key === 'action';
                        const curWidth = columnWidths[key] || 160;

                        return (
                          <th
                            key={key}
                            style={{
                              width: `${curWidth}px`,
                              minWidth: `${curWidth}px`,
                              maxWidth: `${curWidth}px`,
                              zIndex: 1,
                            }}
                            className={`relative px-3 py-2.5 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 group/th overflow-hidden ${
                              isBorderRight2 ? 'border-r-2 border-slate-300 dark:border-slate-700' : 'border-r border-slate-200 dark:border-slate-800'
                            } ${isCenter ? 'text-center' : 'text-left'}`}
                          >
                            <div className="flex items-center justify-between overflow-hidden pr-2">
                              <span className="truncate" title={label}>
                                {label}
                              </span>
                            </div>

                            {/* Draggable Vertical Handle */}
                            <div
                              onMouseDown={(e) => handleResizeStart(e, key)}
                              className={`absolute top-0 right-0 w-3.5 h-full cursor-col-resize z-20 flex items-center justify-center group/resizer hover:bg-teal-500/20 transition-colors ${
                                resizingCol === key ? 'bg-teal-500/30' : ''
                              }`}
                              title="Drag vertical line to resize field width"
                            >
                              <div
                                className={`w-[2px] h-full transition-colors ${
                                  resizingCol === key
                                    ? 'bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.9)]'
                                    : 'bg-slate-300 dark:bg-slate-700 group-hover/resizer:bg-teal-500'
                                }`}
                              />
                            </div>
                          </th>
                        );
                      })}
                    </tr>

                    {/* Filter Row (Row 3) — dynamic dropdowns for columns with options */}
                    <tr className="bg-slate-50 dark:bg-slate-950 border-b-2 border-teal-300 dark:border-teal-700 text-[10px]">
                      {columnKeys.map((key) => {
                        const curWidth = columnWidths[key] || 160;
                        const isBorderRight2 = key === 'creativeType';
                        const opts = columnOptions[key];

                        if (opts && opts.length > 0) {
                          return (
                            <td
                              key={key}
                              style={{ width: `${curWidth}px`, minWidth: `${curWidth}px`, maxWidth: `${curWidth}px` }}
                              className={`px-1 py-1 ${isBorderRight2 ? 'border-r-2 border-slate-300 dark:border-slate-700' : 'border-r border-slate-200 dark:border-slate-800'} bg-slate-50 dark:bg-slate-950 relative`}
                            >
                              <MultiSelectFilterDropdown
                                label={columnLabels[key] || key}
                                options={opts}
                                selectedValues={columnFilters[key] || []}
                                onChange={(selected) => setFilter(key, selected)}
                                width={curWidth}
                              />
                            </td>
                          );
                        }

                        return (
                          <td
                            key={key}
                            style={{ width: `${curWidth}px`, minWidth: `${curWidth}px`, maxWidth: `${curWidth}px` }}
                            className={`px-2 py-1 ${isBorderRight2 ? 'border-r-2 border-slate-300 dark:border-slate-700' : 'border-r border-slate-200 dark:border-slate-800'} bg-slate-50 dark:bg-slate-950 overflow-hidden`}
                          />
                        );
                      })}
                    </tr>
                  </thead>

                  {/* Matrix Data Rows */}
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                    {displayRows.map((row) => {
                      const rowH = rowHeights[row.id] || DEFAULT_ROW_HEIGHT;
                      const isExpanded = rowH > 52;

                      return (
                        <tr
                          key={row.id}
                          style={{
                            height: `${rowH}px`,
                            minHeight: `${rowH}px`,
                          }}
                          className={`text-slate-800 dark:text-slate-200 relative group/row ${
                            (row as any).approvalStatus === 'Revision Requested'
                              ? 'bg-amber-50/80 dark:bg-amber-950/30 hover:bg-amber-100/80 dark:hover:bg-amber-950/50'
                              : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/40'
                          } ${
                            resizingRow === row.id ? 'transition-none select-none' : 'transition-colors'
                          }`}
                        >
                          {columnKeys.map((key) => {
                            const curWidth = columnWidths[key] || 160;
                            const isBorderRight2 = key === 'creativeType';
                            const borderClass = isBorderRight2
                              ? 'border-r-2 border-slate-300 dark:border-slate-700'
                              : 'border-r border-slate-200 dark:border-slate-800/60';
                            const cellStyle = {
                              width: `${curWidth}px`,
                              minWidth: `${curWidth}px`,
                              maxWidth: `${curWidth}px`,
                              zIndex: 1,
                            };

                            if (key === 'serial') {
                              return (
                                <td
                                  key={key}
                                  style={cellStyle}
                                  className="px-3 py-2 bg-white dark:bg-slate-900 border-r border-b border-slate-200 dark:border-slate-800 font-mono text-teal-700 dark:text-teal-400 font-semibold overflow-visible truncate relative group/serial"
                                >
                                  {row.serial}
                                  <div
                                    onMouseDown={(e) => handleRowResizeStart(e, row.id)}
                                    className={`absolute bottom-0 left-0 w-full h-2.5 cursor-row-resize z-30 flex items-end justify-center group/hresizer hover:bg-teal-500/30 transition-colors ${
                                      resizingRow === row.id ? 'bg-teal-500/40' : ''
                                    }`}
                                    title="Drag horizontal line down/up to resize row height"
                                  >
                                    <div
                                      className={`w-full h-[2px] transition-colors ${
                                        resizingRow === row.id
                                          ? 'bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.9)]'
                                          : 'bg-slate-200 dark:bg-slate-800 group-hover/row:bg-teal-500/60 group-hover/hresizer:bg-teal-500'
                                      }`}
                                    />
                                  </div>
                                </td>
                              );
                            }

                            if (key === 'campaignType') {
                              return (
                                <td key={key} style={cellStyle} className={`px-2 py-2 bg-white dark:bg-slate-900 border-b ${borderClass} overflow-hidden`}>
                                  <select
                                    value={row.campaignType}
                                    onChange={(e) => !isViewer && updateRowField(row.id, 'campaignType', e.target.value)}
                                    disabled={isViewer}
                                    className="w-full bg-transparent text-slate-800 dark:text-slate-200 border-0 focus:ring-1 focus:ring-teal-500 rounded px-1 py-0.5 text-xs text-ellipsis overflow-hidden cursor-pointer disabled:cursor-default disabled:opacity-70"
                                  >
                                    {(columnOptions.campaignType || CAMPAIGN_TYPE_OPTIONS).map((opt) => (
                                      <option key={opt} value={opt} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">{opt}</option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }

                            if (key === 'creativeType') {
                              return (
                                <td key={key} style={cellStyle} className="px-2 py-2 bg-white dark:bg-slate-900 border-r-2 border-b border-slate-300 dark:border-slate-700 overflow-hidden">
                                  <select
                                    value={row.creativeType}
                                    onChange={(e) => !isViewer && updateRowField(row.id, 'creativeType', e.target.value)}
                                    disabled={isViewer}
                                    className="w-full bg-slate-100 dark:bg-slate-800/80 text-teal-800 dark:text-teal-300 font-medium border border-slate-300 dark:border-slate-700/60 rounded px-2 py-1 text-xs cursor-pointer text-ellipsis overflow-hidden disabled:cursor-default disabled:opacity-70"
                                  >
                                    {(columnOptions.creativeType || CREATIVE_TYPE_OPTIONS).map((opt) => (
                                      <option key={opt} value={opt} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">{opt}</option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }

                            if (key === 'contentPillar') {
                              return (
                                <td key={key} style={cellStyle} className={`px-2 py-2 bg-white dark:bg-slate-900 border-b ${borderClass} overflow-hidden`}>
                                  <select
                                    value={row.contentPillar}
                                    onChange={(e) => !isViewer && updateRowField(row.id, 'contentPillar', e.target.value)}
                                    disabled={isViewer}
                                    className="w-full bg-amber-50 dark:bg-slate-800/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-slate-700/40 rounded px-2 py-1 text-xs cursor-pointer text-ellipsis overflow-hidden disabled:cursor-default disabled:opacity-70"
                                  >
                                    {(columnOptions.contentPillar || CONTENT_PILLAR_OPTIONS).map((opt) => (
                                      <option key={opt} value={opt} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">{opt}</option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }

                            if (key === 'offer') {
                              return (
                                <td key={key} style={cellStyle} className={`px-2 py-2 bg-white dark:bg-slate-900 border-b ${borderClass} overflow-hidden`}>
                                  <select
                                    value={row.offer}
                                    onChange={(e) => !isViewer && updateRowField(row.id, 'offer', e.target.value)}
                                    disabled={isViewer}
                                    className="w-full bg-cyan-50 dark:bg-slate-800/40 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-slate-700/40 rounded px-2 py-1 text-xs cursor-pointer text-ellipsis overflow-hidden disabled:cursor-default disabled:opacity-70"
                                  >
                                    {(columnOptions.offer || OFFER_OPTIONS).map((opt) => (
                                      <option key={opt} value={opt} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">{opt}</option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }

                            if (key === 'cta') {
                              return (
                                <td key={key} style={cellStyle} className={`px-2 py-2 bg-white dark:bg-slate-900 border-b ${borderClass} overflow-hidden`}>
                                  <select
                                    value={row.cta}
                                    onChange={(e) => !isViewer && updateRowField(row.id, 'cta', e.target.value)}
                                    disabled={isViewer}
                                    className="w-full bg-transparent text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700/40 rounded px-2 py-1 text-xs cursor-pointer text-ellipsis overflow-hidden disabled:cursor-default disabled:opacity-70"
                                  >
                                    {(columnOptions.cta || CTA_OPTIONS).map((opt) => (
                                      <option key={opt} value={opt} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">{opt}</option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }

                            if (key === 'approvalStatus') {
                              return (
                                <td key={key} style={cellStyle} className={`px-2 py-1.5 bg-white dark:bg-slate-900 border-b ${borderClass} overflow-hidden`}>
                                  <div className="flex items-center h-full">
                                    <select
                                      value={row.approvalStatus}
                                      onChange={(e) => !isViewer && updateRowField(row.id, 'approvalStatus', e.target.value)}
                                      disabled={isViewer}
                                      className={`w-full font-medium border rounded px-2 py-1 text-xs cursor-pointer text-ellipsis overflow-hidden disabled:cursor-default disabled:opacity-70 ${getApprovalBadge(row.approvalStatus)}`}
                                    >
                                      {(columnOptions.approvalStatus || APPROVAL_STATUS_OPTIONS).map((opt) => (
                                        <option key={opt} value={opt} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">{opt}</option>
                                      ))}
                                    </select>
                                  </div>
                                </td>
                              );
                            }

                            if (key === 'setupStatus') {
                              return (
                                <td key={key} style={cellStyle} className={`px-2 py-1.5 bg-white dark:bg-slate-900 border-b ${borderClass} overflow-hidden`}>
                                  <div className="flex items-center h-full">
                                    <select
                                      value={row.setupStatus}
                                      onChange={(e) => !isViewer && updateRowField(row.id, 'setupStatus', e.target.value)}
                                      disabled={isViewer}
                                      className={`w-full font-medium border rounded px-2 py-1 text-xs cursor-pointer text-ellipsis overflow-hidden disabled:cursor-default disabled:opacity-70 ${getSetupBadge(row.setupStatus)}`}
                                    >
                                      {(columnOptions.setupStatus || SETUP_STATUS_OPTIONS).map((opt) => (
                                        <option key={opt} value={opt} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">{opt}</option>
                                      ))}
                                    </select>
                                  </div>
                                </td>
                              );
                            }

                            if (key === 'designOwner') {
                              return (
                                <td key={key} style={cellStyle} className={`px-2 py-1.5 bg-white dark:bg-slate-900 border-b ${borderClass} overflow-hidden`}>
                                  <select
                                    value={row.designOwner}
                                    onChange={(e) => !isViewer && updateRowField(row.id, 'designOwner', e.target.value)}
                                    disabled={isViewer}
                                    className="w-full bg-transparent text-slate-800 dark:text-slate-300 border-0 focus:ring-1 focus:ring-teal-500 rounded px-1 py-0.5 text-xs cursor-pointer text-ellipsis overflow-hidden disabled:cursor-default disabled:opacity-70"
                                  >
                                    {(columnOptions.designOwner || DESIGN_OWNER_OPTIONS).map((opt) => (
                                      <option key={opt} value={opt} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">{opt}</option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }

                            if (key === 'designDue') {
                              return (
                                <td key={key} style={cellStyle} className={`px-2 py-1.5 bg-white dark:bg-slate-900 border-b ${borderClass} overflow-hidden`}>
                                  {isExpanded ? (
                                    <textarea
                                      value={row.designDue}
                                      onChange={(e) => !isViewer && updateRowField(row.id, 'designDue', e.target.value)}
                                      readOnly={isViewer}
                                      className="w-full h-full bg-transparent text-slate-800 dark:text-slate-300 text-center focus:bg-slate-100 dark:focus:bg-slate-800/60 focus:outline-none rounded px-1 py-0.5 resize-none whitespace-pre-wrap break-words text-xs custom-scrollbar read-only:cursor-default"
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      value={row.designDue}
                                      onChange={(e) => !isViewer && updateRowField(row.id, 'designDue', e.target.value)}
                                      readOnly={isViewer}
                                      className="w-full bg-transparent text-slate-800 dark:text-slate-300 text-center focus:bg-slate-100 dark:focus:bg-slate-800/60 focus:outline-none rounded px-1 py-0.5 text-xs truncate read-only:cursor-default"
                                    />
                                  )}
                                </td>
                              );
                            }

                            if (key === 'action') {
                              return (
                                <td key={key} style={cellStyle} className="px-2 py-1.5 bg-white dark:bg-slate-900 text-center border-b border-slate-200 dark:border-slate-800/60 overflow-hidden">
                                  <div className="flex items-center justify-center gap-1 h-full">
                                    {(row as any).approvalStatus === 'Revision Requested' && (row as any).client_feedback && (
                                      <button
                                        onClick={() => setClientNotesRow({ serial: row.serial, feedback: (row as any).client_feedback })}
                                        className="p-1 text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-500/10 rounded transition-colors cursor-pointer"
                                        title="View Client Notes"
                                      >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {!isViewer && (
                                      <button
                                        onClick={() => handleDeleteRow(row.id)}
                                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                                        title="Delete Row"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            }

                            // Dynamic Text / Modal fields: contentConcept, productionDirection, primaryText, headlinesHooks, contentOnCreative, hashtagsKeywords, notes, or CUSTOM fields!
                            const cellVal = (row as any)[key] ?? '';
                            const title = columnLabels[key] || key;

                            return (
                              <td
                                key={key}
                                style={cellStyle}
                                className={`px-2 py-1.5 bg-white dark:bg-slate-900 border-b ${borderClass} overflow-hidden relative group/cell`}
                              >
                                <div className="flex items-center h-full relative">
                                  {isExpanded ? (
                                    <textarea
                                      value={cellVal}
                                      placeholder={isViewer ? '' : `Add ${title}...`}
                                      onChange={(e) => !isViewer && updateRowField(row.id, key as any, e.target.value)}
                                      readOnly={isViewer}
                                      className="w-full h-full bg-transparent text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-800/60 focus:outline-none rounded px-1.5 py-1 text-xs resize-none whitespace-pre-wrap break-words custom-scrollbar read-only:cursor-default"
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      value={cellVal}
                                      placeholder={isViewer ? '' : `Add ${title}...`}
                                      onChange={(e) => !isViewer && updateRowField(row.id, key as any, e.target.value)}
                                      readOnly={isViewer}
                                      className="w-full bg-transparent text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-800/60 focus:outline-none rounded px-1.5 py-0.5 text-xs truncate read-only:cursor-default"
                                    />
                                  )}
                                  <button
                                    onClick={() => setSelectedCell({ rowId: row.id, field: key as any, title: `${row.serial} - ${title}`, content: cellVal })}
                                    className="opacity-0 group-hover/cell:opacity-100 absolute right-1 top-1 p-1 bg-slate-200/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 rounded transition-all cursor-pointer shadow-sm"
                                    title={`Expand ${title}`}
                                  >
                                    <Eye className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
          )}
        </div>
      )}

      {/* Brand & Profile Reference Tab */}
      {activeTab === 'brand' && (
        <div className="flex-1 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 overflow-y-auto shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Brand & Profile Reference</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Source of truth for names, contacts, copy, and hashtags used across all creative assets.</p>

          {!selectedWorkspace ? (
            /* Empty state when no workspace selected */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                <Building2 className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-2">No Workspace Selected</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">Select a workspace from the sidebar to view its brand and profile reference details.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Workspace Identity Card */}
              <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-teal-700 dark:text-teal-400 mb-4 pb-2 border-b border-slate-200 dark:border-slate-800">Workspace Identity</h3>
                <div className="space-y-3 text-xs">
                  {/* Avatar + Name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-xl ${selectedWorkspace.brandColor} flex items-center justify-center text-white font-bold text-base shadow-md flex-shrink-0`}>
                      {selectedWorkspace.initials}
                    </div>
                    <div>
                      <span className="text-slate-900 dark:text-slate-200 font-bold text-base block">{selectedWorkspace.name}</span>
                      {selectedWorkspace.industry && (
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">{selectedWorkspace.industry}</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Workspace ID</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono text-[11px]">{selectedWorkspace.id}</span>
                  </div>

                  {selectedWorkspace.tagline && (
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Tagline / Slogan</span>
                      <span className="text-teal-700 dark:text-teal-300 font-medium italic">"{selectedWorkspace.tagline}"</span>
                    </div>
                  )}

                  {selectedWorkspace.industry && (
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Industry</span>
                      <span className="text-slate-800 dark:text-slate-200">{selectedWorkspace.industry}</span>
                    </div>
                  )}

                  {selectedWorkspace.isDefault && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                        <CheckCircle2 className="w-3 h-3" /> Default Workspace
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Campaign Summary for this workspace */}
              <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-4 pb-2 border-b border-slate-200 dark:border-slate-800">Active Matrix Summary</h3>
                <div className="space-y-4 text-xs">
                  {campaigns.length === 0 ? (
                    <div className="text-slate-500 dark:text-slate-400 py-4 text-center">
                      <p>No campaigns found for this workspace.</p>
                      <p className="mt-1 text-[11px]">Create a campaign to start building your brand matrix.</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block mb-1">Total Campaigns</span>
                        <span className="text-slate-900 dark:text-slate-200 font-bold text-2xl">{campaigns.length}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block mb-1">Active Matrix</span>
                        <span className="text-slate-900 dark:text-slate-200 font-semibold">
                          {campaigns.find(c => c.id === selectedCampaignId)?.title ?? '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block mb-1">Creative Rows</span>
                        <span className="text-teal-700 dark:text-teal-300 font-bold text-lg">{rows.length}</span>
                        <span className="text-slate-500 dark:text-slate-400 ml-1">assets planned</span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block mb-1">Approval Breakdown</span>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{rows.filter(r => r.approvalStatus === 'Approved').length} Approved</span>
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">{rows.filter(r => r.approvalStatus?.includes('Review')).length} In Review</span>
                          <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{rows.filter(r => r.setupStatus === 'Live').length} Live</span>
                        </div>
                      </div>
                      {/* Content Pillars in use */}
                      {rows.length > 0 && (
                        <div>
                          <span className="text-slate-500 dark:text-slate-400 block mb-1.5">Content Pillars in Use</span>
                          <div className="flex flex-wrap gap-1.5">
                            {[...new Set(rows.map(r => r.contentPillar).filter(Boolean))].map(pillar => (
                              <span key={pillar} className="px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-[10px] font-medium border border-teal-200 dark:border-teal-800">
                                {pillar}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      {/* Overview & Rollup Tab */}
      {activeTab === 'overview' && (
        <div className="flex-1 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 overflow-y-auto shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Campaign Rollup & Expectations</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Target performance metrics and creative distribution per campaign stage.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-extrabold text-teal-600 dark:text-teal-400 mb-1">{rows.length}</div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Total Creative Assets</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Videos, Reels, Carousels, Statics</div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 mb-1">{rows.filter(r => r.offer?.includes('Sample Pack')).length}</div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Sample Pack Campaigns</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Cold Audience Growth Engine</div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mb-1">100%</div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">RAG Knowledge Coverage</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Aligned with Brand Guidelines</div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Slide-In Panel */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)} />
          {/* Panel */}
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden z-10">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4.5 h-4.5 text-teal-600 dark:text-teal-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Matrix Settings</h3>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Section 1: Field & Column Management */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1 h-3 bg-teal-500 rounded-full inline-block" />
                    Field &amp; Column Management
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">{columnKeys.length} active fields</span>
                </h4>

                {/* Add New Field Box */}
                <div className="flex gap-2 mb-3 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <input
                    type="text"
                    placeholder="New field title (e.g. Target Platform)..."
                    value={newFieldInput}
                    onChange={e => setNewFieldInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddNewField()}
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                  <button
                    onClick={handleAddNewField}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer flex-shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Field
                  </button>
                </div>

                {/* List of active fields (Drag to reorder / Edit Titles / Remove Field) */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                  {columnKeys.map((key, index) => {
                    const isSystemCol = key === 'serial' || key === 'action';
                    const label = columnLabels[key] || key;
                    const isDragging = draggedFieldKey === key;
                    const isDragOver = dragOverFieldKey === key;

                    return (
                      <div
                        key={key}
                        draggable
                        onDragStart={(e) => handleFieldDragStart(e, key)}
                        onDragOver={(e) => handleFieldDragOver(e, key)}
                        onDrop={(e) => handleFieldDrop(e, key)}
                        onDragEnd={handleFieldDragEnd}
                        className={`flex items-center gap-1.5 p-1.5 rounded-lg border transition-all ${
                          isDragging
                            ? 'opacity-40 border-dashed border-teal-500 bg-teal-500/10'
                            : isDragOver
                            ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 shadow-md scale-[1.01]'
                            : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        {/* Drag Handle */}
                        <div
                          className="cursor-grab active:cursor-grabbing p-0.5 text-slate-400 hover:text-teal-500 transition-colors flex-shrink-0"
                          title="Drag to reorder field"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </div>

                        {/* Move Up/Down Buttons */}
                        <div className="flex flex-col flex-shrink-0">
                          <button
                            onClick={() => handleMoveFieldOrder(key, 'up')}
                            disabled={index === 0}
                            title="Move field up"
                            className="p-0.5 text-slate-400 hover:text-teal-500 disabled:opacity-20 disabled:hover:text-slate-400 rounded transition-colors cursor-pointer"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleMoveFieldOrder(key, 'down')}
                            disabled={index === columnKeys.length - 1}
                            title="Move field down"
                            className="p-0.5 text-slate-400 hover:text-teal-500 disabled:opacity-20 disabled:hover:text-slate-400 rounded transition-colors cursor-pointer"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>

                        <span className="text-[10px] text-slate-400 dark:text-slate-500 w-16 flex-shrink-0 font-mono truncate" title={key}>
                          {key}
                        </span>

                        <input
                          type="text"
                          value={label}
                          onChange={e => updateColumnLabels(prev => ({ ...prev, [key]: e.target.value }))}
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 min-w-0"
                          disabled={key === 'action'}
                        />

                        {!isSystemCol && (
                          <button
                            onClick={() => handleRemoveField(key)}
                            title={`Remove field "${label}"`}
                            className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Reset fields button */}
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={handleResetFieldsToDefault}
                    className="text-[11px] text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-300 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <RefreshCcw className="w-3 h-3" /> Reset all fields
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-200 dark:border-slate-800" />

              {/* Section 2: Dropdown Options */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-amber-500 rounded-full inline-block" />
                  Dropdown Options
                </h4>
                <div className="space-y-2">
                  {Object.entries(columnOptions).map(([col, opts]) => (
                    <div key={col} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedSettingsSection(expandedSettingsSection === col ? null : col)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <span>{columnLabels[col] || col}</span>
                        <span className="text-slate-400 text-[10px]">{opts.length} options {expandedSettingsSection === col ? '▲' : '▼'}</span>
                      </button>
                      {expandedSettingsSection === col && (
                        <div className="px-3 py-2 space-y-1.5 bg-white dark:bg-slate-900">
                          {opts.map(opt => (
                            <div key={opt} className="flex items-center justify-between gap-2 py-0.5 px-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors">
                              <span className="text-[11px] text-slate-700 dark:text-slate-300 flex-1 truncate">{opt}</span>
                              <button
                                onClick={() => removeOption(col, opt)}
                                title={`Remove "${opt}"`}
                                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md text-slate-400 dark:text-slate-500 hover:text-white hover:bg-rose-500 dark:hover:bg-rose-500 transition-all cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          {/* Add new option */}
                          <div className="flex gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800 mt-2">
                            <input
                              type="text"
                              placeholder="Add option..."
                              value={newOptionInputs[col] || ''}
                              onChange={e => setNewOptionInputs(prev => ({ ...prev, [col]: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && addOption(col)}
                              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                            />
                            <button
                              onClick={() => addOption(col)}
                              className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-semibold rounded cursor-pointer transition-colors"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Panel Footer */}
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">⚠ Config resets on page refresh. Saved to session only.</p>
            </div>
          </div>
        </div>
      )}

      {/* Full-Content View & Edit Modal */}

      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{selectedCell.title}</h3>
              </div>
              <button
                onClick={() => setSelectedCell(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-6 overflow-y-auto">
              <textarea
                value={selectedCell.content}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedCell({ ...selectedCell, content: val });
                  updateRowField(selectedCell.rowId, selectedCell.field, val);
                }}
                className="w-full h-80 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-mono text-xs border border-slate-200 dark:border-slate-800 rounded-xl p-4 focus:outline-none focus:border-teal-500 leading-relaxed"
              />
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <span className="text-xs text-slate-500 dark:text-slate-400">Edit copy directly or paste revisions above</span>
              <button
                onClick={() => setSelectedCell(null)}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Notes Viewer Modal */}
      {clientNotesRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Client Revision Notes</h3>
                <span className="text-xs font-mono text-amber-700 dark:text-amber-400">{clientNotesRow.serial}</span>
              </div>
              <button onClick={() => setClientNotesRow(null)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Category</p>
                <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-bold border border-amber-200 dark:border-amber-500/30">
                  {clientNotesRow.feedback?.category}
                </span>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Feedback</p>
                <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed bg-slate-50 dark:bg-slate-950 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                  {clientNotesRow.feedback?.notes}
                </p>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Submitted by {clientNotesRow.feedback?.submitted_by} · {clientNotesRow.feedback?.submitted_at ? new Date(clientNotesRow.feedback.submitted_at).toLocaleString() : ''}
              </p>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button onClick={() => setClientNotesRow(null)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STRATEGIC QUESTIONNAIRE WIZARD MODAL */}
      <CampaignWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        selectedWorkspace={selectedWorkspace || null}
        onLaunchCampaign={handleLaunchFromWizard}
      />
    </div>
  );
};
