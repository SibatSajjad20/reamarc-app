import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { taskService } from '@/services/taskService';
import type { TaskAssignableUser } from '@/types/task';
import { parseTaskWorkbook, type ParsedTaskRow } from '@/utils/taskExcel';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  people: TaskAssignableUser[];
  clients: { id: string; name: string }[];
}

export interface TaskImportPayload {
  serial?: string;
  title: string;
  description?: string | null;
  status?: string;
  priority?: string;
  progress?: number | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  estimate_hours?: number | null;
  client_id?: string | null;
  client_name?: string | null;
  blocked?: boolean;
  blocked_reason?: string | null;
}

function findPerson(name: string | undefined, people: TaskAssignableUser[]) {
  const n = (name || '').trim().toLowerCase();
  if (!n) return undefined;
  return people.find((p) => p.id.toLowerCase() === n || String(p.name || '').trim().toLowerCase() === n);
}

function findClient(name: string | undefined, clients: { id: string; name: string }[]) {
  const n = (name || '').trim().toLowerCase();
  if (!n) return undefined;
  const exact = clients.find((c) => c.id.toLowerCase() === n || c.name.trim().toLowerCase() === n);
  if (exact) return exact;
  const clean = n.replace(/\b(llc|inc|corp|ltd|co)\b/g, '').trim();
  if (!clean) return undefined;
  return clients.find((c) => c.name.trim().toLowerCase().replace(/\b(llc|inc|corp|ltd|co)\b/g, '').trim() === clean);
}

export function prepareTaskImportItems(
  rows: ParsedTaskRow[],
  people: TaskAssignableUser[],
  clients: { id: string; name: string }[],
): TaskImportPayload[] {
  return rows.map((row) => {
    const person = findPerson(row.assignee_name, people);
    const client = findClient(row.client_name, clients);
    return {
      serial: row.serial,
      title: row.title,
      description: row.description || null,
      status: row.status,
      priority: row.priority || 'medium',
      progress: row.progress ?? null,
      assignee_id: person?.id || null,
      assignee_name: person?.name || row.assignee_name || null,
      start_date: row.start_date || null,
      due_date: row.due_date || null,
      due_time: row.due_time || null,
      estimate_hours: row.estimate_hours ?? null,
      client_id: client?.id || null,
      client_name: client?.name || row.client_name || null,
      blocked: Boolean(row.blocked),
      blocked_reason: row.blocked_reason || null,
    };
  });
}

export const TaskImportModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, people, clients }) => {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parsedItems, setParsedItems] = useState<TaskImportPayload[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [upsertBySerial, setUpsertBySerial] = useState(true);

  if (!isOpen) return null;

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
      const rows = parseTaskWorkbook(await selected.arrayBuffer());
      setParsedItems(prepareTaskImportItems(rows, people, clients));
    } catch (err: any) {
      setParsedItems([]);
      setErrorMsg(err?.message || 'Failed to parse Excel workbook.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedItems.length === 0) return;
    setIsSubmitting(true);
    try {
      let processed = 0;
      let inserted = 0;
      let updated = 0;
      const allErrors: string[] = [];
      for (let offset = 0; offset < parsedItems.length; offset += 500) {
        const res = await taskService.bulkImport({
          items: parsedItems.slice(offset, offset + 500) as unknown as Record<string, unknown>[],
          upsert_by_serial: upsertBySerial,
        });
        processed += res.total_processed;
        inserted += res.inserted_count;
        updated += res.updated_count;
        if (res.errors?.length) allErrors.push(...res.errors);
      }
      const extra = allErrors.length ? ` ${allErrors.length} row ${allErrors.length === 1 ? 'warning' : 'warnings'}.` : '';
      addToast(
        'Import completed',
        `Processed ${processed} tasks (${inserted} added, ${updated} updated).${extra}`,
        allErrors.length ? 'info' : 'success',
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast('Import failed', err?.message || 'Could not import tasks', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent maxWidth="lg" className="p-0 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3 bg-surface">
          <div className="w-9 h-9 rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-4.5 h-4.5" />
          </div>
          <div>
            <DialogTitle className="text-h3 font-semibold text-fg">Import tasks from Excel</DialogTitle>
            <DialogDescription className="text-small text-fg-muted mt-0.5">
              Upload a task spreadsheet. Leave Task ID blank to auto-assign T-NNNN.
            </DialogDescription>
          </div>
        </div>
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          <div className="p-4 rounded-md bg-subtle border border-border">
            <Checkbox
              checked={upsertBySerial}
              onCheckedChange={(c) => setUpsertBySerial(Boolean(c))}
              label="Upsert by Task ID"
              description="Update existing tasks when Task ID matches T-NNNN. Leave Task ID blank to create new tasks."
            />
          </div>
          {!file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) void processFile(dropped);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-border rounded-md p-8 flex flex-col items-center justify-center gap-3 hover:border-accent cursor-pointer bg-subtle"
            >
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) void processFile(selected);
              }} />
              <div className="w-10 h-10 rounded-md bg-accent-soft text-accent flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-small font-medium text-fg">{isParsing ? 'Reading file…' : 'Click to select file or drag and drop here'}</p>
              <p className="text-caption text-fg-muted">Supports .xlsx, .xls, .csv (Max 10MB)</p>
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
                    {isParsing ? 'Reading file…' : `${(file.size / 1024).toFixed(1)} KB • ${parsedItems.length} records detected`}
                  </div>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setFile(null); setParsedItems([]); setErrorMsg(null); }}>
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
          {parsedItems.length > 0 && !isParsing && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-caption font-semibold text-fg-muted uppercase tracking-wider">
                  Data preview (Showing {Math.min(10, parsedItems.length)} of {parsedItems.length} records)
                </span>
                <span className="text-caption text-success-fg font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready to import
                </span>
              </div>
              <div className="border border-border rounded-md overflow-hidden text-small">
                <table className="w-full divide-y divide-border text-left">
                  <thead className="bg-subtle font-medium text-fg-muted text-label">
                    <tr>
                      <th className="p-2">Task ID</th>
                      <th className="p-2">Task Name</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Assignee</th>
                      <th className="p-2">Project</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedItems.slice(0, 10).map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-numeric font-medium text-accent">{it.serial || 'AUTO'}</td>
                        <td className="p-2 truncate max-w-[180px] font-medium">{it.title}</td>
                        <td className="p-2">{it.status || 'todo'}</td>
                        <td className="p-2 truncate max-w-[140px]">{it.assignee_name || '—'}</td>
                        <td className="p-2 truncate max-w-[140px]">{it.client_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-border bg-surface flex items-center justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="button" variant="primary" disabled={parsedItems.length === 0 || isSubmitting || isParsing} onClick={() => void handleConfirmImport()}>
            {isSubmitting ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /><span>Importing...</span></>
            ) : (
              <span>Import <span className="font-numeric">{parsedItems.length}</span> records</span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
