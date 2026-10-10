import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, Search, Loader2 } from 'lucide-react';
import { crmService } from '../../services/crmService';
import type { CrmLead } from '../../types/crm';
import { Button } from '../ui/button';

interface CrmWonLeadMenuProps {
  onSelect: (lead: CrmLead) => void;
  label?: string;
  className?: string;
}

function leadSubtitle(lead: CrmLead): string {
  return [lead.company, lead.email].filter(Boolean).join(' · ') || 'Won lead';
}

export const CrmWonLeadMenu: React.FC<CrmWonLeadMenuProps> = ({
  onSelect,
  label = 'New deal',
  className = '',
}) => {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  const place = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 320;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const below = rect.bottom + 6;
    const panelHeight = 360;
    const top = below + panelHeight > window.innerHeight - 8 ? Math.max(8, rect.top - panelHeight - 6) : below;
    setBox({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPlace = () => place();
    window.addEventListener('resize', onPlace);
    window.addEventListener('scroll', onPlace, true);
    return () => {
      window.removeEventListener('resize', onPlace);
      window.removeEventListener('scroll', onPlace, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const delay = query.trim() ? 200 : 0;
    const timer = window.setTimeout(() => {
      setLoading(true);
      crmService
        .listLeads(
          { outcome: 'won', search: query.trim() || undefined, limit: 50 },
          { signal: ctrl.signal }
        )
        .then((res) => {
          const won = (res.items || []).filter((lead) => lead.outcome === 'won');
          setLeads(won);
          setTotal(res.total ?? won.length);
          setError(null);
        })
        .catch((err: { name?: string }) => {
          if (err?.name === 'AbortError') return;
          setError('Could not load won leads.');
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, delay);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, query]);

  const choose = (lead: CrmLead) => {
    if (lead.outcome !== 'won') return;
    setOpen(false);
    setQuery('');
    onSelect(lead);
  };

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        size="sm"
        variant="primary"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) setQuery('');
        }}
        className={className}
      >
        <Plus className="w-3.5 h-3.5 mr-1" />
        {label}
        <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open &&
        box &&
        createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="listbox"
            aria-label="Won leads"
            style={{ top: box.top, left: box.left }}
            className="fixed z-[var(--z-dialog,50)] w-80 rounded-lg border border-border bg-surface shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
          >
            <div className="p-2 border-b border-border bg-subtle/50">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search won leads…"
                  className="w-full h-8 pl-8 pr-2 rounded-md border border-border bg-surface text-xs text-fg placeholder:text-fg-muted outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <p className="px-1 pt-1.5 text-micro text-fg-muted">
                Only leads marked won can receive a deal.
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto p-1 divide-y divide-border/40">
              {loading && (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-fg-muted">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading won leads…</span>
                </div>
              )}
              {!loading && error && <p className="px-3 py-3 text-xs text-danger-fg">{error}</p>}
              {!loading && !error && leads.length === 0 && (
                <p className="px-3 py-3 text-xs text-fg-muted">
                  {query.trim()
                    ? 'No won leads match that search.'
                    : 'No won leads yet. Mark a lead as won, then create the deal.'}
                </p>
              )}
              {!loading &&
                !error &&
                leads.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    role="option"
                    onClick={() => choose(lead)}
                    className="w-full text-left px-2.5 py-2 rounded-md hover:bg-hover transition-colors cursor-pointer"
                  >
                    <span className="block text-xs font-medium text-fg truncate">
                      {lead.name}
                    </span>
                    <span className="block text-micro text-fg-muted truncate">{leadSubtitle(lead)}</span>
                  </button>
                ))}
            </div>
            {!loading && !error && total > leads.length && (
              <p className="px-3 py-2 border-t border-border bg-subtle/30 text-micro text-fg-muted">
                Showing {leads.length} of {total}. Search to narrow the list.
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
};
