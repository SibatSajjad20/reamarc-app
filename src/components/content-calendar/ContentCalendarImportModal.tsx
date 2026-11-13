import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FileText,
  History,
  Undo2,
} from 'lucide-react';
import { contentCalendarService } from '../../services/contentCalendarService';
import type { ImportJob, ImportPreviewRow } from '../../types/contentCalendar';
import { useToast } from '../../context/ToastContext';
import { CustomSelect } from '../ui/CustomSelect';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { RadioGroup, RadioCard } from '../ui/radio-group';
import {
  IMPORT_FIELDS,
  SKIP_FIELD,
  applyColumnMapping,
  defaultSelectedFields,
  parseSpreadsheetBuffer,
  prepareItems,
  transferableFieldsForMode,
  type ImportMode,
  type MappedImportRow,
  type MergePolicy,
  type ParsedSheet,
  type UnmatchedPolicy,
} from '../../utils/contentCalendarImport';

export { prepareItems };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  activeClients: { id: string; name: string }[];
}

type WizardStep = 'upload' | 'map' | 'preview';

const FATE_LABEL: Record<string, string> = {
  create: 'Create',
  update: 'Update',
  skip: 'Skip',
  error: 'Error',
};

function fieldLabel(key: string): string {
  return IMPORT_FIELDS.find((f) => f.key === key)?.label || key;
}

function formatWhen(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export const ContentCalendarImportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  activeClients,
}) => {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'import' | 'history'>('import');
  const [step, setStep] = useState<WizardStep>('upload');
  const [mode, setMode] = useState<ImportMode>('update');
  const [unmatched, setUnmatched] = useState<UnmatchedPolicy>('skip');
  const [mergePolicy, setMergePolicy] = useState<MergePolicy>('overwrite');

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<number, string | null>>({});
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [mappedRows, setMappedRows] = useState<MappedImportRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [overrideClient, setOverrideClient] = useState(true);
  const [defaultClient, setDefaultClient] = useState(
    activeClients.length > 0 ? activeClients[0].name : '',
  );

  const [job, setJob] = useState<ImportJob | null>(null);
  const [history, setHistory] = useState<ImportJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!defaultClient && activeClients.length > 0) {
      setDefaultClient(activeClients[0].name);
    }
  }, [activeClients, defaultClient]);

  useEffect(() => {
    if (!isOpen) return;
    if (tab !== 'history') return;
    let cancelled = false;
    setHistoryLoading(true);
    contentCalendarService
      .listImportJobs()
      .then((jobs) => {
        if (!cancelled) setHistory(jobs);
      })
      .catch((err) => {
        if (!cancelled) addToast('Could not load import history', err?.message || 'Try again', 'error');
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, tab, addToast]);

  const fieldOptions = useMemo(
    () => [
      { value: SKIP_FIELD, label: 'Do not import' },
      ...IMPORT_FIELDS.map((f) => ({
        value: f.key,
        label: `${f.label}${f.role === 'locked' ? ' (won’t transfer)' : f.role === 'match' ? ' (match key)' : ''}`,
      })),
    ],
    [],
  );

  const transferable = useMemo(() => transferableFieldsForMode(mode), [mode]);
  const mappedFieldSet = useMemo(
    () => new Set(Object.values(mapping).filter(Boolean) as string[]),
    [mapping],
  );

  const resetWizard = () => {
    setStep('upload');
    setFile(null);
    setParsed(null);
    setMapping({});
    setSelectedFields([]);
    setMappedRows([]);
    setJob(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = async (selected: File) => {
    setErrorMsg(null);
    if (!selected.name.match(/\.(xlsx|xls|csv)$/i)) {
      setErrorMsg('Please upload a valid Excel (.xlsx, .xls) or CSV file.');
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setErrorMsg('File size exceeds the 10MB limit.');
      return;
    }
    setFile(selected);
    setIsParsing(true);
    try {
      const buffer = await selected.arrayBuffer();
      const sheet = parseSpreadsheetBuffer(buffer);
      if (sheet.rows.length > 1000) {
        throw new Error('This file has more than 1,000 data rows. Split it before importing.');
      }
      setParsed(sheet);
      setMapping(sheet.mapping);
      setSelectedFields(defaultSelectedFields(mode, sheet.mapping));
      setMappedRows(applyColumnMapping(sheet, sheet.mapping));
      setJob(null);
      setStep('map');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse Excel workbook.');
      setParsed(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleMappingChange = (colIdx: number, field: string) => {
    const next = { ...mapping, [colIdx]: field === SKIP_FIELD ? null : field };
    const used = new Map<string, number>();
    Object.entries(next).forEach(([idx, f]) => {
      if (!f) return;
      if (used.has(f) && used.get(f) !== Number(idx)) {
        next[used.get(f)!] = null;
      }
      used.set(f, Number(idx));
    });
    setMapping(next);
    if (parsed) {
      setMappedRows(applyColumnMapping(parsed, next));
      setSelectedFields(defaultSelectedFields(mode, next));
    }
  };

  const handleModeChange = (nextMode: ImportMode) => {
    setMode(nextMode);
    setSelectedFields(defaultSelectedFields(nextMode, mapping));
  };

  const toggleField = (key: string, on: boolean) => {
    setSelectedFields((prev) => (on ? Array.from(new Set([...prev, key])) : prev.filter((k) => k !== key)));
  };

  const handlePreview = async () => {
    if (!mappedRows.length) return;
    if (mode !== 'create') {
      const hasMatch = Object.values(mapping).some((f) => f === 'serial' || f === 'id');
      if (!hasMatch) {
        setErrorMsg('Map Serial or Record ID so existing campaigns can be matched.');
        return;
      }
    }
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const mappingByHeader: Record<string, string | null> = {};
      parsed?.headers.forEach((h, idx) => {
        mappingByHeader[h] = mapping[idx] ?? null;
      });
      const preview = await contentCalendarService.previewImport({
        mode,
        unmatched,
        merge_policy: mergePolicy,
        default_client_name: defaultClient,
        override_client: overrideClient,
        selected_fields: selectedFields,
        mapping: mappingByHeader,
        filename: file?.name,
        rows: mappedRows,
      });
      setJob(preview);
      setStep('preview');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not build preview.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApply = async () => {
    if (!job?.id) return;
    setIsSubmitting(true);
    try {
      const applied = await contentCalendarService.applyImport(job.id);
      setJob(applied);
      const inserted = applied.counts?.inserted ?? 0;
      const updated = applied.counts?.updated ?? 0;
      const errCount = applied.apply_errors?.length ?? 0;
      addToast(
        errCount ? 'Import completed with issues' : 'Import applied',
        `${inserted} added, ${updated} updated.${errCount ? ` ${errCount} apply errors.` : ''} Restore is available in History.`,
        errCount ? 'warning' : 'success',
      );
      onSuccess();
    } catch (err: any) {
      addToast('Import failed', err?.message || 'Could not apply import', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await contentCalendarService.restoreImport(id);
      addToast('Import restored', 'Mapped fields were rolled back. Rows this import created were deleted.', 'success');
      const jobs = await contentCalendarService.listImportJobs();
      setHistory(jobs);
      onSuccess();
    } catch (err: any) {
      addToast('Restore failed', err?.message || 'Could not restore this import', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  if (!isOpen) return null;

  const previewRows: ImportPreviewRow[] = job?.preview_rows || [];
  const summary = job?.summary || {};
  const applied = job?.status === 'applied';

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent maxWidth="2xl" className="p-0 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4.5 h-4.5" />
            </div>
            <div>
              <DialogTitle className="text-h3 font-semibold text-fg">
                Import content calendar
              </DialogTitle>
              <DialogDescription className="text-small text-fg-muted mt-0.5">
                Map columns, preview field transfers, then apply. Restore is available from History.
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="px-6 pt-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'import' | 'history')}>
            <TabsList>
              <TabsTrigger value="import">Import</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {tab === 'import' ? (
          <div className="px-6 pb-4 flex-1 overflow-y-auto space-y-4">
            <RadioGroup value={mode} onValueChange={(v) => handleModeChange(v as ImportMode)} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <RadioCard
                value="update"
                title="Update existing"
                description="Export → edit dates in Excel → import. Matches Serial / Record ID."
              />
              <RadioCard
                value="create"
                title="Create new"
                description="First load of a plan. System assigns serials. Excel serials are ignored."
              />
              <RadioCard
                value="mixed"
                title="Mixed"
                description="Update matched rows. Unmatched rows skip or insert."
              />
            </RadioGroup>

            {activeClients.length === 0 ? (
              <div className="p-4 rounded-md bg-subtle border border-border flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-warning-fg shrink-0 mt-0.5" />
                <div>
                  <p className="text-label font-medium text-fg">No active clients found</p>
                  <p className="text-small text-fg-muted mt-0.5">
                    An active client is required to import content calendar records.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-md bg-subtle border border-border space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  <div>
                    <label className="text-label font-medium text-fg block mb-1">Target client</label>
                    <CustomSelect
                      size="sm"
                      value={defaultClient}
                      onChange={setDefaultClient}
                      options={activeClients.map((c) => ({ value: c.name, label: c.name }))}
                    />
                  </div>
                  <div className="space-y-3 pt-1 sm:pt-2">
                    <Checkbox
                      checked={overrideClient}
                      onCheckedChange={(c) => setOverrideClient(Boolean(c))}
                      label="Apply client to new rows"
                      description="Used when creating campaigns, not when updating by serial"
                    />
                  </div>
                </div>
                {mode !== 'create' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-label font-medium text-fg block mb-1">If a mapped cell has a value</label>
                      <CustomSelect
                        size="sm"
                        value={mergePolicy}
                        onChange={(v) => setMergePolicy(v as MergePolicy)}
                        options={[
                          { value: 'overwrite', label: 'Overwrite the current field' },
                          { value: 'fill_blanks', label: 'Fill blank fields only' },
                        ]}
                      />
                    </div>
                    {mode === 'mixed' && (
                      <div>
                        <label className="text-label font-medium text-fg block mb-1">Unmatched rows</label>
                        <CustomSelect
                          size="sm"
                          value={unmatched}
                          onChange={(v) => setUnmatched(v as UnmatchedPolicy)}
                          options={[
                            { value: 'skip', label: 'Skip' },
                            { value: 'insert', label: 'Insert as new' },
                          ]}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 'upload' || !file ? (
              <div
                onDragOver={(e) => {
                  if (activeClients.length === 0) return;
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  if (activeClients.length === 0) return;
                  e.preventDefault();
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) void processFile(dropped);
                }}
                onClick={() => {
                  if (activeClients.length === 0) return;
                  fileInputRef.current?.click();
                }}
                className={`border border-dashed border-border rounded-md p-8 flex flex-col items-center justify-center gap-3 transition-colors ${
                  activeClients.length === 0
                    ? 'opacity-50 cursor-not-allowed bg-subtle'
                    : 'hover:border-accent cursor-pointer bg-subtle group'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={activeClients.length === 0}
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) void processFile(selected);
                  }}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-md bg-accent-soft text-accent flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="text-center">
                  <p className="text-small font-medium text-fg">
                    {isParsing ? 'Reading file…' : 'Click to select file or drag and drop here'}
                  </p>
                  <p className="text-caption text-fg-muted mt-0.5">
                    Supports .xlsx, .xls, .csv (Max 10MB). For updates, export this calendar first so Serial and Record ID are present.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3.5 rounded-md bg-subtle border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-success-bg text-success-fg border border-success-bd flex items-center justify-center">
                    <FileText className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="text-small font-semibold text-fg">{file.name}</div>
                    <div className="text-caption text-fg-muted font-numeric">
                      {parsed ? `${parsed.rows.length} rows • ${parsed.headers.length} columns` : 'Reading…'}
                    </div>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={resetWizard} className="text-caption text-fg-muted">
                  Change file
                </Button>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-md bg-danger-bg border border-danger-bd flex items-center gap-2.5 text-small text-danger-fg">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {parsed && step !== 'upload' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-caption font-semibold text-fg-muted uppercase tracking-wider">Column mapping</p>
                  <span className="text-caption text-fg-muted">{mappedRows.length} mapped rows</span>
                </div>
                <div className="border border-border rounded-md overflow-auto max-h-56 text-small">
                  <table className="w-full text-left">
                    <thead className="bg-subtle text-fg-muted text-label">
                      <tr>
                        <th className="p-2">Excel header</th>
                        <th className="p-2">Sample</th>
                        <th className="p-2">Maps to</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {parsed.headers.map((header, idx) => {
                        const sample = parsed.rows[0] ? String(parsed.rows[0][idx] ?? '') : '';
                        const field = mapping[idx];
                        const def = IMPORT_FIELDS.find((f) => f.key === field);
                        return (
                          <tr key={`${header}-${idx}`}>
                            <td className="p-2 font-medium">{header}</td>
                            <td className="p-2 text-fg-muted truncate max-w-[180px]" title={sample}>{sample || '—'}</td>
                            <td className="p-2 min-w-[220px]">
                              <CustomSelect
                                size="sm"
                                value={field || SKIP_FIELD}
                                onChange={(v) => handleMappingChange(idx, v)}
                                options={fieldOptions}
                              />
                              {def?.role === 'locked' && (
                                <p className="text-caption text-warning-fg mt-1">Shown in the sheet only. Will not overwrite pipeline fields.</p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {parsed && step !== 'upload' && (
              <div className="space-y-2">
                <p className="text-caption font-semibold text-fg-muted uppercase tracking-wider">
                  Fields that will transfer
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {transferable.filter((f) => mappedFieldSet.has(f.key)).map((f) => (
                    <Checkbox
                      key={f.key}
                      checked={selectedFields.includes(f.key)}
                      onCheckedChange={(c) => toggleField(f.key, Boolean(c))}
                      label={f.label}
                      description={f.defaultUpdate ? 'Default for date bulk-edit' : undefined}
                    />
                  ))}
                </div>
                {mode !== 'create' && (
                  <p className="text-caption text-fg-muted">
                    Stage, approval, assets, and review links never transfer. Serial / Record ID are match keys only.
                  </p>
                )}
              </div>
            )}

            {step === 'preview' && job && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-caption font-semibold text-fg-muted uppercase tracking-wider">
                    Preview — {summary.update || 0} update, {summary.create || 0} create, {summary.skip || 0} skip, {summary.error || 0} error
                  </p>
                  {applied && (
                    <span className="text-caption text-success-fg font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Applied
                    </span>
                  )}
                </div>
                <div className="border border-border rounded-md overflow-auto max-h-72 text-small">
                  <table className="w-full text-left">
                    <thead className="bg-subtle text-fg-muted text-label">
                      <tr>
                        <th className="p-2">Row</th>
                        <th className="p-2">Serial</th>
                        <th className="p-2">Fate</th>
                        <th className="p-2">Field transfers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {previewRows.slice(0, 50).map((row) => (
                        <tr key={row.row} className={row.fate === 'error' ? 'bg-danger-bg/40' : undefined}>
                          <td className="p-2 font-numeric">{row.row}</td>
                          <td className="p-2 font-numeric">{row.serial || '—'}</td>
                          <td className="p-2">{FATE_LABEL[row.fate] || row.fate}</td>
                          <td className="p-2">
                            {row.errors?.length ? (
                              <span className="text-danger-fg">{row.errors.join('; ')}</span>
                            ) : row.changes?.length ? (
                              <ul className="space-y-0.5">
                                {row.changes.map((ch) => (
                                  <li key={ch.field}>
                                    <span className="text-fg-muted">{fieldLabel(ch.field)}:</span>{' '}
                                    <span className="text-fg-muted">{String(ch.before ?? '—')}</span>
                                    {' → '}
                                    <span className="font-medium">{String(ch.after ?? '—')}</span>
                                  </li>
                                ))}
                                {row.stage && mode !== 'create' && (
                                  <li className="text-fg-muted">Stage stays {row.stage}</li>
                                )}
                              </ul>
                            ) : (
                              <span className="text-fg-muted">No field changes</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previewRows.length > 50 && (
                  <p className="text-caption text-fg-muted">Showing first 50 of {previewRows.length} rows.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="px-6 pb-4 flex-1 overflow-y-auto space-y-3">
            <p className="text-small text-fg-muted">
              Restore undoes this import only. Later in-app edits on those fields will be overwritten. Snapshots last 30 days.
            </p>
            {historyLoading ? (
              <div className="py-6 flex items-center justify-center gap-2 text-small text-fg-muted">
                <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                Loading history…
              </div>
            ) : history.length === 0 ? (
              <div className="p-6 text-center text-small text-fg-muted border border-dashed border-border rounded-md">
                <History className="w-5 h-5 mx-auto mb-2" />
                No Excel imports yet.
              </div>
            ) : (
              <div className="border border-border rounded-md divide-y divide-border">
                {history.map((h) => (
                  <div key={h.id} className="p-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-small font-medium text-fg">{h.filename || 'Workbook'}</p>
                      <p className="text-caption text-fg-muted">
                        {h.mode} • {h.status} • {h.created_by_name || 'Unknown'} • {formatWhen(h.created_at)}
                      </p>
                      <p className="text-caption text-fg-muted font-numeric mt-0.5">
                        {(h.counts?.inserted ?? h.summary?.create) || 0} added, {(h.counts?.updated ?? h.summary?.update) || 0} updated
                        {(h.selected_fields || []).length ? ` • fields: ${(h.selected_fields || []).map(fieldLabel).join(', ')}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!h.can_restore || restoringId === h.id}
                      onClick={() => void handleRestore(h.id)}
                    >
                      {restoringId === h.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                      ) : (
                        <Undo2 className="w-3.5 h-3.5 mr-1" />
                      )}
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-6 py-4 border-t border-border bg-surface flex items-center justify-between gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Close
          </Button>
          {tab === 'import' && (
            <div className="flex items-center gap-2.5">
              {step === 'preview' && !applied && (
                <Button type="button" variant="secondary" onClick={() => setStep('map')} disabled={isSubmitting}>
                  Back to mapping
                </Button>
              )}
              {step !== 'preview' && (
                <Button
                  type="button"
                  variant="primary"
                  disabled={activeClients.length === 0 || mappedRows.length === 0 || isSubmitting || isParsing}
                  onClick={() => void handlePreview()}
                >
                  {isSubmitting ? 'Building preview…' : 'Preview transfers'}
                </Button>
              )}
              {step === 'preview' && !applied && (
                <Button
                  type="button"
                  variant="primary"
                  disabled={isSubmitting || !job?.id || (summary.error && !summary.update && !summary.create)}
                  onClick={() => void handleApply()}
                >
                  {isSubmitting ? 'Applying…' : `Apply ${summary.update || 0} updates, ${summary.create || 0} new`}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
