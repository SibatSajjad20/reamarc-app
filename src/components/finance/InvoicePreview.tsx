import React from 'react';
import type { Invoice, InvoiceLineItem, Currency, BankAccountConfig } from '../../types/finance';
import { formatMinorMoney, amountInWords } from '../../utils/money';

interface InvoicePreviewProps {
  invoice: Partial<Invoice> & {
    client_name?: string;
    line_items?: InvoiceLineItem[];
    currency?: Currency;
    subtotal?: number;
    discount_amount?: number;
    total?: number;
    amount_paid?: number;
    wht_settled?: number;
    balance_due?: number;
  };
  companySettings?: {
    company_id?: string;
    company_name?: string;
    company_address?: string;
    company_phone?: string;
    company_email?: string;
    company_website?: string;
    tax_id?: string;
    bank_accounts?: BankAccountConfig[];
    signature_labels?: string[];
    notes_template?: string;
    terms_template?: string;
  };
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-x-2.5 py-[3px] text-[11px] leading-4">
      <dt className="text-right text-zinc-500">{label}</dt>
      <dd className="text-zinc-900 font-numeric">{value}</dd>
    </div>
  );
}

export const InvoicePreview: React.FC<InvoicePreviewProps> = ({ invoice, companySettings }) => {
  const currency = invoice.currency || 'PKR';
  const subtotal = invoice.subtotal || 0;
  const discountAmount = invoice.discount_amount || 0;
  const total = invoice.total || 0;
  const amountPaid = invoice.amount_paid || 0;
  const whtSettled = invoice.wht_settled || 0;
  const balanceDue = invoice.balance_due !== undefined ? invoice.balance_due : total;

  const items = invoice.line_items || [];
  const status = (invoice.status || 'draft').toLowerCase();

  const compName = companySettings?.company_name || '';
  const compAddr = companySettings?.company_address || '';
  const compPhone = companySettings?.company_phone || '';
  const compEmail = companySettings?.company_email || '';
  const compWeb = companySettings?.company_website || '';
  const taxId = companySettings?.tax_id || '';
  // Reamarc's wordmark and stamp only belong on Reamarc's own invoices.
  const settingsCompanyId = companySettings?.company_id || invoice.company_id;
  const isReamarc = !settingsCompanyId || settingsCompanyId === 'company_reamarc';

  const defaultBank = companySettings?.bank_accounts?.[0] || {
    bank_name: '',
    account_title: '',
    account_number: '',
    iban: '',
    swift_code: '',
  };
  const payToBank = invoice.pay_to_bank || defaultBank;
  const signatures = [
    { id: 'manager', label: 'Account Manager' },
    { id: 'stamp', label: null as string | null },
    { id: 'ceo', label: 'CEO' },
  ];

  return (
    <article className="relative mx-auto max-w-[720px] bg-white text-zinc-900 px-10 py-9 subpixel-antialiased [font-synthesis:none]">
      {status === 'paid' && (
        <div className="absolute top-24 right-10 text-[11px] font-semibold tracking-[0.28em] text-emerald-700">
          PAID
        </div>
      )}
      {status === 'partially_paid' && (
        <div className="absolute top-24 right-10 text-[11px] font-semibold tracking-[0.18em] text-amber-700">
          PARTIALLY PAID
        </div>
      )}
      {status === 'void' && (
        <div className="absolute top-24 right-10 text-[11px] font-semibold tracking-[0.28em] text-rose-700">
          ON HOLD
        </div>
      )}

      <header className="flex items-start justify-between gap-8">
        {isReamarc ? (
          <img
            src="/assets/reamarc-wordmark.png?v=5"
            alt="Reamarc Digital Solutions"
            className="h-12 w-auto shrink-0"
            draggable={false}
          />
        ) : (
          <p className="text-xl font-bold text-zinc-900 shrink-0">{compName}</p>
        )}
        <div className="text-right text-[11px] leading-[1.55] text-zinc-600 shrink-0">
          <p className="whitespace-pre-line">{compAddr}</p>
          <p>{compPhone}</p>
          <p>{compEmail}</p>
          <p>{compWeb}</p>
          <p>{taxId}</p>
        </div>
      </header>

      <div className="mt-8 mb-7 h-px bg-zinc-200" />

      <div className="flex items-start justify-between gap-10">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Bill to</p>
          <p className="mt-2 text-[15px] font-semibold tracking-[-0.01em]">{invoice.client_name || 'Client Name'}</p>
          {invoice.client_billing?.address && (
            <p className="mt-1 text-[11px] leading-4 text-zinc-600 whitespace-pre-line">
              {invoice.client_billing.address}
            </p>
          )}
          {(invoice.client_billing?.email || invoice.client_billing?.phone) && (
            <p className="mt-1 text-[11px] text-zinc-600">
              {[invoice.client_billing.email, invoice.client_billing.phone].filter(Boolean).join('  ·  ')}
            </p>
          )}
          {invoice.client_billing?.tax_id && (
            <p className="mt-1 text-[11px] text-zinc-500">NTN / Tax ID: {invoice.client_billing.tax_id}</p>
          )}
        </div>

        <div>
          <dl className="w-[220px]">
            <MetaRow label="INVOICE" value={invoice.number || 'DRAFT'} />
            <MetaRow label="DATE" value={invoice.issue_date || '—'} />
            <MetaRow label="TERMS" value={invoice.terms || 'Due on receipt'} />
            <MetaRow label="DUE DATE" value={invoice.due_date || '—'} />
            <MetaRow label="REFERENCE" value={invoice.reference || '—'} />
          </dl>
        </div>
      </div>

      <table className="mt-8 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-zinc-900 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            <th className="py-2 pr-3 text-left w-8 font-medium">#</th>
            <th className="py-2 pr-3 text-left font-medium">Description</th>
            <th className="py-2 px-3 text-right w-14 font-medium">Qty</th>
            <th className="py-2 px-3 text-right w-[108px] font-medium">Rate</th>
            <th className="py-2 pl-3 text-right w-[120px] font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-8 text-center text-[12px] text-zinc-400">
                No line items
              </td>
            </tr>
          ) : (
            items.map((item, idx) => (
              <tr key={idx} className="border-b border-zinc-100">
                <td className="py-2.5 pr-3 text-zinc-500 font-numeric">{item.serial || idx + 1}</td>
                <td className="py-2.5 pr-3">{item.description}</td>
                <td className="py-2.5 px-3 text-right font-numeric text-zinc-600">{item.quantity}</td>
                <td className="py-2.5 px-3 text-right font-numeric text-zinc-600">
                  {formatMinorMoney(item.rate, currency)}
                </td>
                <td className="py-2.5 pl-3 text-right font-numeric">
                  {formatMinorMoney(item.amount, currency)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-6 flex items-start justify-between gap-10">
        <div className="max-w-[320px] text-[11px] leading-4 text-zinc-600">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Amount in words</p>
          <p className="mt-1.5 italic">
            {amountInWords(balanceDue > 0 ? balanceDue : total, currency)}
          </p>
          <p className="mt-4">
            {invoice.notes ||
              companySettings?.notes_template ||
              'Thank you for your business.'}
          </p>
        </div>

        <dl className="w-[240px] text-[12px]">
          <div className="flex justify-between py-1">
            <dt className="text-zinc-500">Subtotal</dt>
            <dd className="font-numeric">{formatMinorMoney(subtotal, currency)}</dd>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between py-1">
              <dt className="text-zinc-500">Discount</dt>
              <dd className="font-numeric">-{formatMinorMoney(discountAmount, currency)}</dd>
            </div>
          )}
          <div className="flex justify-between py-1.5 border-t border-zinc-200 mt-1 font-semibold">
            <dt>Net total</dt>
            <dd className="font-numeric">{formatMinorMoney(total, currency)}</dd>
          </div>
          {amountPaid > 0 && (
            <div className="flex justify-between py-1">
              <dt className="text-zinc-500">Amount paid</dt>
              <dd className="font-numeric">-{formatMinorMoney(amountPaid, currency)}</dd>
            </div>
          )}
          {whtSettled > 0 && (
            <div className="flex justify-between py-1">
              <dt className="text-zinc-500">WHT settled</dt>
              <dd className="font-numeric">-{formatMinorMoney(whtSettled, currency)}</dd>
            </div>
          )}
          <div className="flex justify-between py-2 mt-1 border-t border-zinc-900 font-semibold">
            <dt>Balance due</dt>
            <dd className="font-numeric">{formatMinorMoney(balanceDue, currency)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-8 pt-5 border-t border-zinc-200 text-[11px] leading-4 text-zinc-700">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Payment</p>
        <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 max-w-lg">
          <p>
            <span className="text-zinc-500">Bank</span> {payToBank.bank_name}
          </p>
          <p>
            <span className="text-zinc-500">Title</span> {payToBank.account_title}
          </p>
          <p>
            <span className="text-zinc-500">Account</span>{' '}
            <span className="font-numeric">{payToBank.account_number}</span>
          </p>
          <p>
            <span className="text-zinc-500">IBAN</span>{' '}
            <span className="font-numeric">{payToBank.iban}</span>
          </p>
          {payToBank.swift_code && (
            <p>
              <span className="text-zinc-500">Swift</span>{' '}
              <span className="font-numeric">{payToBank.swift_code}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-12 grid grid-cols-3 gap-8 items-end">
        {signatures.map((sig) => (
          <div key={sig.id} className="text-center">
            {sig.id === 'stamp' ? (
              !isReamarc ? (
                <div className="mx-auto h-[78px] w-[78px]" />
              ) : (
              <img
                src="/assets/reamarc-stamp.png?v=4"
                alt="Reamarc stamp"
                className="mx-auto h-[78px] w-[78px] object-contain"
              />
              )
            ) : (
              <>
                <div className="mx-auto mb-2 h-px w-[70%] bg-zinc-300" />
                <p className="text-[10px] font-medium text-zinc-700">{sig.label}</p>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="mt-10 text-[10px] leading-4 text-zinc-500">
        {invoice.terms_text ||
          companySettings?.terms_template ||
          'Questions about this invoice can be sent to the billing contact above.'}
      </p>
    </article>
  );
};
