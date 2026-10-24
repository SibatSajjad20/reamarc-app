import React, { useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Clock,
  Wallet,
  Settings,
  ArrowLeft,
} from 'lucide-react';
import type { FinanceTab, Invoice } from '../../types/finance';
import { FinanceOverview } from './FinanceOverview';
import { InvoicesView } from './InvoicesView';
import { InvoiceEditor } from './InvoiceEditor';
import { ReceiptsView } from './ReceiptsView';
import { ReceivablesView } from './ReceivablesView';
import { AccountsView } from './AccountsView';
import { FinanceSettingsView } from './FinanceSettingsView';

interface FinanceContainerProps {
  initialTab?: FinanceTab;
}

export const FinanceContainer: React.FC<FinanceContainerProps> = ({
  initialTab = 'overview',
}) => {
  const [activeTab, setActiveTab] = useState<FinanceTab>(initialTab);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoiceForPayment, setInvoiceForPayment] = useState<Invoice | null>(null);

  // Tab navigation handler
  const handleNavigateTab = (tab: FinanceTab, extra?: { action?: string; invoiceId?: string }) => {
    setActiveTab(tab);
    if (tab === 'invoices' && extra?.action === 'create') {
      setEditingInvoice(null);
      setIsEditorOpen(true);
    }
    if (tab === 'receipts' && extra?.action === 'create') {
      setInvoiceForPayment(null);
    }
  };

  const handleStartCreateInvoice = () => {
    setEditingInvoice(null);
    setIsEditorOpen(true);
    setActiveTab('invoices');
  };

  const handleStartEditInvoice = (inv: Invoice) => {
    setEditingInvoice(inv);
    setIsEditorOpen(true);
    setActiveTab('invoices');
  };

  const handleRecordPaymentForInvoice = (inv: Invoice) => {
    setInvoiceForPayment(inv);
    setActiveTab('receipts');
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingInvoice(null);
  };

  const tabs: { id: FinanceTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'receivables', label: 'Receivables & Ageing', icon: Clock },
    { id: 'receipts', label: 'Receipts & Payments', icon: CreditCard },
    { id: 'accounts', label: 'Accounts & Movements', icon: Wallet },
    { id: 'settings', label: 'Settings & Catalog', icon: Settings },
  ];

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 bg-slate-50 dark:bg-navy-900 overflow-y-auto">
      {/* Top Header & Tab Navigation Bar */}
      <div className="bg-white dark:bg-navy-800 border-b border-slate-200 dark:border-navy-700 sticky top-0 z-30 px-6 pt-5 pb-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-primary-600 text-white shadow-sm inline-flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </span>
              Reamarc Finance
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Client billing, multi-currency receivables, receipts, money accounts & audit ledger.
            </p>
          </div>

          {isEditorOpen && activeTab === 'invoices' && (
            <button
              onClick={handleCloseEditor}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-navy-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Invoices List
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        {!isEditorOpen && (
          <div className="flex overflow-x-auto space-x-1 sm:space-x-4 border-b border-transparent scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                    isActive
                      ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 p-6 max-w-7xl w-full mx-auto">
        {activeTab === 'overview' && (
          <FinanceOverview
            onNavigateTab={handleNavigateTab}
            onEditInvoice={handleStartEditInvoice}
          />
        )}

        {activeTab === 'invoices' && (
          isEditorOpen ? (
            <InvoiceEditor
              initialInvoice={editingInvoice}
              onCancel={handleCloseEditor}
              onSaveSuccess={() => {
                setIsEditorOpen(false);
                setEditingInvoice(null);
              }}
            />
          ) : (
            <InvoicesView
              onCreateNew={handleStartCreateInvoice}
              onEditInvoice={handleStartEditInvoice}
              onRecordPaymentForInvoice={handleRecordPaymentForInvoice}
            />
          )
        )}

        {activeTab === 'receivables' && <ReceivablesView />}

        {activeTab === 'receipts' && (
          <ReceiptsView
            initialInvoiceToPay={invoiceForPayment}
            onPaymentSuccess={() => setInvoiceForPayment(null)}
          />
        )}

        {activeTab === 'accounts' && <AccountsView />}

        {activeTab === 'settings' && <FinanceSettingsView />}
      </div>
    </div>
  );
};
