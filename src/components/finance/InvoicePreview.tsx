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

  const compName = companySettings?.company_name || 'Reamarc - Digital Solutions';
  const compAddr = companySettings?.company_address || '3rd Floor, Bldg. A-26, Business Bay, Sector-F, DHA-1\nPunjab PK';
  const compPhone = companySettings?.company_phone || '+92 3070205555';
  const compEmail = companySettings?.company_email || 'faizan.khan@reamarc.io';
  const compWeb = companySettings?.company_website || 'http://reamarc.io';
  const taxId = companySettings?.tax_id || 'Govt. UID 9926976-3';

  const defaultBank = companySettings?.bank_accounts?.[0] || {
    bank_name: 'Meezan Bank',
    account_title: 'Reamarc',
    account_number: '08140109366221',
    iban: 'PK23MEZN0008140109366221',
    swift_code: 'MEZNPKKAGRD',
  };
  const payToBank = invoice.pay_to_bank || defaultBank;

  const signatures = companySettings?.signature_labels || ['Account Officer', 'Account Manager', 'General Manager'];

  return (
    <div className="relative bg-white text-slate-900 border border-slate-200 rounded-xl shadow-lg p-8 sm:p-10 font-sans max-w-4xl mx-auto overflow-hidden">
      {/* Status Watermark / Stamp */}
      {status === 'paid' && (
        <div className="absolute top-28 right-24 pointer-events-none select-none border-4 border-emerald-500 text-emerald-600 font-extrabold text-3xl px-6 py-2 rounded-lg rotate-12 opacity-35 tracking-wider">
          PAID
        </div>
      )}
      {status === 'partially_paid' && (
        <div className="absolute top-28 right-24 pointer-events-none select-none border-4 border-amber-500 text-amber-600 font-extrabold text-2xl px-6 py-2 rounded-lg rotate-12 opacity-35 tracking-wider">
          PARTIALLY PAID
        </div>
      )}
      {status === 'void' && (
        <div className="absolute top-28 right-24 pointer-events-none select-none border-4 border-rose-500 text-rose-600 font-extrabold text-3xl px-6 py-2 rounded-lg rotate-12 opacity-40 tracking-wider">
          VOID
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-indigo-600 font-black text-3xl tracking-tight">R</span>
            <span className="text-slate-900 font-bold text-2xl tracking-tight">reamarc</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 tracking-wide uppercase pl-6 font-medium">
            Realty Digital Solutions
          </p>
        </div>

        <div className="text-left sm:text-right text-xs text-slate-500 space-y-0.5">
          <p className="font-semibold text-slate-800 text-sm">{compName}</p>
          <p className="whitespace-pre-line">{compAddr}</p>
          <p>{compPhone}</p>
          <p>{compEmail}</p>
          <p>{compWeb}</p>
          <p className="font-medium text-slate-600">{taxId}</p>
        </div>
      </div>

      {/* Title & Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-3">INVOICE</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Bill To</p>
          <p className="font-semibold text-slate-900 text-base">{invoice.client_name || 'Client Name'}</p>
          {invoice.client_billing?.address && (
            <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">{invoice.client_billing.address}</p>
          )}
          {(invoice.client_billing?.email || invoice.client_billing?.phone) && (
            <p className="text-xs text-slate-500 mt-0.5">
              {[invoice.client_billing.email, invoice.client_billing.phone].filter(Boolean).join(' · ')}
            </p>
          )}
          {invoice.client_billing?.tax_id && (
            <p className="text-xs text-slate-500 mt-0.5">NTN/Tax ID: {invoice.client_billing.tax_id}</p>
          )}
        </div>

        <div className="sm:text-right flex flex-col justify-start sm:items-end">
          <div className="w-full sm:w-auto inline-block text-left text-xs space-y-1.5 bg-slate-50/70 p-3.5 rounded-lg border border-slate-100">
            <div className="flex justify-between gap-6">
              <span className="font-semibold text-slate-500">INVOICE</span>
              <span className="font-bold text-slate-900">{invoice.number || 'DRAFT'}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="font-semibold text-slate-500">DATE</span>
              <span className="text-slate-800">{invoice.issue_date || '—'}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="font-semibold text-slate-500">TERMS</span>
              <span className="text-slate-800">{invoice.terms || 'Due on receipt'}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="font-semibold text-slate-500">DUE DATE</span>
              <span className="font-medium text-slate-900">{invoice.due_date || '—'}</span>
            </div>
            {invoice.reference && (
              <div className="flex justify-between gap-6">
                <span className="font-semibold text-slate-500">REFERENCE</span>
                <span className="text-slate-800">{invoice.reference}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="overflow-x-auto my-6">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#E9E5F5] text-slate-800 border-b border-slate-200">
              <th className="py-2.5 px-3 font-bold w-10">SL</th>
              <th className="py-2.5 px-3 font-bold">DESCRIPTION</th>
              <th className="py-2.5 px-3 font-bold text-center w-16">QTY</th>
              <th className="py-2.5 px-3 font-bold text-right w-28">RATE</th>
              <th className="py-2.5 px-3 font-bold text-right w-28">AMOUNT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                  No line items added yet
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-3 text-slate-500">{item.serial || idx + 1}</td>
                  <td className="py-2.5 px-3 text-slate-900 font-medium">{item.description}</td>
                  <td className="py-2.5 px-3 text-center text-slate-600">{item.quantity}</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">
                    {formatMinorMoney(item.rate, currency)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                    {formatMinorMoney(item.amount, currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Totals & Notes Section */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 pt-2 pb-6 border-b border-slate-100">
        <div className="sm:col-span-7 flex flex-col justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">Amount in words:</p>
            <p className="text-xs italic text-indigo-950 font-semibold bg-indigo-50/50 p-2.5 rounded border border-indigo-100/60">
              {amountInWords(balanceDue > 0 ? balanceDue : total, currency)}
            </p>
          </div>
          <div className="mt-4 text-xs text-slate-600">
            <p>{invoice.notes || companySettings?.notes_template || 'We greatly appreciate your business and the opportunity to serve you.'}</p>
          </div>
        </div>

        <div className="sm:col-span-5 text-xs space-y-1.5 self-end">
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">Subtotal:</span>
            <span className="font-medium text-slate-800">{formatMinorMoney(subtotal, currency)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between py-1 border-b border-slate-100 text-rose-600">
              <span>Discount:</span>
              <span>-{formatMinorMoney(discountAmount, currency)}</span>
            </div>
          )}
          <div className="flex justify-between py-1.5 border-b border-slate-200 font-bold text-slate-900 text-sm">
            <span>Total:</span>
            <span>{formatMinorMoney(total, currency)}</span>
          </div>
          {amountPaid > 0 && (
            <div className="flex justify-between py-1 text-emerald-700">
              <span>Amount Paid:</span>
              <span>-{formatMinorMoney(amountPaid, currency)}</span>
            </div>
          )}
          {whtSettled > 0 && (
            <div className="flex justify-between py-1 text-slate-600">
              <span>WHT Settled:</span>
              <span>-{formatMinorMoney(whtSettled, currency)}</span>
            </div>
          )}
          <div className="flex justify-between py-2 border-t-2 border-indigo-600 font-bold text-indigo-700 text-base">
            <span>BALANCE DUE:</span>
            <span>{formatMinorMoney(balanceDue, currency)}</span>
          </div>
        </div>
      </div>

      {/* Bank Details Block */}
      <div className="my-6 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
        <p className="font-bold text-slate-900 mb-1.5">Please make payment to:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          <p><span className="text-slate-500">Bank Name:</span> <span className="font-medium">{payToBank.bank_name}</span></p>
          <p><span className="text-slate-500">Account Title:</span> <span className="font-medium">{payToBank.account_title}</span></p>
          <p><span className="text-slate-500">Account #:</span> <span className="font-mono font-medium">{payToBank.account_number}</span></p>
          <p><span className="text-slate-500">IBAN #:</span> <span className="font-mono font-medium">{payToBank.iban}</span></p>
          {payToBank.swift_code && (
            <p><span className="text-slate-500">Swift Code:</span> <span className="font-mono font-medium">{payToBank.swift_code}</span></p>
          )}
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-6 my-8 text-center text-xs">
        {signatures.map((label, idx) => (
          <div key={idx} className="flex flex-col items-center">
            <div className="w-32 border-b border-slate-300 mb-1.5" />
            <span className="font-semibold text-slate-700">{label}</span>
          </div>
        ))}
      </div>

      {/* Footer Notice */}
      <div className="text-center text-[10px] text-slate-400 mt-6 pt-4 border-t border-slate-100">
        <p>
          {invoice.terms_text || companySettings?.terms_template ||
            'If you have any questions or require further clarification, please do not hesitate to contact us. We appreciate the opportunity to work with you and look forward to your response.'}
        </p>
      </div>
    </div>
  );
};
