import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  Share2,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  ArrowRight,
  TrendingDown,
  ShieldCheck,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { financeService } from '../../services/financeService';
import { workspaceService } from '../../services/workspaceService';
import { formatMinorMoney } from '../../utils/money';
import type {
  AgeingSummaryReport,
  ClientStatementReport,
  CollectionsReport,
  WhtReport,
  Currency,
} from '../../types/finance';
import type { Workspace } from '../../types';

export const ReceivablesView: React.FC = () => {
  const [subTab, setSubTab] = useState<'summary' | 'detail' | 'statement' | 'collections' | 'wht'>('summary');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  // Filters
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [currencyFilter, setCurrencyFilter] = useState<string>('PKR');
  const [selectedClientName, setSelectedClientName] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('2026-01-01');
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().split('T')[0]);

  // Data states
  const [summaryData, setSummaryData] = useState<AgeingSummaryReport | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [statementData, setStatementData] = useState<ClientStatementReport | null>(null);
  const [collectionsData, setCollectionsData] = useState<CollectionsReport | null>(null);
  const [whtData, setWhtData] = useState<WhtReport | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load workspaces on mount
  useEffect(() => {
    workspaceService.getWorkspaces().then((ws) => {
      setWorkspaces(ws || []);
      if (ws?.length && !selectedClientName) {
        setSelectedClientName(ws[0].name);
      }
    }).catch(() => {});
  }, []);

  // Fetch report data on tab/filter change
  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      if (subTab === 'summary') {
        const res = await financeService.getAgeingSummary(asOfDate, currencyFilter);
        setSummaryData(res);
      } else if (subTab === 'detail') {
        const res = await financeService.getAgeingDetail(asOfDate, undefined, currencyFilter);
        setDetailData(res);
      } else if (subTab === 'statement') {
        if (selectedClientName) {
          const res = await financeService.getClientStatement(selectedClientName, dateFrom, dateTo, currencyFilter);
          setStatementData(res);
        }
      } else if (subTab === 'collections') {
        const res = await financeService.getCollectionsReport(dateFrom, dateTo);
        setCollectionsData(res);
      } else if (subTab === 'wht') {
        const res = await financeService.getWhtReport(dateFrom, dateTo);
        setWhtData(res);
      }
    } catch (err: any) {
      setError(err?.message || 'Error loading report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [subTab, asOfDate, currencyFilter, selectedClientName, dateFrom, dateTo]);

  const handleShareStatementWhatsApp = () => {
    if (!statementData) return;
    const text = encodeURIComponent(
      `*Client Statement: ${statementData.client_name}*\nPeriod: ${statementData.date_from} to ${statementData.date_to}\n` +
      `Opening Balance: ${formatMinorMoney(statementData.opening_balance, statementData.currency)}\n` +
      `Closing Balance Due: ${formatMinorMoney(statementData.closing_balance, statementData.currency)}\n` +
      `Thank you for your business!`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Receivables & Reports</h1>
        <p className="text-xs text-slate-500 mt-1">
          Monitor aging receivables buckets, generate client statements, audit collections, and export ReportLab PDFs & Excel sheets
        </p>
      </div>

      {/* Navigation Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'summary', label: 'Ageing Summary' },
            { id: 'detail', label: 'Ageing Detail' },
            { id: 'statement', label: 'Client Statement' },
            { id: 'collections', label: 'Collections' },
            { id: 'wht', label: 'WHT Tracker' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                subTab === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Export Buttons */}
        {subTab === 'summary' && (
          <div className="flex items-center gap-2">
            <a
              href={financeService.getReportDownloadUrl('ageing-summary', 'xlsx', { as_of: asOfDate, currency: currencyFilter })}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
            </a>
            <a
              href={financeService.getReportDownloadUrl('ageing-summary', 'pdf', { as_of: asOfDate, currency: currencyFilter })}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
            </a>
          </div>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 text-slate-500 font-medium">
          <Filter className="w-3.5 h-3.5" />
          <span>Filters:</span>
        </div>

        {(subTab === 'summary' || subTab === 'detail') && (
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-semibold">As of Date:</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium"
            />
          </div>
        )}

        {(subTab === 'statement' || subTab === 'collections' || subTab === 'wht') && (
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-semibold">Date Range:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
        )}

        {subTab === 'statement' && (
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-semibold">Client:</span>
            <select
              value={selectedClientName}
              onChange={(e) => setSelectedClientName(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium bg-white"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.name}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {subTab !== 'collections' && subTab !== 'wht' && (
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-semibold">Currency:</span>
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium bg-white"
            >
              <option value="PKR">PKR (₨)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        )}
      </div>

      {/* Report 1: Ageing Summary */}
      {subTab === 'summary' && (
        <div className="space-y-6">
          {/* Ageing Summary Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-900">Receivables Ageing Breakdown</h2>
              <span className="text-xs text-slate-500">Calculated as of {asOfDate}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                    <th className="py-3 px-4">Client Name</th>
                    <th className="py-3 px-4 text-center">Curr</th>
                    <th className="py-3 px-4 text-right">Current</th>
                    <th className="py-3 px-4 text-right">1-30 Days</th>
                    <th className="py-3 px-4 text-right">31-60 Days</th>
                    <th className="py-3 px-4 text-right">61-90 Days</th>
                    <th className="py-3 px-4 text-right">90+ Days</th>
                    <th className="py-3 px-4 text-right font-black">Total Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Calculating ageing report…
                      </td>
                    </tr>
                  ) : !summaryData?.rows?.length ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No outstanding receivables found for this period.
                      </td>
                    </tr>
                  ) : (
                    summaryData.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-bold text-slate-900">{row.client_name}</td>
                        <td className="py-3 px-4 text-center text-slate-500 font-semibold">{row.currency}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{formatMinorMoney(row.current, row.currency, false)}</td>
                        <td className="py-3 px-4 text-right text-amber-600">{formatMinorMoney(row['1_30'], row.currency, false)}</td>
                        <td className="py-3 px-4 text-right text-amber-700">{formatMinorMoney(row['31_60'], row.currency, false)}</td>
                        <td className="py-3 px-4 text-right text-rose-600">{formatMinorMoney(row['61_90'], row.currency, false)}</td>
                        <td className="py-3 px-4 text-right text-rose-700 font-bold">{formatMinorMoney(row['90_plus'], row.currency, false)}</td>
                        <td className="py-3 px-4 text-right font-black text-indigo-700">
                          {formatMinorMoney(row.total, row.currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>

                {/* Currency summary totals footer */}
                {summaryData?.currencies_summary && Object.keys(summaryData.currencies_summary).length > 0 && (
                  <tfoot>
                    {Object.entries(summaryData.currencies_summary).map(([curr, totals], i) => (
                      <tr key={i} className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                        <td className="py-3 px-4 font-black">TOTAL {curr}</td>
                        <td className="py-3 px-4 text-center">{curr}</td>
                        <td className="py-3 px-4 text-right">{formatMinorMoney(totals.current, curr, false)}</td>
                        <td className="py-3 px-4 text-right">{formatMinorMoney(totals['1_30'], curr, false)}</td>
                        <td className="py-3 px-4 text-right">{formatMinorMoney(totals['31_60'], curr, false)}</td>
                        <td className="py-3 px-4 text-right">{formatMinorMoney(totals['61_90'], curr, false)}</td>
                        <td className="py-3 px-4 text-right">{formatMinorMoney(totals['90_plus'], curr, false)}</td>
                        <td className="py-3 px-4 text-right text-indigo-800 font-black">
                          {formatMinorMoney(totals.total, curr)}
                        </td>
                      </tr>
                    ))}
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Report 2: Ageing Detail */}
      {subTab === 'detail' && (
        <div className="space-y-6">
          {detailData?.groups?.map((group: any, idx: number) => (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900">
                  {group.client_name} ({group.currency})
                </h3>
                <span className="text-xs font-bold text-indigo-700">
                  Subtotal Due: {formatMinorMoney(group.subtotal_balance, group.currency)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/50 text-slate-500 border-b border-slate-200">
                      <th className="py-2.5 px-4">Invoice #</th>
                      <th className="py-2.5 px-4">Issue Date</th>
                      <th className="py-2.5 px-4">Due Date</th>
                      <th className="py-2.5 px-4 text-center">Days Overdue</th>
                      <th className="py-2.5 px-4 text-right">Total</th>
                      <th className="py-2.5 px-4 text-right">Amount Paid</th>
                      <th className="py-2.5 px-4 text-right">WHT</th>
                      <th className="py-2.5 px-4 text-right font-bold">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.invoices.map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-slate-50/40">
                        <td className="py-2.5 px-4 font-semibold text-slate-900">{inv.number}</td>
                        <td className="py-2.5 px-4 text-slate-500">{inv.issue_date}</td>
                        <td className="py-2.5 px-4 text-slate-500">{inv.due_date}</td>
                        <td className="py-2.5 px-4 text-center">
                          {inv.days_overdue > 0 ? (
                            <span className="text-rose-600 font-semibold">{inv.days_overdue}d</span>
                          ) : (
                            <span className="text-slate-400">Current</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">{formatMinorMoney(inv.total, group.currency)}</td>
                        <td className="py-2.5 px-4 text-right text-emerald-700">{formatMinorMoney(inv.amount_paid, group.currency)}</td>
                        <td className="py-2.5 px-4 text-right text-slate-600">{formatMinorMoney(inv.wht_settled, group.currency)}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-indigo-700">{formatMinorMoney(inv.balance_due, group.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report 3: Client Statement */}
      {subTab === 'statement' && statementData && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Statement of Account: {statementData.client_name}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Period: {statementData.date_from} to {statementData.date_to}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleShareStatementWhatsApp}
                className="px-3.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-xs rounded-lg transition flex items-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share on WhatsApp
              </button>
            </div>
          </div>

          {/* Statement Balance Header */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <p className="text-xs text-slate-500 font-semibold">Opening Balance ({statementData.date_from})</p>
              <p className="text-lg font-bold text-slate-800 mt-0.5">
                {formatMinorMoney(statementData.opening_balance, statementData.currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-semibold">Closing Balance Due ({statementData.date_to})</p>
              <p className="text-xl font-black text-indigo-700 mt-0.5">
                {formatMinorMoney(statementData.closing_balance, statementData.currency)}
              </p>
            </div>
          </div>

          {/* Chronological Table with Running Balance */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Transaction</th>
                  <th className="py-2.5 px-3">Reference / Number</th>
                  <th className="py-2.5 px-3 text-right">Invoiced (Debit)</th>
                  <th className="py-2.5 px-3 text-right">Paid (Credit)</th>
                  <th className="py-2.5 px-3 text-right font-bold">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statementData.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No invoices or receipts recorded in this period.
                    </td>
                  </tr>
                ) : (
                  statementData.transactions.map((tx, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 text-slate-600 font-medium">{tx.date}</td>
                      <td className="py-2.5 px-3 text-slate-800 font-semibold capitalize">{tx.type}</td>
                      <td className="py-2.5 px-3 text-slate-600">{tx.description}</td>
                      <td className="py-2.5 px-3 text-right text-slate-900 font-medium">
                        {tx.debit > 0 ? formatMinorMoney(tx.debit, statementData.currency) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 font-medium">
                        {tx.credit > 0 ? formatMinorMoney(tx.credit, statementData.currency) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-indigo-700">
                        {formatMinorMoney(tx.running_balance, statementData.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 4: Collections */}
      {subTab === 'collections' && collectionsData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Collected (PKR)</p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {formatMinorMoney(collectionsData.summary.total_collected_pkr, 'PKR')}
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cash in Hand</p>
              <p className="text-xl font-bold text-slate-800 mt-1">
                {formatMinorMoney(collectionsData.summary.cash_pkr, 'PKR')}
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Meezan Bank</p>
              <p className="text-xl font-bold text-indigo-700 mt-1">
                {formatMinorMoney(collectionsData.summary.meezan_pkr, 'PKR')}
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Allied Bank (ABL)</p>
              <p className="text-xl font-bold text-indigo-700 mt-1">
                {formatMinorMoney(collectionsData.summary.abl_pkr, 'PKR')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Report 5: WHT Tracker */}
      {subTab === 'wht' && whtData && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Withholding Tax (WHT) Tracker</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Track income tax deductions by clients and CPR certificates
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500">Total WHT Deducted: </span>
              <span className="text-sm font-bold text-slate-900">
                {formatMinorMoney(whtData.total_wht_pkr, 'PKR')}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Receipt #</th>
                  <th className="py-2.5 px-3">Client</th>
                  <th className="py-2.5 px-3 text-right">WHT Amount</th>
                  <th className="py-2.5 px-3 text-center">Certificate Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {whtData.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No WHT tax deductions recorded in this period.
                    </td>
                  </tr>
                ) : (
                  whtData.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-3 text-slate-600">{it.date}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{it.receipt_number}</td>
                      <td className="py-2.5 px-3 text-slate-800">{it.client_name}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                        {formatMinorMoney(it.wht_amount, it.currency)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {it.has_certificate ? (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Certificate On File
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            Pending CPR
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
