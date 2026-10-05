import React, { useState, useEffect } from 'react';
import {
  X,
  Sliders,
  Tag,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Lock,
  Rows,
  Sparkles,
} from 'lucide-react';
import type { ContentCalendarConstants } from '../../types/contentCalendar';
import { useToast } from '../../context/ToastContext';

const DEFAULT_CREATIVE_TYPES = [
  'Video',
  'Reel',
  'Carousel',
  'Static',
  'Story',
  'UGC',
  'Testimonial',
  'GIF',
  'LP Graphic',
  'Banner',
  'Email',
  'Lead Magnet',
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
  defaultRowHeight: number;
  onRowHeightChange: (height: number) => void;
  onResetRowHeights?: () => void;
  constants: ContentCalendarConstants | null;
  onUpdateConstants: (newConstants: ContentCalendarConstants) => Promise<void> | void;
}

type SettingsTab = 'display' | 'fields';

interface FieldConfig {
  key: keyof ContentCalendarConstants | string;
  label: string;
  isEditable: boolean;
  description: string;
}

const FIELD_CONFIGS: FieldConfig[] = [
  {
    key: 'creative_types',
    label: 'Creative Type',
    isEditable: true,
    description: 'Formats for campaign creative deliverables (e.g. Video, Static, Reel)',
  },
  {
    key: 'campaign_types',
    label: 'Campaign Type',
    isEditable: false,
    description: 'Marketing funnel objectives and audience targeting groupings',
  },
  {
    key: 'content_pillars',
    label: 'Content Pillar',
    isEditable: false,
    description: 'Core themes and strategic pillars for content categorization',
  },
  {
    key: 'offers',
    label: 'Offer',
    isEditable: false,
    description: 'Conversion hooks and product incentive bundles',
  },
  {
    key: 'ctas',
    label: 'Call to Action (CTA)',
    isEditable: false,
    description: 'Direct call to action statements for ad copy',
  },
  {
    key: 'approval_statuses',
    label: 'Approval Status',
    isEditable: false,
    description: 'Review and sign-off statuses throughout campaign lifecycle',
  },
  {
    key: 'setup_statuses',
    label: 'Setup Status',
    isEditable: false,
    description: 'Ad ops and technical implementation tracking stages',
  },
];

export const ContentCalendarSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  zoomLevel,
  onZoomChange,
  defaultRowHeight,
  onRowHeightChange,
  onResetRowHeights,
  constants,
  onUpdateConstants,
}) => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('display');
  const [selectedFieldKey, setSelectedFieldKey] = useState<string>('creative_types');

  // Creative Types working state
  const [creativeTypes, setCreativeTypes] = useState<string[]>(() => {
    return constants?.creative_types && constants.creative_types.length > 0
      ? [...constants.creative_types]
      : [...DEFAULT_CREATIVE_TYPES];
  });

  // Sync when constants prop updates
  useEffect(() => {
    if (constants?.creative_types && constants.creative_types.length > 0) {
      setCreativeTypes([...constants.creative_types]);
    }
  }, [constants?.creative_types]);

  // New option input state
  const [newOptionInput, setNewOptionInput] = useState('');
  const [optionInputError, setOptionInputError] = useState<string | null>(null);

  // Inline editing state: option index being renamed
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  if (!isOpen) return null;

  // Save updated creative types
  const persistCreativeTypes = async (newList: string[]) => {
    setCreativeTypes(newList);
    if (!constants) return;
    const updated: ContentCalendarConstants = {
      ...constants,
      creative_types: newList,
    };
    await onUpdateConstants(updated);
  };

  const handleAddOption = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newOptionInput.trim();
    if (!trimmed) {
      setOptionInputError('Option name cannot be empty');
      return;
    }
    if (creativeTypes.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      setOptionInputError(`"${trimmed}" already exists`);
      return;
    }
    setOptionInputError(null);
    const updated = [...creativeTypes, trimmed];
    setNewOptionInput('');
    await persistCreativeTypes(updated);
    addToast(`Added "${trimmed}" to Creative Types`, 'success');
  };

  const handleDeleteOption = async (index: number) => {
    if (creativeTypes.length <= 1) {
      addToast('At least one Creative Type must remain', 'error');
      return;
    }
    const target = creativeTypes[index];
    const updated = creativeTypes.filter((_, i) => i !== index);
    if (editingIndex === index) {
      setEditingIndex(null);
    }
    await persistCreativeTypes(updated);
    addToast(`Removed "${target}"`, 'info');
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingValue(creativeTypes[index]);
  };

  const handleSaveEdit = async (index: number) => {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      setEditingIndex(null);
      return;
    }
    // Check duplicate (excluding itself)
    const existsOther = creativeTypes.some(
      (item, i) => i !== index && item.toLowerCase() === trimmed.toLowerCase()
    );
    if (existsOther) {
      addToast(`"${trimmed}" already exists`, 'error');
      return;
    }
    const updated = [...creativeTypes];
    updated[index] = trimmed;
    setEditingIndex(null);
    await persistCreativeTypes(updated);
    addToast('Option renamed', 'success');
  };

  const handleMoveOption = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= creativeTypes.length) return;
    const updated = [...creativeTypes];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    await persistCreativeTypes(updated);
  };

  const handleResetCreativeTypes = async () => {
    await persistCreativeTypes([...DEFAULT_CREATIVE_TYPES]);
    addToast('Creative Types reset to defaults', 'info');
  };

  const handleResetDisplayDefaults = () => {
    onZoomChange(100);
    onRowHeightChange(40);
    addToast('Display settings reset to defaults (100% zoom, 40px row height)', 'info');
  };

  const handleClearCustomRowHeights = () => {
    if (onResetRowHeights) {
      onResetRowHeights();
      addToast('All manual row height adjustments cleared', 'success');
    }
  };

  const selectedField = FIELD_CONFIGS.find((f) => f.key === selectedFieldKey) || FIELD_CONFIGS[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#12131a] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                Content Calendar Settings
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Configure zoom, row height, and manage field dropdown options
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12131a]">
          <button
            type="button"
            onClick={() => setActiveTab('display')}
            className={`flex items-center gap-2 px-3.5 py-2 border-b-2 text-xs font-bold transition cursor-pointer ${
              activeTab === 'display'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Rows className="w-3.5 h-3.5" />
            <span>Grid & Display</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fields')}
            className={`flex items-center gap-2 px-3.5 py-2 border-b-2 text-xs font-bold transition cursor-pointer ${
              activeTab === 'fields'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Field Values</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
              Creative Type
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* TAB 1: Grid & Display Settings */}
          {activeTab === 'display' && (
            <div className="space-y-6">
              {/* Zoom Setting Section */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200 dark:border-zinc-800 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ZoomIn className="w-4 h-4 text-indigo-500" />
                    <div>
                      <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        Table Zoom Scale
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Adjust magnification of the entire spreadsheet view
                      </div>
                    </div>
                  </div>
                  <span className="font-numeric text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    {zoomLevel}%
                  </span>
                </div>

                {/* Preset Zoom Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[75, 85, 90, 100, 110, 125, 150].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onZoomChange(preset)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-numeric font-semibold transition cursor-pointer border ${
                        zoomLevel === preset
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {preset}%{preset === 100 ? ' (Default)' : ''}
                    </button>
                  ))}
                </div>

                {/* Fine Zoom Stepper / Slider */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => onZoomChange(Math.max(50, zoomLevel - 5))}
                    disabled={zoomLevel <= 50}
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 transition cursor-pointer"
                    title="Zoom out 5%"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    step="5"
                    value={zoomLevel}
                    onChange={(e) => onZoomChange(Number(e.target.value))}
                    className="flex-1 accent-indigo-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => onZoomChange(Math.min(150, zoomLevel + 5))}
                    disabled={zoomLevel >= 150}
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 transition cursor-pointer"
                    title="Zoom in 5%"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Row Height Setting Section */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200 dark:border-zinc-800 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Rows className="w-4 h-4 text-indigo-500" />
                    <div>
                      <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        Default Row Height
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Controls baseline height of spreadsheet table rows
                      </div>
                    </div>
                  </div>
                  <span className="font-numeric text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    {defaultRowHeight} px
                  </span>
                </div>

                {/* Preset Height Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Compact', px: 32, desc: 'High density' },
                    { label: 'Default', px: 40, desc: 'Standard' },
                    { label: 'Comfortable', px: 48, desc: 'More spacing' },
                    { label: 'Spacious', px: 60, desc: 'Multi-line copy' },
                  ].map((preset) => (
                    <button
                      key={preset.px}
                      type="button"
                      onClick={() => onRowHeightChange(preset.px)}
                      className={`p-2 rounded-xl text-left border transition cursor-pointer ${
                        defaultRowHeight === preset.px
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-900 dark:text-indigo-200 shadow-xs'
                          : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{preset.label}</span>
                        <span className="text-[10px] font-numeric opacity-80">{preset.px}px</span>
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">{preset.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Fine Height Slider */}
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[11px] font-numeric text-zinc-400 w-10 text-right">28px</span>
                  <input
                    type="range"
                    min="28"
                    max="80"
                    step="2"
                    value={defaultRowHeight}
                    onChange={(e) => onRowHeightChange(Number(e.target.value))}
                    className="flex-1 accent-indigo-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                  />
                  <span className="text-[11px] font-numeric text-zinc-400 w-10">80px</span>
                </div>

                {/* Reset custom dragged rows */}
                <div className="pt-2 flex items-center justify-between border-t border-zinc-200/60 dark:border-zinc-800">
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Manually dragged row heights override this default.
                  </span>
                  <button
                    type="button"
                    onClick={handleClearCustomRowHeights}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Reset manual row heights
                  </button>
                </div>
              </div>

              {/* Reset to defaults button */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleResetDisplayDefaults}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Display to Defaults</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Field Values / Predefined Options */}
          {activeTab === 'fields' && (
            <div className="space-y-4">
              {/* Field Selector Bar */}
              <div>
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                  Select Field to Configure
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {FIELD_CONFIGS.map((field) => (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => setSelectedFieldKey(field.key)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        selectedFieldKey === field.key
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : field.isEditable
                          ? 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                          : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200/60 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span>{field.label}</span>
                      {field.isEditable ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      ) : (
                        <Lock className="w-2.5 h-2.5 opacity-60" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Field Description Card */}
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-850/60 border border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <span>{selectedField.label}</span>
                    {selectedField.isEditable ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        Editable
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        Locked (Coming soon)
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {selectedField.description}
                  </div>
                </div>

                {selectedField.isEditable && (
                  <button
                    type="button"
                    onClick={handleResetCreativeTypes}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition shrink-0 cursor-pointer"
                    title="Restore original creative types"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Defaults</span>
                  </button>
                )}
              </div>

              {/* EDITABLE FIELD: Creative Type */}
              {selectedField.isEditable ? (
                <div className="space-y-3">
                  {/* Add New Option Form */}
                  <form onSubmit={handleAddOption} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Enter new creative type (e.g. Short, Infographic)..."
                        value={newOptionInput}
                        onChange={(e) => {
                          setNewOptionInput(e.target.value);
                          if (optionInputError) setOptionInputError(null);
                        }}
                        className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Option</span>
                      </button>
                    </div>
                    {optionInputError && (
                      <p className="text-[11px] text-rose-500 font-semibold px-1">
                        {optionInputError}
                      </p>
                    )}
                  </form>

                  {/* Options List */}
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 max-h-72 overflow-y-auto bg-white dark:bg-[#151720]">
                    {creativeTypes.map((item, index) => {
                      const isEditing = editingIndex === index;

                      return (
                        <div
                          key={item}
                          className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition group"
                        >
                          {/* Left: Reorder & Name */}
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {/* Reorder Buttons */}
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => handleMoveOption(index, 'up')}
                                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-20 transition cursor-pointer"
                                title="Move up"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                disabled={index === creativeTypes.length - 1}
                                onClick={() => handleMoveOption(index, 'down')}
                                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-20 transition cursor-pointer"
                                title="Move down"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Option Value or Edit Input */}
                            {isEditing ? (
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit(index);
                                    if (e.key === 'Escape') setEditingIndex(null);
                                  }}
                                  autoFocus
                                  className="flex-1 px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-indigo-500 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(index)}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-md transition cursor-pointer"
                                  title="Save"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingIndex(null)}
                                  className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                                {item}
                              </span>
                            )}
                          </div>

                          {/* Right: Actions */}
                          {!isEditing && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(index)}
                                className="p-1.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                                title="Rename option"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteOption(index)}
                                className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                                title="Remove option"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                    <span>{creativeTypes.length} options defined</span>
                    <span>Reorder or edit to update dropdown options across the module</span>
                  </div>
                </div>
              ) : (
                /* READ-ONLY / LOCKED FIELDS */
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Editing predefined values for <strong>{selectedField.label}</strong> is locked. For now, only Creative Type is editable.
                    </span>
                  </div>

                  {/* Read-only values pill preview */}
                  <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151720]">
                    <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                      Current Predefined Values:
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto">
                      {(
                        (constants && (constants as any)[selectedField.key]) ||
                        []
                      ).map((val: string) => (
                        <span
                          key={val}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                        >
                          {val}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Changes take effect immediately across all calendar views</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
