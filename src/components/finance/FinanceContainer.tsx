import React, { useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Clock,
  Wallet,
  Settings,
} from 'lucide-react';
import type { FinanceTab, Invoice } from '../../types/finance';
import { Button } from '../ui/button';
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
    { id: 'receivables', label: 'Receivables', icon: Clock },
    { id: 'receipts', label: 'Receipts', icon: CreditCard },
    { id: 'accounts', label: 'Accounts', icon: Wallet },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 bg-canvas text-fg overflow-y-auto font-sans">
      <div className="bg-surface border-b border-border sticky top-0 z-30 px-6 pt-5 pb-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
          <div>
            <h1 className="text-h1 font-semibold text-fg tracking-tight">Finance</h1>
            <p className="text-caption text-fg-muted mt-0.5">
              Invoices, receivables, receipts, and cash / bank accounts
            </p>
          </div>

          {isEditorOpen && activeTab === 'invoices' && (
            <Button type="button" variant="secondary" size="sm" onClick={handleCloseEditor}>
              Back to invoices
            </Button>
          )}
        </div>

        {!isEditorOpen && (
          <div className="flex overflow-x-auto gap-1 border-b border-transparent">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 py-2.5 px-3 text-ui font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-accent text-accent-text'
                      : 'border-transparent text-fg-muted hover:text-fg'
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

      <div className="flex-1 p-6 w-full min-w-0">
        {activeTab === 'overview' && (
          <FinanceOverview
            onNavigateTab={handleNavigateTab}
            onEditInvoice={handleStartEditInvoice}
          />
        )}

        {activeTab === 'invoices' && (
          isEditorOpen ? (
            <InvoiceEditor
              invoiceId={editingInvoice?.id}
              initialInvoice={editingInvoice}
              onBack={handleCloseEditor}
              onSaved={() => {
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
