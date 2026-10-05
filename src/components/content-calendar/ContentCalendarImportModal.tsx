import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  X,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FileText,
} from 'lucide-react';
import type { ContentCalendarItem } from '../../types/contentCalendar';
import { PIPELINE_STAGES } from '../../types/contentCalendar';
import { contentCalendarService } from '../../services/contentCalendarService';
import { useToast } from '../../context/ToastContext';
import { CustomSelect } from '../ui/CustomSelect';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  activeClients: { id: string; name: string }[];
}

export const ContentCalendarImportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  activeClients,
}) => {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parsedItems, setParsedItems] = useState<Partial<ContentCalendarItem>[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Import settings
  const [upsertBySerial, setUpsertBySerial] = useState(true);
  const [defaultClient, setDefaultClient] = useState(
    activeClients.length > 0 ? activeClients[0].name : 'Apex Transfers LLC'
  );

  if (!isOpen) return null;

  const normalizeHeader = (h: string): string => {
    return h.toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    await processFile(selected);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    await processFile(dropped);
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
      const wb = XLSX.read(buffer, { type: 'array' });

      // Target 'Production & Approval' sheet or first sheet
      const sheetName = wb.SheetNames.includes('Production & Approval')
        ? 'Production & Approval'
        : wb.SheetNames[0];

      const ws = wb.Sheets[sheetName];
      if (!ws) {
        throw new Error('Worksheet is empty or could not be found.');
      }

      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) {
        throw new Error('File does not contain enough data rows.');
      }

      // Determine header row: Row 0 or Row 1
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const rowStr = rows[i].map((c) => String(c).toLowerCase()).join(' ');
        if (rowStr.includes('serial') || rowStr.includes('concept') || rowStr.includes('campaign')) {
          headerRowIndex = i;
          break;
        }
      }

      const rawHeaders = rows[headerRowIndex].map((h: any) => String(h || '').trim());
      const headerMap: Record<number, keyof ContentCalendarItem> = {};

      rawHeaders.forEach((h: string, idx: number) => {
        const norm = normalizeHeader(h);
        if (norm === 'serial' || norm === 'serialid') headerMap[idx] = 'serial';
        else if (norm === 'client' || norm === 'clientname') headerMap[idx] = 'client_name';
        else if (norm === 'campaigntype' || norm === 'campaign') headerMap[idx] = 'campaign_type';
        else if (norm === 'creativetype' || norm === 'format') headerMap[idx] = 'creative_type';
        else if (norm.includes('contentpillar') || norm.includes('pillar')) headerMap[idx] = 'content_pillar';
        else if (norm.includes('contentconcept') || norm === 'concept' || norm === 'title') headerMap[idx] = 'content_concept';
        else if (norm === 'offer') headerMap[idx] = 'offer';
        else if (norm.includes('productiondirection') || norm === 'direction') headerMap[idx] = 'production_direction';
        else if (norm.includes('primarytext') || norm.includes('adcopy') || norm === 'copy') headerMap[idx] = 'primary_text';
        else if (norm.includes('headlines') || norm.includes('hooks')) headerMap[idx] = 'headlines_hooks';
        else if (norm.includes('contentoncreative')) headerMap[idx] = 'content_on_creative';
        else if (norm === 'cta' || norm.includes('calltoaction')) headerMap[idx] = 'cta';
        else if (norm.includes('captions') || norm.includes('hashtags')) headerMap[idx] = 'captions_hashtags';
        else if (norm.includes('designowner') || norm === 'owner') headerMap[idx] = 'design_owner';
        else if (norm.includes('designdue') || norm === 'due') headerMap[idx] = 'design_due';
        else if (norm.includes('publishdate') || norm === 'date') headerMap[idx] = 'publish_date';
        else if (norm.includes('draft') || norm.includes('previewlink')) headerMap[idx] = 'draft_preview_link';
        else if (norm.includes('final') || norm.includes('assetlink')) headerMap[idx] = 'final_asset_link';
        else if (norm.includes('approvalstatus') || norm === 'approval') headerMap[idx] = 'approval_status';
        else if (norm.includes('setupstatus') || norm === 'setup') headerMap[idx] = 'setup_status';
        else if (norm === 'stage' || norm.includes('pipelinestage')) headerMap[idx] = 'stage';
        else if (norm === 'notes' || norm === 'note') headerMap[idx] = 'notes';
      });

      const extracted: Partial<ContentCalendarItem>[] = [];

      for (let r = headerRowIndex + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const item: any = {};
        let hasAnyValue = false;

        Object.entries(headerMap).forEach(([colIdx, fieldKey]) => {
          const rawVal = row[Number(colIdx)];
          if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
            hasAnyValue = true;
            let strVal = String(rawVal).trim();
            // Sanitize against formula injection
            if (strVal.startsWith('=') || strVal.startsWith('+') || strVal.startsWith('-') || strVal.startsWith('@')) {
              strVal = "'" + strVal;
            }
            item[fieldKey] = strVal;
          }
        });

        // Must have at least a concept or serial to be considered a campaign record
        if (hasAnyValue && (item.content_concept || item.serial)) {
          if (!item.client_name) {
            item.client_name = defaultClient;
          }
          const clientVal = item.client_name || defaultClient;
          const clean = clientVal.replace(/[^a-zA-Z0-9\s]/g, '').trim();
          const words = clean.split(/\s+/).filter(Boolean);
          const legal = new Set(['llc', 'inc', 'corp', 'corporation', 'ltd', 'limited', 'co', 'company']);
          const stopWords = new Set(['and', 'the', 'of', 'for', 'in', 'to', 'a', 'an']);
          const filtered = words.filter((w: string) => !legal.has(w.toLowerCase()));
          const meaningful = filtered.filter((w: string) => !stopWords.has(w.toLowerCase()));
          const target = meaningful.length > 0 ? meaningful : filtered.length > 0 ? filtered : words;
          const abbr =
            target.length >= 2
              ? target.slice(0, 3).map((w: string) => w[0].toUpperCase()).join('')
              : target[0] ? target[0].slice(0, 3).toUpperCase() : 'AT';

          if (!item.serial) {
            item.serial = `C${abbr}-${String(extracted.length + 1).padStart(3, '0')}`;
          } else {
            const numMatch = String(item.serial).match(/(\d+)/);
            if (numMatch) {
              const num = parseInt(numMatch[1], 10);
              item.serial = `C${abbr}-${String(num).padStart(3, '0')}`;
            }
          }
          if (!item.content_concept) {
            item.content_concept = `Asset ${item.serial}`;
          }
          extracted.push(item);
        }

      }

      if (extracted.length === 0) {
        throw new Error('No valid campaign records found in file. Please verify column headers.');
      }
      if (extracted.length > 10000) {
        throw new Error('This file has more than 10,000 campaigns. Split it into smaller workbooks and import those.');
      }

      const limits: Partial<Record<keyof ContentCalendarItem, number>> = {
        content_concept: 300,
        primary_text: 8000,
        headlines_hooks: 4000,
        content_on_creative: 4000,
        production_direction: 4000,
        captions_hashtags: 2000,
        notes: 8000,
        client_name: 160,
      };
      const knownStages = new Set<string>(PIPELINE_STAGES);
      const prepared = extracted.map((row) => {
        const next = { ...row };
        (Object.keys(limits) as (keyof ContentCalendarItem)[]).forEach((field) => {
          const raw = next[field];
          const limit = limits[field];
          if (typeof raw === 'string' && limit && raw.length > limit) {
            (next as Record<string, string>)[field] = raw.slice(0, limit);
          }
        });
        for (const field of ['draft_preview_link', 'final_asset_link'] as const) {
          const link = String(next[field] || '').trim();
          if (!link) continue;
          try {
            const url = new URL(link);
            if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username) {
              delete next[field];
            }
          } catch {
            delete next[field];
          }
        }
        if (next.stage && !knownStages.has(next.stage)) {
          next.stage = 'Content';
        }
        return next;
      });

      setParsedItems(prepared);
    } catch (err: any) {
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
      const chunkSize = 500;
      for (let offset = 0; offset < parsedItems.length; offset += chunkSize) {
        const res = await contentCalendarService.bulkImport({
          items: parsedItems.slice(offset, offset + chunkSize),
          upsert_by_serial: upsertBySerial,
          default_client_name: defaultClient,
        });
        processed += res.total_processed;
        inserted += res.inserted_count;
        updated += res.updated_count;
      }

      addToast(
        'Import Completed',
        `Processed ${processed} items (${inserted} added, ${updated} updated).`,
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast('Import Failed', err?.message || 'Could not import items', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Import Content Calendar from Excel
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Upload campaign plan spreadsheets to populate your content schedule
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* File Upload Zone */}
          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer bg-zinc-50/50 dark:bg-zinc-900/30 transition-colors group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Click to select file or drag & drop here
                </p>
                <p className="text-xs text-zinc-400 mt-1">Supports .xlsx, .xls, .csv (Max 10MB)</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{file.name}</div>
                  <div className="text-[11px] text-zinc-400 font-numeric">
                    {(file.size / 1024).toFixed(1)} KB &bull; {parsedItems.length} records detected
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setParsedItems([]);
                  setErrorMsg(null);
                }}
                className="text-xs text-zinc-400 hover:text-rose-500 font-semibold transition"
              >
                Change File
              </button>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Parsing Spinner */}
          {isParsing && (
            <div className="py-6 flex items-center justify-center gap-2 text-xs text-zinc-500">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              <span>Analyzing spreadsheet columns and rows...</span>
            </div>
          )}

          {/* Parsed Preview & Options */}
          {parsedItems.length > 0 && !isParsing && (
            <div className="space-y-4 animate-in fade-in">
              {/* Import Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                    Default Client
                  </label>
                  <CustomSelect
                    size="sm"
                    value={defaultClient}
                    onChange={(val) => setDefaultClient(val)}
                    options={[
                      ...activeClients.map((c) => ({ value: c.name, label: c.name })),
                      ...(!activeClients.some((c) => c.name === 'Apex Transfers LLC')
                        ? [{ value: 'Apex Transfers LLC', label: 'Apex Transfers LLC' }]
                        : []),
                    ]}
                  />
                </div>

                <div className="flex items-center justify-between pt-4 sm:pt-2">
                  <div>
                    <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      Upsert by Serial
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Update existing campaigns if Serial ID matches
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={upsertBySerial}
                    onChange={(e) => setUpsertBySerial(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-zinc-300"
                  />
                </div>
              </div>

              {/* Data Preview */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                    Data Preview (First 5 of {parsedItems.length} records)
                  </span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ready to Import
                  </span>
                </div>

                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden text-xs">
                  <table className="w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-left">
                    <thead className="bg-zinc-100 dark:bg-zinc-800/60 font-semibold text-zinc-600 dark:text-zinc-400">
                      <tr>
                        <th className="p-2">Serial</th>
                        <th className="p-2">Client</th>
                        <th className="p-2">Creative</th>
                        <th className="p-2">Concept / Title</th>
                        <th className="p-2">Stage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {parsedItems.slice(0, 5).map((it, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                          <td className="p-2 font-numeric font-bold text-indigo-600 dark:text-indigo-400">
                            {it.serial || '—'}
                          </td>
                          <td className="p-2 truncate max-w-[120px]">{it.client_name || defaultClient}</td>
                          <td className="p-2">{it.creative_type || 'Video'}</td>
                          <td className="p-2 truncate max-w-[180px] font-medium" title={it.content_concept}>
                            {it.content_concept}
                          </td>
                          <td className="p-2">{it.stage || 'Content'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={parsedItems.length === 0 || isSubmitting}
            onClick={handleConfirmImport}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Importing...</span>
              </>
            ) : (
              <span>Import {parsedItems.length} Records</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
