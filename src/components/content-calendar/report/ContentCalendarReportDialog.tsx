import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { contentCalendarService } from '../../../services/contentCalendarService';
import type { ContentCalendarReport, ReportAudience } from '../../../types/contentCalendarReport';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/utils';
import { ContentCalendarReportView } from './ContentCalendarReportView';
import { currentMonth, monthLabel, shiftMonth } from './reportFormat';

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  html, body, #root { background: #fff !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }
  body > *:not(.cc-report-root) { display: none !important; }
  .cc-report-root { position: static !important; inset: auto !important; display: block !important; overflow: visible !important; height: auto !important; background: #fff !important; z-index: auto !important; }
  .cc-report-scroll { overflow: visible !important; height: auto !important; }
  .cc-report-noprint { display: none !important; }
  .cc-report-body { padding: 0 !important; max-width: none !important; }
  .cc-report-section { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; }
  .cc-report-section.cc-report-breakable { break-inside: auto; page-break-inside: auto; }
  .cc-report-avoid { break-inside: avoid; page-break-inside: avoid; }
  .cc-report-table-wrap { overflow: visible !important; margin: 0 !important; padding: 0 !important; }
  .cc-report-table { font-size: 10px !important; }
  .cc-report-table th, .cc-report-table td { padding: 3px 4px !important; }
  .cc-report-table thead { display: table-header-group; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

export interface ContentCalendarReportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Staff can switch client and choose the client or internal version. */
  mode: 'staff' | 'client';
  defaultWorkspaceId?: string | null;
}

export const ContentCalendarReportDialog: React.FC<ContentCalendarReportDialogProps> = ({
  open,
  onClose,
  mode,
  defaultWorkspaceId,
}) => {
  const { workspaces } = useWorkspaces(open);
  const options = useMemo(
    () =>
      workspaces
        .filter((w) => mode === 'client' || w.status !== 'inactive')
        .map((w) => ({ id: w.id, name: w.name }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [workspaces, mode],
  );
  const [workspaceId, setWorkspaceId] = useState<string>(defaultWorkspaceId || '');
  const [month, setMonth] = useState<string>(() => currentMonth());
  const [audience, setAudience] = useState<ReportAudience>('client');
  const [report, setReport] = useState<ContentCalendarReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (defaultWorkspaceId) setWorkspaceId(defaultWorkspaceId);
  }, [defaultWorkspaceId]);

  useEffect(() => {
    if (!workspaceId && options.length > 0) setWorkspaceId(options[0].id);
  }, [options, workspaceId]);

  const months = useMemo(() => {
    const now = currentMonth();
    const list: string[] = [];
    for (let i = 2; i >= -12; i -= 1) list.push(shiftMonth(now, i));
    if (!list.includes(month)) list.push(month);
    return list;
  }, [month]);

  const load = useCallback(async () => {
    if (!open || !workspaceId) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await contentCalendarService.getReport({
        workspaceId,
        month,
        audience: mode === 'staff' ? audience : 'client',
      });
      if (id === reqId.current) setReport(res);
    } catch (err: any) {
      if (id === reqId.current) {
        setReport(null);
        setError(err?.message || 'Could not build the report.');
      }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [open, workspaceId, month, audience, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const handlePrint = useCallback(() => {
    // Always print the light theme.
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    const bodyDark = document.body.classList.contains('dark');
    const previousTitle = document.title;
    if (report) {
      document.title = `${report.workspace.name} - content report - ${monthLabel(report.period.month)}`;
    }
    if (wasDark) root.classList.remove('dark');
    if (bodyDark) document.body.classList.remove('dark');
    const restore = () => {
      if (wasDark) root.classList.add('dark');
      if (bodyDark) document.body.classList.add('dark');
      document.title = previousTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
  }, [report]);

  if (!open || typeof document === 'undefined') return null;

  const selectClass =
    'h-11 sm:h-8 rounded-md border border-border-strong bg-surface text-base sm:text-sm text-fg px-2.5 min-w-0 focus:border-accent focus:outline-hidden';

  return createPortal(
    <div
      className="cc-report-root fixed inset-0 z-[100] bg-canvas flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Content calendar report"
    >
      <style>{PRINT_CSS}</style>
      <div className="cc-report-noprint shrink-0 border-b border-border bg-surface px-3 sm:px-5 py-2 flex flex-wrap items-center gap-2" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <h2 className="text-sm font-semibold text-fg m-0 mr-auto">Content report</h2>
        <Button
          ref={closeRef}
          variant="ghost"
          className="h-11 w-11 sm:h-8 sm:w-8 p-0 order-first sm:order-last"
          onClick={onClose}
          aria-label="Close report"
          title="Close"
        >
          <X className="w-5 h-5" />
        </Button>
        <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
          {(mode === 'staff' || options.length > 1) && (
            <select
              aria-label="Client"
              className={cn(selectClass, 'w-full sm:w-52')}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
            >
              {options.length === 0 && <option value="">No clients</option>}
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 flex-1 sm:flex-none">
            <Button
              variant="ghost"
              className="h-11 w-11 sm:h-8 sm:w-8 p-0"
              aria-label="Previous month"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <select
              aria-label="Month"
              className={cn(selectClass, 'flex-1 sm:flex-none sm:w-40')}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              className="h-11 w-11 sm:h-8 sm:w-8 p-0"
              aria-label="Next month"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          {mode === 'staff' && (
            <div className="inline-flex rounded-md border border-border-strong overflow-hidden" role="group" aria-label="Report version">
              {(['client', 'internal'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={audience === a}
                  onClick={() => setAudience(a)}
                  className={cn(
                    'h-11 sm:h-8 px-3 text-sm sm:text-xs font-medium cursor-pointer',
                    audience === a ? 'bg-accent text-accent-fg' : 'bg-surface text-fg-2 hover:bg-hover',
                  )}
                >
                  {a === 'client' ? 'Client version' : 'Internal'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="cc-report-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {error ? (
          <div className="max-w-md mx-auto mt-16 text-center px-4">
            <p className="text-sm text-danger-fg">{error}</p>
            <Button variant="secondary" size="md" className="mt-3 h-11 sm:h-8" onClick={() => void load()} icon={RefreshCw}>
              Try again
            </Button>
          </div>
        ) : !report ? (
          <div className="max-w-[1080px] mx-auto p-4 space-y-4" aria-busy="true" aria-label="Loading report">
            <div className="h-28 rounded-2xl bg-skel animate-pulse" />
            <div className="h-24 rounded-2xl bg-skel animate-pulse" />
            <div className="h-64 rounded-2xl bg-skel animate-pulse" />
          </div>
        ) : (
          <div className={cn('transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
            <ContentCalendarReportView
              report={report}
              clientOnly={mode !== 'staff'}
              headerActions={
                <Button variant="secondary" className="h-11 sm:h-8 px-3 text-sm" icon={Download} onClick={handlePrint}>
                  Download PDF
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default ContentCalendarReportDialog;
