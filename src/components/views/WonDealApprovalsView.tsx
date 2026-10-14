import React, { useCallback, useEffect, useState } from 'react';
import { Handshake } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import { crmApprovalsService, type WonDealApprovalItem } from '../../services/crmApprovalsService';

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: currency || 'PKR',
      maximumFractionDigits: 0,
    }).format(value || 0);
  } catch {
    return `${currency || 'PKR'} ${Math.round(value || 0).toLocaleString()}`;
  }
}

export const WonDealApprovalsView: React.FC = () => {
  const { addToast } = useToast();
  const [items, setItems] = useState<WonDealApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<WonDealApprovalItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await crmApprovalsService.listPending();
      setItems(rows);
    } catch (err: any) {
      addToast('Could not load won deals', err?.message || 'Try again.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (item: WonDealApprovalItem) => {
    setActingId(item.id);
    try {
      await crmApprovalsService.approve(item.id);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      addToast('Deal approved', `${item.title} is confirmed.`, 'success');
    } catch (err: any) {
      addToast('Could not approve', err?.message || 'Try again.', 'error');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    const reason = rejectReason.trim();
    if (!reason) {
      addToast('Reason required', 'Add a short note for sales.', 'error');
      return;
    }
    setActingId(rejecting.id);
    try {
      await crmApprovalsService.reject(rejecting.id, reason);
      setItems((prev) => prev.filter((row) => row.id !== rejecting.id));
      addToast('Deal sent back', `${rejecting.title} was rejected.`, 'success');
      setRejecting(null);
      setRejectReason('');
    } catch (err: any) {
      addToast('Could not reject', err?.message || 'Try again.', 'error');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-6">
      <PageHeader
        title="Won-deal approvals"
        description="Confirm or send back deals that sales marked as won. You do not get the sales pipeline."
      />

      {loading ? (
        <p className="text-ui text-fg-muted">Loading pending deals…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="No won deals waiting"
          description="When sales marks a deal as won, it appears here for operations to confirm."
        />
      ) : (
        <div className="space-y-3 max-w-3xl">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-fg truncate">{item.title}</p>
                  <p className="text-sm text-fg-muted mt-0.5">
                    {item.lead_or_company_name || 'Unnamed company'}
                    {item.sales_owner_name ? ` · ${item.sales_owner_name}` : ''}
                  </p>
                </div>
                <p className="text-sm font-semibold text-fg shrink-0">{money(item.value, item.currency)}</p>
              </div>
              {item.won_date ? (
                <p className="text-xs text-fg-muted">Won {item.won_date.slice(0, 10)}</p>
              ) : null}
              {item.won_note ? (
                <p className="text-sm text-fg-muted whitespace-pre-wrap">{item.won_note}</p>
              ) : null}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={actingId === item.id}
                  onClick={() => handleApprove(item)}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actingId === item.id}
                  onClick={() => {
                    setRejecting(item);
                    setRejectReason('');
                  }}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejecting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold text-fg">Reject {rejecting.title}?</h2>
            <p className="text-sm text-fg-muted">Sales will see this reason on the deal timeline.</p>
            <textarea
              className="w-full min-h-[96px] rounded-md border border-border bg-surface px-3 py-2 text-sm"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this not ready to confirm?"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRejecting(null);
                  setRejectReason('');
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleReject} disabled={actingId === rejecting.id}>
                Send back
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
