import React, { useState, useEffect, useMemo } from 'react';
import {
  Lock,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { contentCalendarService } from '@/services/contentCalendarService';
import { canEditContentCalendarFields } from '@/utils/settingsAccess';
import {
  visiblePipelineStages,
  STAGE_APPROVAL_STATUSES,
} from '@/utils/contentCalendarWorkflow';
import type { ContentCalendarConstants } from '@/types/contentCalendar';
import { SettingsCard } from '../SettingsCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

interface FieldConfig {
  key: string;
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
    key: 'approval_statuses',
    label: 'Approval Status',
    isEditable: false,
    description: 'Review and sign-off statuses throughout campaign lifecycle stages',
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
    key: 'setup_statuses',
    label: 'Setup Status',
    isEditable: false,
    description: 'Ad ops and technical implementation tracking stages',
  },
];

export const ContentCalendarFieldsSection: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();

  const canEdit = useMemo(() => canEditContentCalendarFields(user), [user]);
  const userStages = useMemo(() => visiblePipelineStages(user), [user]);

  const [constants, setConstants] = useState<ContentCalendarConstants | null>(null);
  const [creativeTypes, setCreativeTypes] = useState<string[]>(DEFAULT_CREATIVE_TYPES);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const [selectedFieldKey, setSelectedFieldKey] = useState<string>('creative_types');

  // New option input
  const [newOptionInput, setNewOptionInput] = useState('');
  const [optionInputError, setOptionInputError] = useState<string | null>(null);

  // Inline editing
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const fetchConstants = async () => {
    setIsLoading(true);
    try {
      const data = await contentCalendarService.getConstants();
      setConstants(data);
      if (data?.creative_types && data.creative_types.length > 0) {
        setCreativeTypes(data.creative_types);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchConstants();
  }, []);

  const persistCreativeTypes = async (newList: string[]) => {
    if (!canEdit) {
      addToast('Permission denied', 'Only admins and content or creative team leads can change field values.', 'error');
      return;
    }

    setIsUpdating(true);
    try {
      await contentCalendarService.updateConstants({
        creative_types: newList,
      });
      setCreativeTypes(newList);
      try {
        localStorage.setItem('reamarc_cc_creative_types', JSON.stringify(newList));
      } catch {}
      addToast('Creative types updated', 'Options saved successfully.', 'success');
    } catch (err: any) {
      const detailMsg =
        err.response?.data?.detail ||
        err.message ||
        'Could not update field values.';
      addToast('Update failed', detailMsg, 'error');
      // Rollback to server constants
      void fetchConstants();
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddOption = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canEdit) return;

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
  };

  const handleDeleteOption = async (index: number) => {
    if (!canEdit) return;
    if (creativeTypes.length <= 1) {
      addToast('At least one option must remain', 'error');
      return;
    }
    const updated = creativeTypes.filter((_, i) => i !== index);
    if (editingIndex === index) setEditingIndex(null);
    await persistCreativeTypes(updated);
  };

  const handleStartEdit = (index: number) => {
    if (!canEdit) return;
    setEditingIndex(index);
    setEditingValue(creativeTypes[index]);
  };

  const handleSaveEdit = async (index: number) => {
    if (!canEdit) return;
    const trimmed = editingValue.trim();
    if (!trimmed) {
      setEditingIndex(null);
      return;
    }
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
  };

  const handleMoveOption = async (index: number, direction: 'up' | 'down') => {
    if (!canEdit) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= creativeTypes.length) return;
    const updated = [...creativeTypes];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    await persistCreativeTypes(updated);
  };

  const handleResetCreativeTypes = async () => {
    if (!canEdit) return;
    await persistCreativeTypes([...DEFAULT_CREATIVE_TYPES]);
  };

  const selectedField = FIELD_CONFIGS.find((f) => f.key === selectedFieldKey) || FIELD_CONFIGS[0];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 rounded-xl bg-hover border border-border" />
        <div className="h-64 rounded-xl bg-hover border border-border" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="p-3.5 rounded-xl border border-warning-bd bg-warning-bg/30 text-warning-fg text-xs flex items-center gap-2.5">
          <AlertCircle size={16} className="shrink-0" />
          <span>
            Only admins and content or creative team leads can change field values.
          </span>
        </div>
      )}

      <SettingsCard
        title="Field categories"
        description="Select a dropdown attribute to review its predefined options."
      >
        <div className="flex flex-wrap gap-2">
          {FIELD_CONFIGS.map((field) => {
            const isSelected = selectedFieldKey === field.key;
            const isFieldEditable = field.isEditable && canEdit;
            return (
              <button
                key={field.key}
                type="button"
                onClick={() => setSelectedFieldKey(field.key)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  isSelected
                    ? 'bg-accent text-white border-accent shadow-xs'
                    : isFieldEditable
                    ? 'bg-surface text-fg border-border hover:bg-hover'
                    : 'bg-subtle text-fg-muted border-border hover:bg-hover'
                }`}
              >
                <span>{field.label}</span>
                {field.isEditable && canEdit ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-success-dot" />
                ) : (
                  <Lock size={12} className="opacity-60" />
                )}
              </button>
            );
          })}
        </div>
      </SettingsCard>

      {/* Selected Field Content */}
      {selectedFieldKey === 'creative_types' && (
        <SettingsCard
          title="Creative type options"
          description={selectedField.description}
        >
          {canEdit ? (
            <div className="space-y-4">
              <form onSubmit={handleAddOption} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Enter new creative type (e.g. Carousel, Short)..."
                    value={newOptionInput}
                    onChange={(e) => {
                      setNewOptionInput(e.target.value);
                      if (optionInputError) setOptionInputError(null);
                    }}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    disabled={isUpdating || !newOptionInput.trim()}
                  >
                    Add
                  </Button>
                </div>
                {optionInputError && (
                  <p className="text-xs text-danger font-medium">{optionInputError}</p>
                )}
              </form>

              <div className="rounded-xl border border-border divide-y divide-border max-h-72 overflow-y-auto bg-surface">
                {creativeTypes.map((item, index) => {
                  const isEditing = editingIndex === index;
                  return (
                    <div
                      key={item}
                      className="px-3.5 py-2 flex items-center justify-between gap-3 hover:bg-hover transition"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={index === 0 || isUpdating}
                            onClick={() => handleMoveOption(index, 'up')}
                            className="p-1 text-fg-muted hover:text-fg disabled:opacity-20 cursor-pointer"
                            title="Move up"
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            type="button"
                            disabled={index === creativeTypes.length - 1 || isUpdating}
                            onClick={() => handleMoveOption(index, 'down')}
                            className="p-1 text-fg-muted hover:text-fg disabled:opacity-20 cursor-pointer"
                            title="Move down"
                          >
                            <ArrowDown size={12} />
                          </button>
                        </div>

                        {isEditing ? (
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <Input
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(index);
                                if (e.key === 'Escape') setEditingIndex(null);
                              }}
                              autoFocus
                              className="h-7 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(index)}
                              className="p-1 text-success-fg hover:bg-success-bg rounded cursor-pointer"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingIndex(null)}
                              className="p-1 text-fg-muted hover:bg-hover rounded cursor-pointer"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-fg truncate">
                            {item}
                          </span>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(index)}
                            disabled={isUpdating}
                            className="p-1.5 text-fg-muted hover:text-fg hover:bg-hover rounded cursor-pointer"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOption(index)}
                            disabled={isUpdating}
                            className="p-1.5 text-fg-muted hover:text-danger-fg hover:bg-hover rounded cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-caption text-fg-muted">
                <span>{creativeTypes.length} types configured</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={RotateCcw}
                  onClick={handleResetCreativeTypes}
                  disabled={isUpdating}
                >
                  Restore defaults
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-1">
                {creativeTypes.map((val) => (
                  <span
                    key={val}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-subtle text-fg border border-border"
                  >
                    {val}
                  </span>
                ))}
              </div>
            </div>
          )}
        </SettingsCard>
      )}

      {selectedFieldKey === 'approval_statuses' && (
        <SettingsCard
          title="Approval statuses by stage"
          description="Review statuses available in each workflow stage visible to your role."
        >
          <div className="space-y-4">
            {userStages.map((stage) => {
              const statuses = STAGE_APPROVAL_STATUSES[stage] || [];
              return (
                <div key={stage} className="p-3.5 rounded-xl border border-border bg-subtle/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-fg">{stage}</span>
                    <span className="text-micro text-fg-muted font-mono">{statuses.length} statuses</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {statuses.map((status) => (
                      <span
                        key={status}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-surface text-fg border border-border"
                      >
                        {status}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsCard>
      )}

      {selectedFieldKey !== 'creative_types' && selectedFieldKey !== 'approval_statuses' && (
        <SettingsCard
          title={selectedField.label}
          description={selectedField.description}
        >
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-subtle border border-border text-xs text-fg-muted flex items-center gap-2">
              <Lock size={14} className="shrink-0" />
              <span>Editing predefined values for {selectedField.label} is currently locked.</span>
            </div>

            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto">
              {(
                (constants && (constants as any)[selectedField.key]) ||
                []
              ).map((val: string) => (
                <span
                  key={val}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-subtle text-fg border border-border"
                >
                  {val}
                </span>
              ))}
            </div>
          </div>
        </SettingsCard>
      )}
    </div>
  );
};
