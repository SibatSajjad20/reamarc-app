import React, { useEffect, useState } from 'react';
import { financeService } from '../../services/financeService';
import { InvoicePreview } from './InvoicePreview';
import type { Invoice, FinanceSettings } from '../../types/finance';

function readInvoiceToken(): string {
  const match = window.location.pathname.match(/\/invoice\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

export const PublicInvoiceView: React.FC = () => {
  const [token] = useState<string>(readInvoiceToken);
  const [invoice, setInvoice] = useState<Partial<Invoice> | null>(null);
  const [company, setCompany] = useState<Partial<FinanceSettings> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Invoice link is missing.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await financeService.getPublicInvoice(token);
        if (cancelled) return;
        setInvoice(data?.invoice || null);
        const companyPayload = data?.company || {};
        setCompany({
          company_name: companyPayload.name,
          company_address: companyPayload.address,
          company_phone: companyPayload.phone,
          company_email: companyPayload.email,
          company_website: companyPayload.website,
          tax_id: companyPayload.tax_id,
        });
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Invoice link not found or expired');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-zinc-200 text-zinc-900">
      <div className="mx-auto max-w-[800px] px-4 py-8 sm:px-8">
        {loading && <p className="text-sm text-zinc-600">Loading invoice…</p>}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}
        {!loading && !error && invoice && (
          <InvoicePreview invoice={invoice} companySettings={company || undefined} />
        )}
      </div>
    </div>
  );
};
