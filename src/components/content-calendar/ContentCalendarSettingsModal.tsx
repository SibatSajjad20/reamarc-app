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
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent maxWidth="md" className="p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-accent-soft text-accent flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-ui font-semibold text-fg leading-tight">
                Content calendar settings
              </DialogTitle>
              <DialogDescription className="text-caption text-fg-muted">
                Configure zoom, row height, and manage field dropdown options
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-border bg-surface">
          <button
            type="button"
            onClick={() => setActiveTab('display')}
            className={`flex items-center gap-2 px-3.5 py-2 border-b-2 text-xs font-semibold transition cursor-pointer ${
              activeTab === 'display'
                ? 'border-accent text-accent'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            <Rows className="w-3.5 h-3.5" />
            <span>Grid & Display</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fields')}
            className={`flex items-center gap-2 px-3.5 py-2 border-b-2 text-xs font-semibold transition cursor-pointer ${
              activeTab === 'fields'
                ? 'border-accent text-accent'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Field Values</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent-soft text-accent border border-accent/20">
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
              <div className="p-4 rounded-xl bg-subtle border border-border space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ZoomIn className="w-4 h-4 text-accent" />
                    <div>
                      <div className="text-xs font-semibold text-fg">
                        Table Zoom Scale
                      </div>
                      <div className="text-xs text-fg-muted">
                        Adjust magnification of the entire spreadsheet view
                      </div>
                    </div>
                  </div>
                  <span className="font-numeric text-xs font-medium px-2 py-0.5 rounded-md bg-accent-soft text-accent border border-accent/20">
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
                      className={`px-2.5 py-1 text-xs rounded-md font-numeric font-medium transition cursor-pointer border ${
                        zoomLevel === preset
                          ? 'bg-accent text-white border-accent shadow-xs'
                          : 'bg-surface text-fg-2 border-border hover:bg-hover'
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
                    className="p-1.5 rounded-md border border-border bg-surface text-fg-2 hover:bg-hover disabled:opacity-40 transition cursor-pointer"
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
                    className="flex-1 accent-accent h-1.5 bg-border rounded-lg cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => onZoomChange(Math.min(150, zoomLevel + 5))}
                    disabled={zoomLevel >= 150}
                    className="p-1.5 rounded-md border border-border bg-surface text-fg-2 hover:bg-hover disabled:opacity-40 transition cursor-pointer"
                    title="Zoom in 5%"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Row Height Setting Section */}
              <div className="p-4 rounded-xl bg-subtle border border-border space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Rows className="w-4 h-4 text-accent" />
                    <div>
                      <div className="text-xs font-semibold text-fg">
                        Default Row Height
                      </div>
                      <div className="text-xs text-fg-muted">
                        Controls baseline height of spreadsheet table rows
                      </div>
                    </div>
                  </div>
                  <span className="font-numeric text-xs font-medium px-2 py-0.5 rounded-md bg-accent-soft text-accent border border-accent/20">
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
                      className={`p-2 rounded-lg text-left border transition cursor-pointer ${
                        defaultRowHeight === preset.px
                          ? 'bg-accent-soft border-accent text-accent shadow-xs'
                          : 'bg-surface border-border text-fg-2 hover:bg-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{preset.label}</span>
                        <span className="text-[10px] font-numeric opacity-80">{preset.px}px</span>
                      </div>
                      <div className="text-[10px] text-fg-muted mt-0.5">{preset.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Fine Height Slider */}
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs font-numeric text-fg-muted w-10 text-right">28px</span>
                  <input
                    type="range"
                    min="28"
                    max="80"
                    step="2"
                    value={defaultRowHeight}
                    onChange={(e) => onRowHeightChange(Number(e.target.value))}
                    className="flex-1 accent-accent h-1.5 bg-border rounded-lg cursor-pointer"
                  />
                  <span className="text-xs font-numeric text-fg-muted w-10">80px</span>
                </div>

                {/* Reset custom dragged rows */}
                <div className="pt-2 flex items-center justify-between border-t border-border">
                  <span className="text-xs text-fg-muted">
                    Manually dragged row heights override this default.
                  </span>
                  <button
                    type="button"
                    onClick={handleClearCustomRowHeights}
                    className="text-xs font-medium text-accent hover:underline cursor-pointer"
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-fg-2 hover:bg-hover border border-border rounded-md transition cursor-pointer"
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
                <label className="text-caption font-medium text-fg-muted block mb-1.5">
                  Select Field to Configure
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {FIELD_CONFIGS.map((field) => (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => setSelectedFieldKey(field.key)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition cursor-pointer ${
                        selectedFieldKey === field.key
                          ? 'bg-accent text-white border-accent shadow-xs'
                          : field.isEditable
                          ? 'bg-surface text-fg border-border hover:bg-hover'
                          : 'bg-subtle text-fg-muted border-border hover:bg-hover'
                      }`}
                    >
                      <span>{field.label}</span>
                      {field.isEditable ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-success-dot" />
                      ) : (
                        <Lock className="w-2.5 h-2.5 opacity-60" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Field Description Card */}
              <div className="p-3 rounded-xl bg-subtle border border-border flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-fg flex items-center gap-1.5">
                    <span>{selectedField.label}</span>
                    {selectedField.isEditable ? (
                      <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-md bg-success-bg text-success-fg border border-success-bd">
                        Editable
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-md bg-surface border border-border text-fg-muted">
                        Locked (Coming soon)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-fg-muted mt-0.5">
                    {selectedField.description}
                  </div>
                </div>

                {selectedField.isEditable && (
                  <button
                    type="button"
                    onClick={handleResetCreativeTypes}
                    className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg transition shrink-0 cursor-pointer"
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
                        className="flex-1 px-3 py-1.5 rounded-md bg-surface border border-border-strong text-xs text-fg placeholder:text-fg-faint focus:outline-hidden focus:ring-1 focus:ring-accent"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-md text-xs font-medium bg-accent hover:bg-accent-hover text-white shadow-xs transition shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Option</span>
                      </button>
                    </div>
                    {optionInputError && (
                      <p className="text-xs text-danger-fg font-medium px-1">
                        {optionInputError}
                      </p>
                    )}
                  </form>

                  {/* Options List */}
                  <div className="rounded-xl border border-border divide-y divide-border max-h-72 overflow-y-auto bg-surface">
                    {creativeTypes.map((item, index) => {
                      const isEditing = editingIndex === index;

                      return (
                        <div
                          key={item}
                          className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-hover transition group"
                        >
                          {/* Left: Reorder & Name */}
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {/* Reorder Buttons */}
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => handleMoveOption(index, 'up')}
                                className="p-1 text-fg-muted hover:text-fg disabled:opacity-20 transition cursor-pointer"
                                title="Move up"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                disabled={index === creativeTypes.length - 1}
                                onClick={() => handleMoveOption(index, 'down')}
                                className="p-1 text-fg-muted hover:text-fg disabled:opacity-20 transition cursor-pointer"
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
                                  className="flex-1 px-2 py-0.5 rounded-md bg-surface border border-accent text-xs text-fg focus:outline-hidden"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(index)}
                                  className="p-1 text-success-fg hover:bg-success-bg rounded-md transition cursor-pointer"
                                  title="Save"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingIndex(null)}
                                  className="p-1 text-fg-muted hover:bg-hover rounded-md transition cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-fg truncate">
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
                                className="p-1.5 text-fg-muted hover:text-accent hover:bg-hover rounded-md transition cursor-pointer"
                                title="Rename option"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteOption(index)}
                                className="p-1.5 text-fg-muted hover:text-danger-fg hover:bg-hover rounded-md transition cursor-pointer"
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
                  <div className="flex items-center justify-between text-xs text-fg-muted px-1">
                    <span>{creativeTypes.length} options defined</span>
                    <span>Reorder or edit to update dropdown options across the module</span>
                  </div>
                </div>
              ) : (
                /* READ-ONLY / LOCKED FIELDS */
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-warning-bg border border-warning-bd flex items-center gap-2 text-xs text-warning-fg">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Editing predefined values for <strong>{selectedField.label}</strong> is locked. For now, only Creative Type is editable.
                    </span>
                  </div>

                  {/* Read-only values pill preview */}
                  <div className="p-3 rounded-xl border border-border bg-surface">
                    <div className="text-caption font-medium text-fg-muted mb-2">
                      Current Predefined Values:
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto">
                      {(
                        (constants && (constants as any)[selectedField.key]) ||
                        []
                      ).map((val: string) => (
                        <span
                          key={val}
                          className="px-2.5 py-1 rounded-md text-xs font-medium bg-subtle text-fg-2 border border-border"
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
        <div className="px-5 py-3.5 border-t border-border bg-subtle flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-caption text-fg-muted">
            <Check className="w-3.5 h-3.5 text-accent" />
            <span>Changes take effect immediately across all calendar views</span>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={onClose}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
