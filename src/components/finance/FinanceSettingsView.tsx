import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building2,
  CreditCard,
  Hash,
  FileText,
  ListPlus,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Edit2,
  Check,
  X,
  Search,
  Layers,
} from 'lucide-react';
import { financeService } from '../../services/financeService';
import { formatMinorMoney, majorToMinor, minorToMajor } from '../../utils/money';
import type { FinanceSettings, FinanceService, BankAccountConfig, Currency } from '../../types/finance';
import { CustomSelect } from '../ui/CustomSelect';
import { CURRENCY_OPTIONS, TERMS_OPTIONS } from './financeUi';

export const FinanceSettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'company' | 'banks' | 'numbering' | 'services'>('company');
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [services, setServices] = useState<FinanceService[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Service Catalog state
  const [serviceSearch, setServiceSearch] = useState('');
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<FinanceService | null>(null);

  // New / Edit Service form
  const [serviceName, setServiceName] = useState('');
  const [serviceRate, setServiceRate] = useState('');
  const [serviceCurrency, setServiceCurrency] = useState<Currency>('PKR');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceIsActive, setServiceIsActive] = useState(true);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [setts, srvs] = await Promise.all([
        financeService.getSettings(),
        financeService.getServices(false), // get all including inactive
      ]);
      setSettings(setts);
      setServices(srvs || []);
    } catch (err: any) {
      console.error('Failed to load finance settings:', err);
      showNotification('error', err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    try {
      const updated = await financeService.updateSettings(settings);
      setSettings(updated);
      showNotification('success', 'Finance settings saved successfully');
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Bank Account helper updater
  const updateBankAccount = (bankId: string, field: keyof BankAccountConfig, val: string) => {
    if (!settings) return;
    const accounts = [...settings.bank_accounts];
    const idx = accounts.findIndex((b) => b.bank_id === bankId);
    if (idx !== -1) {
      accounts[idx] = { ...accounts[idx], [field]: val };
      setSettings({ ...settings, bank_accounts: accounts });
    }
  };

  // Add / Edit Service Modal
  const openAddServiceModal = () => {
    setEditingService(null);
    setServiceName('');
    setServiceRate('');
    setServiceCurrency('PKR');
    setServiceDescription('');
    setServiceIsActive(true);
    setServiceError(null);
    setIsAddServiceModalOpen(true);
  };

  const openEditServiceModal = (srv: FinanceService) => {
    setEditingService(srv);
    setServiceName(srv.name);
    setServiceRate(srv.default_rate ? String(minorToMajor(srv.default_rate)) : '');
    setServiceCurrency(srv.currency || 'PKR');
    setServiceDescription(srv.description || '');
    setServiceIsActive(srv.is_active);
    setServiceError(null);
    setIsAddServiceModalOpen(true);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    setServiceError(null);

    if (!serviceName.trim()) {
      setServiceError('Service name is required');
      return;
    }

    const numRate = parseFloat(serviceRate);
    const minorRate = isNaN(numRate) ? 0 : majorToMinor(numRate);

    setServiceSaving(true);
    try {
      if (editingService) {
        await financeService.updateService(editingService.id, {
          name: serviceName.trim(),
          default_rate: minorRate,
          currency: serviceCurrency,
          description: serviceDescription.trim() || undefined,
          is_active: serviceIsActive,
        });
        showNotification('success', 'Service updated successfully');
      } else {
        await financeService.createService({
          name: serviceName.trim(),
          default_rate: minorRate,
          currency: serviceCurrency,
          description: serviceDescription.trim() || undefined,
          is_active: serviceIsActive,
        });
        showNotification('success', 'Service added to catalog');
      }

      setIsAddServiceModalOpen(false);
      const updatedSrvs = await financeService.getServices(false);
      setServices(updatedSrvs || []);
    } catch (err: any) {
      setServiceError(err.message || 'Failed to save service');
    } finally {
      setServiceSaving(false);
    }
  };

  const toggleServiceActive = async (srv: FinanceService) => {
    try {
      await financeService.updateService(srv.id, { is_active: !srv.is_active });
      setServices((prev) =>
        prev.map((s) => (s.id === srv.id ? { ...s, is_active: !s.is_active } : s))
      );
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to update service status');
    }
  };

  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  if (loading || !settings) {
    return (
      <div className="py-20 text-center text-fg-muted dark:text-fg-muted">
        Loading finance settings...
      </div>
    );
  }

  const meezanBank = settings.bank_accounts.find((b) => b.bank_id === 'meezan') || {
    bank_id: 'meezan',
    bank_name: 'Meezan Bank Limited',
    account_title: 'REAMARC DIGITAL SOLUTIONS',
    account_number: '02070105658422',
    iban: 'PK71MEZN0002070105658422',
    swift_code: 'MEZNPKKA',
    branch: 'DHA Phase 5 Branch, Lahore',
  };

  const ablBank = settings.bank_accounts.find((b) => b.bank_id === 'abl') || {
    bank_id: 'abl',
    bank_name: 'Allied Bank Limited',
    account_title: 'REAMARC DIGITAL SOLUTIONS',
    account_number: '0010086701850017',
    iban: 'PK08ABPA0010086701850017',
    swift_code: 'ABPAPKKA',
    branch: 'Main Market Gulberg, Lahore',
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-lg border flex items-center justify-between animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            )}
            <span className="text-sm font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-fg-muted hover:text-fg-2 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-fg dark:text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-accent-text" />
          Finance Configuration & Service Catalog
        </h2>
        <p className="text-sm text-fg-muted dark:text-fg-muted">
          Manage company billing identity, verified bank accounts printed on invoices, document prefixes, and agency services.
        </p>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex border-b border-border dark:border-border">
        <button
          onClick={() => setActiveTab('company')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
            activeTab === 'company'
              ? 'border-primary-600 text-accent-text dark:border-primary-400 dark:text-primary-400 font-semibold'
              : 'border-transparent text-fg-muted hover:text-fg-2 dark:text-fg-muted dark:hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Company Identity
        </button>

        <button
          onClick={() => setActiveTab('banks')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
            activeTab === 'banks'
              ? 'border-primary-600 text-accent-text dark:border-primary-400 dark:text-primary-400 font-semibold'
              : 'border-transparent text-fg-muted hover:text-fg-2 dark:text-fg-muted dark:hover:text-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Bank Accounts (ABL & Meezan)
        </button>

        <button
          onClick={() => setActiveTab('numbering')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
            activeTab === 'numbering'
              ? 'border-primary-600 text-accent-text dark:border-primary-400 dark:text-primary-400 font-semibold'
              : 'border-transparent text-fg-muted hover:text-fg-2 dark:text-fg-muted dark:hover:text-slate-200'
          }`}
        >
          <Hash className="w-4 h-4" />
          Numbering & Terms
        </button>

        <button
          onClick={() => setActiveTab('services')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
            activeTab === 'services'
              ? 'border-primary-600 text-accent-text dark:border-primary-400 dark:text-primary-400 font-semibold'
              : 'border-transparent text-fg-muted hover:text-fg-2 dark:text-fg-muted dark:hover:text-slate-200'
          }`}
        >
          <ListPlus className="w-4 h-4" />
          Service Catalog ({services.length})
        </button>
      </div>

      {/* TAB 1: Company Identity */}
      {activeTab === 'company' && (
        <form onSubmit={handleSaveSettings} className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border p-6 space-y-5">
          <h3 className="text-base font-bold text-fg dark:text-white border-b border-border dark:border-border pb-3">
            Company Billing Information (Printed on Invoices & Receipts)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                Company Legal Name
              </label>
              <input
                type="text"
                required
                value={settings.company_name}
                onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                Tax ID / NTN / Govt UID
              </label>
              <input
                type="text"
                value={settings.tax_id}
                onChange={(e) => setSettings({ ...settings, tax_id: e.target.value })}
                className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                Official Business Address
              </label>
              <input
                type="text"
                value={settings.company_address}
                onChange={(e) => setSettings({ ...settings, company_address: e.target.value })}
                className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                Official Phone Number
              </label>
              <input
                type="text"
                value={settings.company_phone}
                onChange={(e) => setSettings({ ...settings, company_phone: e.target.value })}
                className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                Finance Email Address
              </label>
              <input
                type="email"
                value={settings.company_email}
                onChange={(e) => setSettings({ ...settings, company_email: e.target.value })}
                className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                Official Website
              </label>
              <input
                type="text"
                value={settings.company_website}
                onChange={(e) => setSettings({ ...settings, company_website: e.target.value })}
                className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Company Details'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: Bank Accounts (ABL & Meezan) */}
      {activeTab === 'banks' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Meezan Bank Card */}
          <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border dark:border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <h3 className="text-base font-bold text-fg dark:text-white">
                  Meezan Bank Limited (Islamic Banking)
                </h3>
              </div>
              <span className="text-xs font-mono font-medium text-fg-muted">ID: meezan</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={meezanBank.bank_name}
                  onChange={(e) => updateBankAccount('meezan', 'bank_name', e.target.value)}
                  className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Account Title
                </label>
                <input
                  type="text"
                  value={meezanBank.account_title}
                  onChange={(e) => updateBankAccount('meezan', 'account_title', e.target.value)}
                  className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  value={meezanBank.account_number}
                  onChange={(e) => updateBankAccount('meezan', 'account_number', e.target.value)}
                  className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white font-mono focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  IBAN (International Bank Account Number)
                </label>
                <input
                  type="text"
                  value={meezanBank.iban}
                  onChange={(e) => updateBankAccount('meezan', 'iban', e.target.value)}
                  className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white font-mono focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  SWIFT / BIC Code
                </label>
                <input
                  type="text"
                  value={meezanBank.swift_code}
                  onChange={(e) => updateBankAccount('meezan', 'swift_code', e.target.value)}
                  className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white font-mono focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Branch Name & Address
                </label>
                <input
                  type="text"
                  value={meezanBank.branch || ''}
                  onChange={(e) => updateBankAccount('meezan', 'branch', e.target.value)}
                  className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>
            </div>
          </div>

          {/* Allied Bank Card */}
          <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border dark:border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-600" />
                <h3 className="text-base font-bold text-fg dark:text-white">
                  Allied Bank Limited (ABL)
                </h3>
              </div>
              <span className="text-xs font-mono font-medium text-fg-muted">ID: abl</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={ablBank.bank_name}
                  onChange={(e) => updateBankAccount('abl', 'bank_name', e.target.value)}
                  className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Account Title
                </label>
                <input
                  type="text"
                  value={ablBank.account_title}
                  onChange={(e) => updateBankAccount('abl', 'account_title', e.target.value)}
                  className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  value={ablBank.account_number}
                  onChange={(e) => updateBankAccount('abl', 'account_number', e.target.value)}
                  className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white font-mono focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  IBAN (International Bank Account Number)
                </label>
                <input
                  type="text"
                  value={ablBank.iban}
                  onChange={(e) => updateBankAccount('abl', 'iban', e.target.value)}
                  className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white font-mono focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  SWIFT / BIC Code
                </label>
                <input
                  type="text"
                  value={ablBank.swift_code}
                  onChange={(e) => updateBankAccount('abl', 'swift_code', e.target.value)}
                  className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white font-mono focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Branch Name & Address
                </label>
                <input
                  type="text"
                  value={ablBank.branch || ''}
                  onChange={(e) => updateBankAccount('abl', 'branch', e.target.value)}
                  className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Bank Details'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: Numbering & Terms */}
      {activeTab === 'numbering' && (
        <form onSubmit={handleSaveSettings} className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border p-6 space-y-5">
          <h3 className="text-base font-bold text-fg dark:text-white border-b border-border dark:border-border pb-3">
            Document Numbering, Default Terms & Templates
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                Invoice Number Prefix
              </label>
              <input
                type="text"
                required
                value={settings.invoice_prefix}
                onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value })}
                className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm font-mono text-fg dark:text-white uppercase focus:outline-none focus:ring-1 focus-visible:focus-ring"
              />
              <p className="text-[11px] text-fg-muted mt-1">E.g. &apos;INV&apos; generates INV-2026-0001</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                Receipt Number Prefix
              </label>
              <input
                type="text"
                required
                value={settings.receipt_prefix}
                onChange={(e) => setSettings({ ...settings, receipt_prefix: e.target.value })}
                className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-sm font-mono text-fg dark:text-white uppercase focus:outline-none focus:ring-1 focus-visible:focus-ring"
              />
              <p className="text-[11px] text-fg-muted mt-1">E.g. &apos;RCT&apos; generates RCT-2026-0001</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                Default Due Date Terms
              </label>
              <CustomSelect
                value={settings.default_payment_terms}
                onChange={(value) => setSettings({ ...settings, default_payment_terms: value })}
                options={TERMS_OPTIONS.filter((opt) => opt.value !== 'Custom')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                Default Notes Template
              </label>
              <textarea
                rows={3}
                value={settings.notes_template}
                onChange={(e) => setSettings({ ...settings, notes_template: e.target.value })}
                className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-xs text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                Default Terms & Conditions
              </label>
              <textarea
                rows={3}
                value={settings.terms_template}
                onChange={(e) => setSettings({ ...settings, terms_template: e.target.value })}
                className="w-full px-3 py-2 bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-xs text-fg dark:text-white focus:outline-none focus:ring-1 focus-visible:focus-ring"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Numbering & Terms'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: Service Catalog */}
      {activeTab === 'services' && (
        <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border overflow-hidden">
          {/* Top Bar */}
          <div className="p-5 border-b border-border dark:border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-fg dark:text-white flex items-center gap-2">
                <ListPlus className="w-5 h-5 text-accent-text" />
                Service Catalog
              </h3>
              <p className="text-xs text-fg-muted dark:text-fg-muted">
                Services selectable when drafting invoices. Includes 21 pre-configured agency services and custom offerings.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
                <input
                  type="text"
                  placeholder="Search services..."
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg text-fg dark:text-fg-2 focus:outline-none focus:ring-1 focus-visible:focus-ring w-52"
                />
              </div>

              <button
                onClick={openAddServiceModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-medium transition"
              >
                <Plus className="w-4 h-4" />
                Add Service
              </button>
            </div>
          </div>

          {/* Service List Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-canvas dark:bg-canvas/50 text-fg-muted dark:text-fg-muted text-xs uppercase font-semibold border-b border-border dark:border-border">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Service Name</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Default Rate</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-border">
                {filteredServices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-fg-muted dark:text-fg-muted">
                      No services found matching &quot;{serviceSearch}&quot;.
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((srv, idx) => (
                    <tr
                      key={srv.id}
                      className="hover:bg-canvas/80 dark:hover:bg-hover transition-colors"
                    >
                      <td className="py-3 px-4 text-center text-xs text-fg-muted font-mono">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-fg dark:text-fg-2">
                          {srv.name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-fg-muted dark:text-fg-muted max-w-xs truncate">
                        {srv.description || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-fg dark:text-fg-2 whitespace-nowrap">
                        {srv.default_rate > 0
                          ? formatMinorMoney(srv.default_rate, srv.currency || 'PKR')
                          : 'Custom rate'}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleServiceActive(srv)}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition ${
                            srv.is_active
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                              : 'bg-subtle text-fg-muted dark:bg-subtle dark:text-fg-muted'
                          }`}
                        >
                          {srv.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEditServiceModal(srv)}
                          className="p-1.5 text-fg-muted hover:text-fg-2 dark:hover:text-slate-200 rounded-lg hover:bg-hover dark:hover:bg-hover transition"
                          title="Edit Service"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Service Modal */}
      {isAddServiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface dark:bg-surface rounded-2xl shadow-xl border border-border dark:border-border w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-border">
              <h3 className="text-base font-bold text-fg dark:text-white flex items-center gap-2">
                <ListPlus className="w-5 h-5 text-accent-text" />
                {editingService ? 'Edit Catalog Service' : 'Add New Service to Catalog'}
              </h3>
              <button
                onClick={() => setIsAddServiceModalOpen(false)}
                className="text-fg-muted hover:text-fg-2 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveService} className="p-6 space-y-4">
              {serviceError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{serviceError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Service Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Website Maintenance & Support"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    Currency
                  </label>
                  <CustomSelect
                    value={serviceCurrency}
                    onChange={(value) => setServiceCurrency(value as Currency)}
                    options={CURRENCY_OPTIONS}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    Default Rate
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={serviceRate}
                    onChange={(e) => setServiceRate(e.target.value)}
                    className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Default Description / Scope
                </label>
                <textarea
                  rows={2}
                  placeholder="Scope or deliverables summary..."
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="srv_active"
                  checked={serviceIsActive}
                  onChange={(e) => setServiceIsActive(e.target.checked)}
                  className="rounded text-accent-text focus-visible:focus-ring"
                />
                <label htmlFor="srv_active" className="text-xs text-fg-2 dark:text-fg-muted cursor-pointer">
                  Service active and selectable in invoices
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-border dark:border-border">
                <button
                  type="button"
                  onClick={() => setIsAddServiceModalOpen(false)}
                  className="px-4 py-2 border border-border dark:border-border rounded-lg text-xs font-medium text-fg-2 dark:text-fg-muted hover:bg-canvas dark:hover:bg-hover transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={serviceSaving}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
                >
                  {serviceSaving ? 'Saving...' : editingService ? 'Update Service' : 'Add to Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
