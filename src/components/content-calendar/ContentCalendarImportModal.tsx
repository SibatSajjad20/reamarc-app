import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
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
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { findMatchingClient } from './ContentCalendarModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  activeClients: { id: string; name: string }[];
}

export const deriveClientAbbr = (clientName?: string): string => {
  if (!clientName) return 'AT';
  const clean = clientName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'AT';
  const legal = new Set([
    'llc', 'inc', 'corp', 'corporation', 'ltd', 'limited', 'co', 'company',
    'pvt', 'private', 'plc',
  ]);
  const stopWords = new Set(['and', 'the', 'of', 'for', 'in', 'to', 'a', 'an']);
  const filtered = words.filter((w: string) => !legal.has(w.toLowerCase()));
  const target = (filtered.length > 0 ? filtered : words).filter((w: string) => !stopWords.has(w.toLowerCase()));
  const finalWords = target.length > 0 ? target : filtered.length > 0 ? filtered : words;
  return finalWords.length >= 2
    ? finalWords.slice(0, 3).map((w: string) => w[0].toUpperCase()).join('')
    : finalWords[0] ? finalWords[0].slice(0, 3).toUpperCase() : 'AT';
};

interface RawImportItem {
  rawNum?: number;
  detectedClient?: string;
  item: Partial<ContentCalendarItem>;
}

const prepareItems = (
  rawList: RawImportItem[],
  selectedClient: string,
  forceSelectedClient: boolean,
  activeClients: Array<{ id: string; name: string }> = []
): Partial<ContentCalendarItem>[] => {
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

  return rawList.map((raw, idx) => {
    const next = { ...raw.item };
    const effectiveClient = (forceSelectedClient || !raw.detectedClient)
      ? selectedClient
      : raw.detectedClient;

    const matchedWs = findMatchingClient(effectiveClient, activeClients) || findMatchingClient(selectedClient, activeClients);
    if (matchedWs) {
      next.client_name = matchedWs.name;
      next.workspace_id = matchedWs.id;
    } else {
      next.client_name = effectiveClient;
    }

    const abbr = deriveClientAbbr(next.client_name);
    const num = raw.rawNum !== undefined ? raw.rawNum : idx + 1;
    next.serial = `C${abbr}-${String(num).padStart(3, '0')}`;

    if (!next.content_concept) {
      next.content_concept =
        next.content_on_creative?.slice(0, 100) ||
        next.production_direction?.slice(0, 100) ||
        next.primary_text?.split('\n')[0]?.slice(0, 100) ||
        `Asset ${next.serial}`;
    }

    (Object.keys(limits) as (keyof ContentCalendarItem)[]).forEach((field) => {
      const rawVal = next[field];
      const limit = limits[field];
      if (typeof rawVal === 'string' && limit && rawVal.length > limit) {
        (next as Record<string, string>)[field] = rawVal.slice(0, limit);
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

    if (!next.content_type) {
      next.content_type = 'Scheduled';
    }
    if (!next.creative_category) {
      next.creative_category = 'Organic Creative';
    }

    return next;
  });
};

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
  const [rawItems, setRawItems] = useState<RawImportItem[]>([]);
  const [parsedItems, setParsedItems] = useState<Partial<ContentCalendarItem>[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Import settings
  const [upsertBySerial, setUpsertBySerial] = useState(true);
  const [overrideClient, setOverrideClient] = useState(true);
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

      // Flexible header and multi-section parser
      const parseDateValue = (val: any): string | null => {
        if (!val) return null;
        const str = String(val).trim();
        if (!str) return null;
        const num = Number(str);
        if (!isNaN(num) && num > 30000 && num < 60000) {
          const d = new Date(Math.round((num - 25569) * 86400 * 1000));
          return d.toISOString().split('T')[0];
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
        const parsed = Date.parse(str);
        if (!isNaN(parsed)) {
          const d = new Date(parsed);
          return d.toISOString().split('T')[0];
        }
        return str;
      };

      const CHANNEL_NAMES = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'website', 'twitter', 'x'];

      let activeHeaderMap: Record<number, keyof ContentCalendarItem> | null = null;
      let activeChannelMap: Record<number, string> = {};
      let currentSectionClient = defaultClient;
      const rawExtracted: RawImportItem[] = [];

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const rowJoined = row.map((c: any) => String(c || '').trim()).filter(Boolean);
        if (rowJoined.length === 0) continue;

        // Detect section client name if available
        const rowFullText = rowJoined.join(' ').toLowerCase();
        if (rowJoined.length <= 3 && !rowFullText.includes('serial') && !rowFullText.includes('creative type')) {
          const candidate = rowJoined.find((c: string) => {
            const cl = c.toLowerCase();
            return (
              cl !== 'essential' &&
              cl !== 'goal/theme' &&
              cl !== 'profile details' &&
              cl !== 'run time tasks' &&
              c.length > 2 &&
              c.length < 50
            );
          });
          if (candidate && (candidate.toLowerCase().includes('mall') || candidate.toLowerCase().includes('developer') || candidate.toLowerCase().includes('llc') || candidate.toLowerCase().includes('zem'))) {
            currentSectionClient = candidate.trim();
          }
        }

        const officialNameCol = row.findIndex((c: any) => String(c || '').toLowerCase().includes('official business name'));
        if (officialNameCol !== -1 && row[officialNameCol + 1]) {
          const cand = String(row[officialNameCol + 1]).trim();
          if (cand && cand.length < 50) currentSectionClient = cand;
        }

        // Check if row is a header row
        const rowNorms = row.map((c: any) => normalizeHeader(String(c || '')));
        const hasSerial = rowNorms.some((n: string) => n === 'serial' || n === 'serialid' || n === 'sr' || n === 'sno');
        const hasConceptOrCampaignOrCreative = rowNorms.some((n: string) =>
          n.includes('creative') ||
          n.includes('concept') ||
          n.includes('campaign') ||
          n.includes('topic') ||
          n.includes('postdescription') ||
          n.includes('date') ||
          n.includes('status')
        );

        if (hasSerial && hasConceptOrCampaignOrCreative) {
          activeHeaderMap = {};
          activeChannelMap = {};

          row.forEach((h: any, idx: number) => {
            const norm = normalizeHeader(String(h || ''));
            if (!norm) return;

            if (norm === 'serial' || norm === 'serialid' || norm === 'sr' || norm === 'sno') {
              activeHeaderMap![idx] = 'serial';
            } else if (norm === 'client' || norm === 'clientname') {
              activeHeaderMap![idx] = 'client_name';
            } else if (norm === 'campaigntype' || norm === 'campaign') {
              activeHeaderMap![idx] = 'campaign_type';
            } else if (norm === 'creativetype' || norm === 'format') {
              activeHeaderMap![idx] = 'creative_type';
            } else if (norm === 'contenttype' || norm.includes('scheduledruntime') || norm === 'scheduletype') {
              activeHeaderMap![idx] = 'content_type';
            } else if (norm === 'creativecategory' || norm.includes('organiccreative') || norm.includes('adcreative') || norm === 'postingtype') {
              activeHeaderMap![idx] = 'creative_category';
            } else if (norm.includes('contentpillar') || norm.includes('pillar')) {
              activeHeaderMap![idx] = 'content_pillar';
            } else if (
              norm.includes('contentconcept') ||
              norm.includes('concept') ||
              norm.includes('topictheme') ||
              norm === 'topic' ||
              norm === 'context' ||
              norm === 'title'
            ) {
              activeHeaderMap![idx] = 'content_concept';
            } else if (norm === 'offer') {
              activeHeaderMap![idx] = 'offer';
            } else if (norm === 'idea' || norm.includes('productiondirection') || norm === 'direction') {
              activeHeaderMap![idx] = 'production_direction';
            } else if (
              norm.includes('designdue') ||
              norm.includes('designcompletion') ||
              (norm.includes('design') && norm.includes('date')) ||
              norm === 'due'
            ) {
              activeHeaderMap![idx] = 'design_due';
            } else if (
              norm.includes('primarytext') ||
              norm.includes('adcopy') ||
              norm === 'copy' ||
              norm.includes('postdescription') ||
              norm.includes('description')
            ) {
              activeHeaderMap![idx] = 'primary_text';
            } else if (norm.includes('headlines') || norm.includes('hooks')) {
              activeHeaderMap![idx] = 'headlines_hooks';
            } else if (norm.includes('contentoncreative') || norm.includes('copyoncreative')) {
              activeHeaderMap![idx] = 'content_on_creative';
            } else if (norm === 'cta' || norm.includes('postcta') || norm.includes('calltoaction')) {
              activeHeaderMap![idx] = 'cta';
            } else if (norm.includes('captions') || norm.includes('hashtags') || norm.includes('keywords')) {
              if (!activeHeaderMap![idx]) activeHeaderMap![idx] = 'captions_hashtags';
            } else if (norm.includes('designowner') || norm === 'owner') {
              activeHeaderMap![idx] = 'design_owner';
            } else if (
              norm.includes('postingdate') ||
              norm.includes('publishdate') ||
              norm.includes('postdate') ||
              norm.includes('scheduledate') ||
              norm === 'date'
            ) {
              activeHeaderMap![idx] = 'publish_date';
            } else if (norm.includes('draft') || norm.includes('previewlink')) {
              activeHeaderMap![idx] = 'draft_preview_link';
            } else if (norm.includes('final') || norm.includes('assetlink')) {
              activeHeaderMap![idx] = 'final_asset_link';
            } else if (norm.includes('approvalstatus') || norm === 'approval' || norm === 'status') {
              activeHeaderMap![idx] = 'approval_status';
            } else if (norm.includes('setupstatus') || norm === 'setup' || norm.includes('postingstatus')) {
              activeHeaderMap![idx] = 'setup_status';
            } else if (norm === 'stage' || norm.includes('pipelinestage')) {
              activeHeaderMap![idx] = 'stage';
            } else if (norm === 'notes' || norm === 'note' || norm.includes('performance')) {
              activeHeaderMap![idx] = 'notes';
            }

            const matchedChannel = CHANNEL_NAMES.find((ch) => norm === ch || norm.startsWith(ch));
            if (matchedChannel) {
              activeChannelMap[idx] = matchedChannel.charAt(0).toUpperCase() + matchedChannel.slice(1);
            }
          });
          continue;
        }

        if (!activeHeaderMap) continue;

        // Parse row
        const item: any = {};
        const channels: string[] = [];
        let hasAnyValue = false;

        Object.entries(activeHeaderMap).forEach(([colIdxStr, fieldKey]) => {
          const colIdx = Number(colIdxStr);
          const rawVal = row[colIdx];
          if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
            hasAnyValue = true;
            let strVal = String(rawVal).trim();
            // Handle double pipe formatting typos like 'Pending Approval||2026-05-25'
            if (strVal.includes('||')) {
              const parts = strVal.split('||').map((p) => p.trim());
              strVal = parts[0];
              if (parts[1] && !item['publish_date']) {
                item['publish_date'] = parseDateValue(parts[1]);
              }
            }
            if (strVal.startsWith('=') || strVal.startsWith('+') || strVal.startsWith('-') || strVal.startsWith('@')) {
              strVal = "'" + strVal;
            }
            item[fieldKey] = strVal;
          }
        });

        // Extract active channels
        Object.entries(activeChannelMap).forEach(([colIdxStr, channelName]) => {
          const colIdx = Number(colIdxStr);
          const val = row[colIdx];
          if (val !== undefined && val !== null && String(val).trim()) {
            const valStr = String(val).trim().toLowerCase();
            if (valStr === 'yes' || valStr === 'y' || valStr === '1' || valStr.includes('video') || valStr.startsWith('http')) {
              channels.push(channelName);
            }
          }
        });

        if (channels.length > 0) {
          item.channels = channels;
        }

        // Filter out repeating headers or non-record rows
        if (
          item.serial &&
          isNaN(Number(item.serial)) &&
          !item.serial.match(/^C[A-Z0-9-]+$/i) &&
          !item.content_on_creative &&
          !item.primary_text &&
          !item.content_concept
        ) {
          continue;
        }

        // Must have at least a serial, creative type, creative copy, or concept to be a valid campaign record
        if (hasAnyValue && (item.content_concept || item.serial || item.content_on_creative || item.primary_text)) {
          let rawNum: number | undefined = undefined;
          if (item.serial) {
            const numMatch = String(item.serial).match(/(\d+)/);
            if (numMatch) {
              rawNum = parseInt(numMatch[1], 10);
            }
          }

          if (item.publish_date) {
            item.publish_date = parseDateValue(item.publish_date);
          }
          if (item.design_due) {
            item.design_due = parseDateValue(item.design_due);
          }

          // If primary_text has hashtags and captions_hashtags is empty
          if (item.primary_text && !item.captions_hashtags) {
            const hashMatch = item.primary_text.match(/#\w+/g);
            if (hashMatch) {
              item.captions_hashtags = hashMatch.join(' ');
            }
          }

          rawExtracted.push({
            rawNum,
            detectedClient: item.client_name || currentSectionClient || undefined,
            item,
          });
        }
      }

      if (rawExtracted.length === 0) {
        throw new Error('No valid campaign records found in file. Please verify column headers.');
      }
      if (rawExtracted.length > 10000) {
        throw new Error('This file has more than 10,000 campaigns. Split it into smaller workbooks and import those.');
      }

      setRawItems(rawExtracted);
      const prepared = prepareItems(rawExtracted, defaultClient, overrideClient, activeClients);
      setParsedItems(prepared);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse Excel workbook.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleClientChange = (val: string) => {
    setDefaultClient(val);
    if (rawItems.length > 0) {
      setParsedItems(prepareItems(rawItems, val, overrideClient, activeClients));
    }
  };

  const handleOverrideClientChange = (val: boolean) => {
    setOverrideClient(val);
    if (rawItems.length > 0) {
      setParsedItems(prepareItems(rawItems, defaultClient, val, activeClients));
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
    <Dialog open={isOpen} onOpenChange={(open: boolean) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent maxWidth="lg" className="p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4.5 h-4.5" />
            </div>
            <div>
              <DialogTitle className="text-ui font-semibold text-fg">
                Import content calendar from Excel
              </DialogTitle>
              <DialogDescription className="text-caption text-fg-muted mt-0.5">
                Upload campaign plan spreadsheets to populate your content schedule
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {/* Target Client & Import Settings */}
          <div className="p-4 rounded-md bg-subtle border border-border space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <div>
                <label className="text-caption font-medium text-fg block mb-1">
                  Target client
                </label>
                <CustomSelect
                  size="sm"
                  value={defaultClient}
                  onChange={handleClientChange}
                  options={[
                    ...activeClients.map((c) => ({ value: c.name, label: c.name })),
                    ...(!activeClients.some((c) => c.name === 'Apex Transfers LLC')
                      ? [{ value: 'Apex Transfers LLC', label: 'Apex Transfers LLC' }]
                      : []),
                  ]}
                />
              </div>

              <div className="space-y-2 pt-1 sm:pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideClient}
                    onChange={(e) => handleOverrideClientChange(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent accent-accent"
                  />
                  <div>
                    <div className="text-xs font-medium text-fg">
                      Apply to all imported records
                    </div>
                    <div className="text-caption text-fg-muted">
                      Standardize all campaigns and serial IDs to selected client
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={upsertBySerial}
                    onChange={(e) => setUpsertBySerial(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent accent-accent"
                  />
                  <div>
                    <div className="text-xs font-medium text-fg">
                      Upsert by serial
                    </div>
                    <div className="text-caption text-fg-muted">
                      Update existing campaigns if serial ID matches
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* File Upload Zone */}
          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-border hover:border-accent rounded-md p-8 flex flex-col items-center justify-center gap-3 cursor-pointer bg-subtle transition-colors group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-10 h-10 rounded-md bg-accent-soft text-accent flex items-center justify-center group-hover:scale-105 transition-transform">
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-fg">
                  Click to select file or drag and drop here
                </p>
                <p className="text-caption text-fg-muted mt-0.5">Supports .xlsx, .xls, .csv (Max 10MB)</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3.5 rounded-md bg-subtle border border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-status-success-soft text-status-success-fg border border-status-success-border flex items-center justify-center">
                  <FileText className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-fg">{file.name}</div>
                  <div className="text-caption text-fg-muted font-mono">
                    {(file.size / 1024).toFixed(1)} KB &bull; {parsedItems.length} records detected
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFile(null);
                  setRawItems([]);
                  setParsedItems([]);
                  setErrorMsg(null);
                }}
                className="text-caption text-fg-muted hover:text-status-danger-fg"
              >
                Change file
              </Button>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-md bg-status-danger-soft border border-status-danger-border flex items-center gap-2.5 text-xs text-status-danger-fg">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Parsing Spinner */}
          {isParsing && (
            <div className="py-6 flex items-center justify-center gap-2 text-xs text-fg-muted">
              <RefreshCw className="w-4 h-4 animate-spin text-accent" />
              <span>Analyzing spreadsheet columns and rows...</span>
            </div>
          )}

          {/* Parsed Preview */}
          {parsedItems.length > 0 && !isParsing && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-caption font-semibold text-fg-muted uppercase tracking-wider">
                  Data preview (Showing {Math.min(10, parsedItems.length)} of {parsedItems.length} records)
                </span>
                <span className="text-caption text-status-success-fg font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready to import
                </span>
              </div>

              <div className="border border-border rounded-md overflow-hidden text-xs">
                <table className="w-full divide-y divide-border text-left">
                  <thead className="bg-subtle font-medium text-fg-muted">
                    <tr>
                      <th className="p-2">Serial</th>
                      <th className="p-2">Client</th>
                      <th className="p-2">Creative</th>
                      <th className="p-2">Concept / title</th>
                      <th className="p-2">Stage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedItems.slice(0, 10).map((it, idx) => (
                      <tr key={idx} className="hover:bg-subtle/50 transition-colors">
                        <td className="p-2 font-mono font-medium text-accent">
                          {it.serial || '—'}
                        </td>
                        <td className="p-2 truncate max-w-[140px]" title={it.client_name || defaultClient}>
                          {it.client_name || defaultClient}
                        </td>
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
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-border bg-surface flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="primary"
            disabled={parsedItems.length === 0 || isSubmitting}
            onClick={handleConfirmImport}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                <span>Importing...</span>
              </>
            ) : (
              <span>Import {parsedItems.length} records</span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
