import React, { useEffect, useState, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { dailyLogService } from '@/services/dailyLogService';
import type { DailyLogColumn } from '@/types/dailyLog';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { SettingsCard } from '../SettingsCard';
import { StickySaveBar } from '../StickySaveBar';

const FIELD_TYPE_OPTIONS: { id: 'text' | 'number' | 'date' | 'select'; label: string }[] = [
  { id: 'text', label: 'Single-line text' },
  { id: 'number', label: 'Number' },
  { id: 'date', label: 'Date' },
  { id: 'select', label: 'Dropdown select' },
];

export const DailyLogFieldsSection: React.FC = () => {
  const { addToast } = useToast();

  const [initialColumns, setInitialColumns] = useState<DailyLogColumn[]>([]);
  const [columns, setColumns] = useState<DailyLogColumn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New field input state
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'date' | 'select'>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');

  const loadColumns = async () => {
    setIsLoading(true);
    try {
      const data = await dailyLogService.getColumns();
      setInitialColumns(data || []);
      setColumns(data || []);
    } catch (err: any) {
      addToast('Error loading columns', err.message || 'Could not fetch daily log columns', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadColumns();
  }, []);

  const isDirty = useMemo(() => {
    if (columns.length !== initialColumns.length) return true;
    return JSON.stringify(columns) !== JSON.stringify(initialColumns);
  }, [columns, initialColumns]);

  const handleAddNewColumn = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const label = newFieldLabel.trim();
    if (!label) return;

    const baseKey = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let key = baseKey;
    let count = 1;
    while (columns.some((c) => c.key === key)) {
      key = `${baseKey}_${count++}`;
    }

    const optionsList =
      newFieldType === 'select'
        ? newFieldOptions
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    const newCol: DailyLogColumn = {
      key,
      label,
      type: newFieldType,
      options: optionsList,
    };

    setColumns((prev) => [...prev, newCol]);
    setNewFieldLabel('');
    setNewFieldOptions('');
    setNewFieldType('text');
  };

  const handleDeleteColumn = (key: string) => {
    setColumns((prev) => prev.filter((c) => c.key !== key));
  };

  const handleDiscard = () => {
    setColumns(initialColumns);
    setNewFieldLabel('');
    setNewFieldOptions('');
    setErrorMessage(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const updated = await dailyLogService.updateColumns(columns);
      setInitialColumns(updated || columns);
      setColumns(updated || columns);
      addToast('Daily log fields updated', 'Field configuration saved successfully.', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to update columns';
      setErrorMessage(msg);
      addToast('Save failed', msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-48 rounded-xl border border-border bg-subtle/30 animate-pulse" />
        <div className="h-64 rounded-xl border border-border bg-subtle/30 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Add custom field"
        description="Create new column attributes to track in employee daily work logs."
      >
        <form onSubmit={handleAddNewColumn} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2.5 items-end">
            <div>
              <label className="block text-xs font-medium text-fg mb-1">
                Field label
              </label>
              <Input
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                placeholder="e.g. Priority, Ticket URL"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-fg mb-1">
                Field type
              </label>
              <CustomSelect
                value={newFieldType}
                onChange={(val) => setNewFieldType(val as any)}
                options={FIELD_TYPE_OPTIONS.map((opt) => ({ value: opt.id, label: opt.label }))}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!newFieldLabel.trim()}
              icon={Plus}
            >
              Add field
            </Button>
          </div>

          {newFieldType === 'select' && (
            <div>
              <label className="block text-xs font-medium text-fg mb-1">
                Dropdown options (comma separated)
              </label>
              <Input
                value={newFieldOptions}
                onChange={(e) => setNewFieldOptions(e.target.value)}
                placeholder="e.g. Low, Medium, High, Blocker"
              />
            </div>
          )}
        </form>
      </SettingsCard>

      <SettingsCard
        title="Active columns"
        description={`Manage names and order for the ${columns.length} active daily log columns.`}
      >
        <div className="space-y-2">
          {columns.map((col, idx) => (
            <div
              key={col.key}
              className="flex items-center gap-3 bg-surface p-2.5 rounded-lg border border-border"
            >
              <div className="flex-1 min-w-0">
                <Input
                  value={col.label}
                  onChange={(e) => {
                    const next = [...columns];
                    next[idx] = { ...next[idx], label: e.target.value };
                    setColumns(next);
                  }}
                  className="h-8 text-xs font-medium"
                />
              </div>

              <span className="text-micro font-medium text-fg-muted px-2 py-1 rounded bg-subtle border border-border shrink-0">
                {col.type}
              </span>

              <button
                type="button"
                onClick={() => handleDeleteColumn(col.key)}
                className="p-1.5 text-fg-muted hover:text-danger-fg hover:bg-hover rounded-md transition cursor-pointer shrink-0"
                title="Remove column"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <StickySaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onDiscard={handleDiscard}
        onSave={handleSave}
        errorMessage={errorMessage}
      />
    </div>
  );
};
