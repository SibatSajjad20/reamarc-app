import React, { useEffect, useState } from 'react';
import { useBreadcrumb } from '../layout/BreadcrumbContext';
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Clock,
  Wallet,
  Settings,
  Shield,
  TrendingUp,
} from 'lucide-react';
import type { FinanceTab, Invoice } from '../../types/finance';
import { FinanceOverview } from './FinanceOverview';
import { InvoicesView } from './InvoicesView';
import { InvoiceEditor } from './InvoiceEditor';
import { ReceiptsView } from './ReceiptsView';
import { ReceivablesView } from './ReceivablesView';
import { CollectionsView } from './CollectionsView';
import { MonthlyAnalysisView } from './MonthlyAnalysisView';
import { SummaryAccountsView } from './SummaryAccountsView';
import { AccountsView } from './AccountsView';
import { WhtView } from './WhtView';
import { FinanceSettingsView } from './FinanceSettingsView';
import { normalizeFinanceTab } from './financeTabs';

const FINANCE_TAB_LABELS: Record<FinanceTab, string> = {
  overview: 'Overview',
  invoices: 'Invoices',
  receivables: 'Receivables',
  receipts: 'Receipts',
  collections: 'Collections',
  reports: 'Reports',
  summary: 'Summary accounts',
  accounts: 'Cash & bank',
  wht: 'Withhold tax',
  settings: 'Settings',
};

interface FinanceContainerProps {
  initialTab?: FinanceTab;
}

/** Tab from `/finance/<tab>`; rewrites the legacy `/finance/trends` URL to `/finance/reports`. */
function tabFromLocation(): FinanceTab | undefined {
  if (typeof window === 'undefined') return undefined;
  const match = window.location.pathname.match(/^\/finance\/([^/?#]+)/i);
  if (!match) return undefined;
  const tab = normalizeFinanceTab(match[1]);
  if (tab && match[1].toLowerCase() !== tab) {
    window.history.replaceState(
      window.history.state,
      '',
      `/finance/${tab}${window.location.search}${window.location.hash}`,
    );
  }
  return tab;
}

export const FinanceContainer: React.FC<FinanceContainerProps> = ({
  initialTab = 'overview',
}) => {
  const [startTab] = useState<FinanceTab>(() => tabFromLocation() || normalizeFinanceTab(initialTab) || 'overview');
  const [activeTab, setActiveTab] = useState<FinanceTab>(startTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<FinanceTab>>(() => new Set([startTab]));
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoiceForPayment, setInvoiceForPayment] = useState<Invoice | null>(null);
  const { setTrail } = useBreadcrumb();

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // Reports is linkable (`/finance/reports?period=quarterly`); other tabs keep `/finance`.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    if (!/^\/finance(\/|$)/i.test(path)) return;
    const target = activeTab === 'reports' ? '/finance/reports' : '/finance';
    const search = activeTab === 'reports' ? window.location.search : '';
    if (path !== target || window.location.search !== search) {
      window.history.replaceState(window.history.state, '', `${target}${search}${window.location.hash}`);
    }
  }, [activeTab]);

  useEffect(() => {
    const goOverview = () => {
      setActiveTab('overview');
      setIsEditorOpen(false);
    };
    const goTab = () => {
      setIsEditorOpen(false);
      setActiveTab(activeTab);
    };
    const editorLabel = editingInvoice?.number
      ? `Edit ${editingInvoice.number}`
      : 'New invoice';
    setTrail([
      { label: 'Accounts', onClick: goOverview },
      ...(isEditorOpen
        ? [
            { label: 'Invoices', onClick: () => { setActiveTab('invoices'); setIsEditorOpen(false); } },
            { label: editorLabel },
          ]
        : [{ label: FINANCE_TAB_LABELS[activeTab], onClick: goTab }]),
    ]);
    return () => setTrail(null);
  }, [activeTab, isEditorOpen, editingInvoice, setTrail]);

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
    { id: 'collections', label: 'Collections', icon: CreditCard },
    { id: 'reports', label: 'Reports', icon: TrendingUp },
    { id: 'summary', label: 'Summary Accounts', icon: FileText },
    { id: 'accounts', label: 'Cash & Bank', icon: Wallet },
    { id: 'wht', label: 'Withhold Tax', icon: Shield },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 bg-canvas text-fg overflow-y-auto font-sans">
      <div className="bg-surface border-b border-border sticky top-0 z-30 px-6 pt-5 pb-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
          <div>
            <h1 className="text-h1 font-semibold text-fg tracking-tight">Accounts</h1>
            <p className="text-caption text-fg-muted mt-0.5">
              Invoices, receivables, receipts, collections, and cash / bank accounts
            </p>
          </div>

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
        {visitedTabs.has('overview') && (
          <div className={activeTab === 'overview' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'overview'}>
            <FinanceOverview
              onNavigateTab={handleNavigateTab}
              onEditInvoice={handleStartEditInvoice}
            />
          </div>
        )}

        {visitedTabs.has('invoices') && (
          <div className={activeTab === 'invoices' && !isEditorOpen ? 'block' : 'hidden'} aria-hidden={!(activeTab === 'invoices' && !isEditorOpen)}>
            <InvoicesView
              onCreateNew={handleStartCreateInvoice}
              onEditInvoice={handleStartEditInvoice}
              onRecordPaymentForInvoice={handleRecordPaymentForInvoice}
            />
          </div>
        )}
        {activeTab === 'invoices' && isEditorOpen && (
          <InvoiceEditor
            invoiceId={editingInvoice?.id}
            initialInvoice={editingInvoice}
            onBack={handleCloseEditor}
            onSaved={() => {
              setIsEditorOpen(false);
              setEditingInvoice(null);
            }}
          />
        )}

        {visitedTabs.has('receivables') && (
          <div className={activeTab === 'receivables' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'receivables'}>
            <ReceivablesView />
          </div>
        )}

        {visitedTabs.has('collections') && (
          <div className={activeTab === 'collections' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'collections'}>
            <CollectionsView />
          </div>
        )}

        {visitedTabs.has('reports') && (
          <div className={activeTab === 'reports' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'reports'}>
            <MonthlyAnalysisView />
          </div>
        )}

        {visitedTabs.has('summary') && (
          <div className={activeTab === 'summary' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'summary'}>
            <SummaryAccountsView />
          </div>
        )}

        {visitedTabs.has('receipts') && (
          <div className={activeTab === 'receipts' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'receipts'}>
            <ReceiptsView
              initialInvoiceToPay={invoiceForPayment}
              onPaymentSuccess={() => setInvoiceForPayment(null)}
            />
          </div>
        )}

        {visitedTabs.has('accounts') && (
          <div className={activeTab === 'accounts' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'accounts'}>
            <AccountsView />
          </div>
        )}

        {visitedTabs.has('wht') && (
          <div className={activeTab === 'wht' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'wht'}>
            <WhtView />
          </div>
        )}

        {visitedTabs.has('settings') && (
          <div className={activeTab === 'settings' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'settings'}>
            <FinanceSettingsView />
          </div>
        )}
      </div>
    </div>
  );
};
