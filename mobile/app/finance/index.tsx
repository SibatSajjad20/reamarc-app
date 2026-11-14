import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  ExternalLink,
  FileCheck,
  FileText,
  Receipt as ReceiptIcon,
  Search,
  Share2,
  X,
} from 'lucide-react-native';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/context/AuthContext';
import { peekModuleCache, setModuleCache } from '../../src/lib/moduleCache';
import { canManageFinance } from '../../src/lib/roles';
import { API_URL, useTheme } from '../../src/theme';
import { formatMinorMoney } from '../../src/ui/format';
import { Card } from '../../src/ui/Card';
import { FilterChips } from '../../src/ui/FilterChips';
import { TaskListSkeleton } from '../../src/ui/Skeleton';

interface InvoiceLineItem {
  description: string;
  quantity?: number;
  rate?: number;
  amount?: number;
  unit_price?: number;
  total?: number;
}

interface Invoice {
  id: string;
  number: string;
  client_name: string;
  issue_date: string;
  due_date: string;
  currency: string;
  line_items?: InvoiceLineItem[];
  subtotal: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  share_token?: string;
  notes?: string;
}

interface Receipt {
  id: string;
  number: string;
  client_name: string;
  date: string;
  currency: string;
  amount_received: number;
  settles_total: number;
  unapplied_amount: number;
  method: string;
  bank?: string;
  reference_number?: string;
  status: string;
  memo?: string;
}

const INVOICE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'draft', label: 'Draft' },
];

const RECEIPT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'posted', label: 'Confirmed' },
  { key: 'pending', label: 'Pending' },
];

function pktTodayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
}

function lineItemAmount(line: InvoiceLineItem): number {
  if (typeof line.amount === 'number' && Number.isFinite(line.amount)) return line.amount;
  if (typeof line.total === 'number' && Number.isFinite(line.total)) return line.total;
  const rate = Number(line.rate ?? line.unit_price ?? 0);
  const qty = Number(line.quantity ?? 1);
  return Math.round(qty * rate);
}

function resolveInvoiceStatus(inv: Invoice, today: string): string {
  const status = String(inv.status || '').toLowerCase();
  if (
    (inv.balance_due || 0) > 0 &&
    inv.due_date &&
    inv.due_date < today &&
    status !== 'void' &&
    status !== 'deleted' &&
    status !== 'draft' &&
    status !== 'paid'
  ) {
    return 'overdue';
  }
  return status;
}

function invoiceMatchesFilter(inv: Invoice, filter: string, today: string): boolean {
  const status = String(inv.status || '').toLowerCase();
  if (status === 'deleted') return false;
  if (filter === 'all') return true;
  const resolved = resolveInvoiceStatus(inv, today);
  if (filter === 'draft') return status === 'draft';
  if (filter === 'paid') return resolved === 'paid';
  if (filter === 'overdue') return resolved === 'overdue';
  if (filter === 'unpaid') {
    return resolved === 'issued' || resolved === 'partially_paid' || resolved === 'overdue';
  }
  return true;
}

function receiptMatchesFilter(status: string, filter: string): boolean {
  const st = String(status || '').toLowerCase();
  if (st === 'deleted' || st === 'void') return false;
  if (filter === 'all') return true;
  if (filter === 'posted') return st === 'posted';
  if (filter === 'pending') return st === 'pending' || st === 'draft';
  return true;
}

const INV_CACHE = 'finance:invoices';
const RCPT_CACHE = 'finance:receipts';

export default function FinanceScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const canManage = canManageFinance(user);

  const [activeTab, setActiveTab] = useState<'invoices' | 'receipts'>('invoices');
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [receiptFilter, setReceiptFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [invoices, setInvoices] = useState<Invoice[]>(
    () => peekModuleCache<Invoice[]>(INV_CACHE) || [],
  );
  const [receipts, setReceipts] = useState<Receipt[]>(
    () => peekModuleCache<Receipt[]>(RCPT_CACHE) || [],
  );
  const [loading, setLoading] = useState(() => !peekModuleCache<Invoice[]>(INV_CACHE));
  const [refreshing, setRefreshing] = useState(false);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const loadData = useCallback(async (force = false) => {
    if (!force) {
      const inv = peekModuleCache<Invoice[]>(INV_CACHE);
      const rcpt = peekModuleCache<Receipt[]>(RCPT_CACHE);
      if (inv && rcpt) {
        setInvoices(inv);
        setReceipts(rcpt);
        setLoading(false);
        return;
      }
    }
    try {
      const invPromise = api<{ items: Invoice[]; total: number }>('/finance/invoices?limit=150');
      const rcptPromise = api<{ items: Receipt[]; total: number }>('/finance/receipts?limit=150');
      const [invRes, rcptRes] = await Promise.all([invPromise, rcptPromise]);
      const nextInv = invRes.items || [];
      const nextRcpt = rcptRes.items || [];
      setModuleCache(INV_CACHE, nextInv);
      setModuleCache(RCPT_CACHE, nextRcpt);
      setInvoices(nextInv);
      setReceipts(nextRcpt);
    } catch (err: any) {
      Alert.alert('Finance Load Error', err?.message || 'Failed to load finance records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData(true);
  }, [loadData]);

  const handleOpenInvoicePdf = (inv: Invoice) => {
    const url = inv.share_token
      ? `${API_URL}/finance/public/invoice/${inv.share_token}/pdf`
      : `${API_URL}/finance/invoices/${inv.id}/pdf`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Cannot Open PDF', 'Please check your internet connection or browser settings.');
    });
  };

  const handleShareInvoice = async (inv: Invoice) => {
    if (!inv.share_token) {
      handleOpenInvoicePdf(inv);
      return;
    }
    const publicUrl = `${API_URL.replace(/\/api\/v1\/?$/, '')}/public/invoice/${inv.share_token}`;
    try {
      await Share.share({
        title: `Invoice ${inv.number} - OneWorkLane`,
        message: `Invoice ${inv.number} from OneWorkLane for ${inv.client_name}: ${publicUrl}`,
        url: publicUrl,
      });
    } catch {
      /* ignore */
    }
  };

  const handleOpenReceiptPdf = (rcpt: Receipt) => {
    const url = `${API_URL}/finance/receipts/${rcpt.id}/pdf`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Cannot Open PDF', 'Please check your internet connection.');
    });
  };

  const handleConfirmReceipt = (rcpt: Receipt) => {
    Alert.alert(
      'Confirm Receipt',
      `Post receipt ${rcpt.number} for ${formatMinorMoney(rcpt.amount_received, rcpt.currency)}? This will record the payment and post ledger entries.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Post',
          style: 'default',
          onPress: async () => {
            try {
              setConfirmingId(rcpt.id);
              await api(`/finance/receipts/${rcpt.id}/confirm`, { method: 'POST' });
              setReceipts((prev) => {
                const next = prev.map((r) => (r.id === rcpt.id ? { ...r, status: 'posted' } : r));
                setModuleCache(RCPT_CACHE, next);
                return next;
              });
              Alert.alert('Success', `Receipt ${rcpt.number} has been posted.`);
            } catch (err: any) {
              Alert.alert('Confirmation Failed', err?.message || 'Could not confirm receipt');
            } finally {
              setConfirmingId(null);
            }
          },
        },
      ]
    );
  };

  const todayIso = pktTodayIso();
  const filteredInvoices = invoices.filter((inv) => {
    if (!invoiceMatchesFilter(inv, invoiceFilter, todayIso)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        inv.number.toLowerCase().includes(q) ||
        inv.client_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredReceipts = receipts.filter((rcpt) => {
    if (!receiptMatchesFilter(rcpt.status, receiptFilter)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        rcpt.number.toLowerCase().includes(q) ||
        rcpt.client_name.toLowerCase().includes(q) ||
        (rcpt.reference_number && rcpt.reference_number.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const renderInvoiceStatusBadge = (inv: Invoice) => {
    const s = resolveInvoiceStatus(inv, todayIso);
    let bg = theme.border;
    let textColor = theme.textMuted;
    let label = 'Draft';

    if (s === 'paid') {
      bg = '#DCFCE7';
      textColor = '#166534';
      label = 'Paid';
    } else if (s === 'issued') {
      bg = '#DBEAFE';
      textColor = '#1D4ED8';
      label = 'Issued';
    } else if (s === 'partially_paid') {
      bg = '#FEF3C7';
      textColor = '#92400E';
      label = 'Partial';
    } else if (s === 'overdue') {
      bg = '#FFE4E6';
      textColor = '#9F1239';
      label = 'Overdue';
    } else if (s === 'void') {
      bg = '#F1F5F9';
      textColor = '#64748B';
      label = 'On hold';
    }

    return (
      <View style={[styles.badge, { backgroundColor: bg }]}>
        <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
      </View>
    );
  };

  const renderReceiptStatusBadge = (status: string) => {
    const s = String(status || 'pending').toLowerCase();
    const isPosted = s === 'posted';
    return (
      <View
        style={[
          styles.badge,
          { backgroundColor: isPosted ? '#DCFCE7' : '#FEF3C7' },
        ]}
      >
        <Text
          style={[
            styles.badgeText,
            { color: isPosted ? '#166534' : '#92400E' },
          ]}
        >
          {isPosted ? 'Confirmed' : 'Pending'}
        </Text>
      </View>
    );
  };

  const renderInvoiceCard = ({ item }: { item: Invoice }) => {
    const isExpanded = expandedInvoiceId === item.id;
    return (
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <FileText size={18} color={theme.primary} />
            <Text style={[styles.itemNumber, { color: theme.text }]}>{item.number}</Text>
          </View>
          {renderInvoiceStatusBadge(item)}
        </View>

        <Text style={[styles.clientName, { color: theme.text }]}>{item.client_name}</Text>

        <View style={styles.datesRow}>
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            Issue: {item.issue_date || '—'}
          </Text>
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            Due: {item.due_date || '—'}
          </Text>
        </View>

        <View style={[styles.amountRow, { borderTopColor: theme.border }]}>
          <View>
            <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Total</Text>
            <Text style={[styles.amountTotal, { color: theme.text }]}>
              {formatMinorMoney(item.total, item.currency)}
            </Text>
          </View>
          {item.balance_due > 0 ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Balance Due</Text>
              <Text style={[styles.amountBalance, { color: theme.amber }]}>
                {formatMinorMoney(item.balance_due, item.currency)}
              </Text>
            </View>
          ) : (
            <View style={styles.settledBadge}>
              <CheckCircle2 size={14} color="#166534" />
              <Text style={styles.settledText}>Settled</Text>
            </View>
          )}
        </View>

        {isExpanded && item.line_items && item.line_items.length > 0 ? (
          <View style={[styles.expandedItems, { backgroundColor: theme.isDark ? '#18181b' : '#F8FAFC' }]}>
            <Text style={[styles.lineItemsTitle, { color: theme.textMuted }]}>Line Items</Text>
            {item.line_items.map((line, idx) => (
              <View key={idx} style={styles.lineItemRow}>
                <Text style={[styles.lineItemDesc, { color: theme.text }]} numberOfLines={2}>
                  {line.description} {line.quantity && line.quantity > 1 ? `(x${line.quantity})` : ''}
                </Text>
                <Text style={[styles.lineItemAmount, { color: theme.text }]}>
                  {formatMinorMoney(lineItemAmount(line), item.currency)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={[styles.actionsRow, { borderTopColor: theme.border }]}>
          <Pressable
            style={styles.expandBtn}
            onPress={() => setExpandedInvoiceId(isExpanded ? null : item.id)}
          >
            <Text style={[styles.expandBtnText, { color: theme.primary }]}>
              {isExpanded ? 'Hide Items' : 'View Items'}
            </Text>
            {isExpanded ? (
              <ChevronUp size={16} color={theme.primary} />
            ) : (
              <ChevronDown size={16} color={theme.primary} />
            )}
          </Pressable>

          <View style={styles.actionButtons}>
            <Pressable
              style={[styles.iconAction, { backgroundColor: theme.bgSubtle }]}
              onPress={() => handleShareInvoice(item)}
            >
              <Share2 size={16} color={theme.text} />
            </Pressable>
            <Pressable
              style={[styles.pdfBtn, { backgroundColor: theme.primary }]}
              onPress={() => handleOpenInvoicePdf(item)}
            >
              <Download size={14} color="#ffffff" />
              <Text style={styles.pdfBtnText}>PDF</Text>
            </Pressable>
          </View>
        </View>
      </Card>
    );
  };

  const renderReceiptCard = ({ item }: { item: Receipt }) => {
    const isPosted = String(item.status || '').toLowerCase() === 'posted';
    const isConfirming = confirmingId === item.id;
    return (
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <ReceiptIcon size={18} color={theme.primary} />
            <Text style={[styles.itemNumber, { color: theme.text }]}>{item.number}</Text>
          </View>
          {renderReceiptStatusBadge(item.status)}
        </View>

        <Text style={[styles.clientName, { color: theme.text }]}>{item.client_name}</Text>

        <View style={styles.datesRow}>
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            Date: {item.date || '—'}
          </Text>
          <View style={[styles.methodBadge, { backgroundColor: theme.bgSubtle }]}>
            <CreditCard size={12} color={theme.textMuted} />
            <Text style={[styles.methodText, { color: theme.textMuted }]}>
              {item.method ? item.method.toUpperCase() : 'CASH'}
              {item.bank ? ` · ${item.bank.toUpperCase()}` : ''}
            </Text>
          </View>
        </View>

        {item.reference_number ? (
          <Text style={[styles.referenceText, { color: theme.textMuted }]}>
            Ref: {item.reference_number}
          </Text>
        ) : null}

        <View style={[styles.amountRow, { borderTopColor: theme.border }]}>
          <View>
            <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Received Amount</Text>
            <Text style={[styles.amountTotal, { color: theme.text }]}>
              {formatMinorMoney(item.amount_received, item.currency)}
            </Text>
          </View>

          {item.settles_total ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Applied</Text>
              <Text style={[styles.amountBalance, { color: '#166534' }]}>
                {formatMinorMoney(item.settles_total, item.currency)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.actionsRow, { borderTopColor: theme.border }]}>
          {!isPosted && canManage ? (
            <Pressable
              disabled={isConfirming}
              style={[styles.confirmBtn, { backgroundColor: theme.primary }]}
              onPress={() => handleConfirmReceipt(item)}
            >
              {isConfirming ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <FileCheck size={14} color="#ffffff" />
                  <Text style={styles.confirmBtnText}>Confirm Receipt</Text>
                </>
              )}
            </Pressable>
          ) : (
            <View />
          )}

          <Pressable
            style={[styles.pdfBtnOutline, { borderColor: theme.border }]}
            onPress={() => handleOpenReceiptPdf(item)}
          >
            <Download size={14} color={theme.text} />
            <Text style={[styles.pdfBtnOutlineText, { color: theme.text }]}>Receipt PDF</Text>
          </Pressable>
        </View>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Top Segmented Controls */}
      <View style={[styles.segmentedWrapper, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={[styles.segmentContainer, { backgroundColor: theme.isDark ? '#27272a' : '#F1F5F9' }]}>
          <Pressable
            style={[
              styles.segmentTab,
              activeTab === 'invoices' && [styles.segmentTabActive, { backgroundColor: theme.surface }],
            ]}
            onPress={() => setActiveTab('invoices')}
          >
            <FileText size={16} color={activeTab === 'invoices' ? theme.primary : theme.textMuted} />
            <Text
              style={[
                styles.segmentLabel,
                { color: activeTab === 'invoices' ? theme.text : theme.textMuted },
              ]}
            >
              Invoices ({invoices.length})
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.segmentTab,
              activeTab === 'receipts' && [styles.segmentTabActive, { backgroundColor: theme.surface }],
            ]}
            onPress={() => setActiveTab('receipts')}
          >
            <ReceiptIcon size={16} color={activeTab === 'receipts' ? theme.primary : theme.textMuted} />
            <Text
              style={[
                styles.segmentLabel,
                { color: activeTab === 'receipts' ? theme.text : theme.textMuted },
              ]}
            >
              Receipts ({receipts.length})
            </Text>
          </Pressable>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchBox, { backgroundColor: theme.isDark ? '#18181b' : '#FFFFFF', borderColor: theme.border }]}>
          <Search size={16} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder={activeTab === 'invoices' ? 'Search by invoice # or client...' : 'Search by receipt # or client...'}
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <X size={16} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <FilterChips
          items={activeTab === 'invoices' ? INVOICE_FILTERS : RECEIPT_FILTERS}
          value={activeTab === 'invoices' ? invoiceFilter : receiptFilter}
          onChange={(key) => {
            if (activeTab === 'invoices') setInvoiceFilter(key);
            else setReceiptFilter(key);
          }}
        />
      </View>

      {/* Main Content */}
      {loading ? (
        <TaskListSkeleton rows={6} />
      ) : activeTab === 'invoices' ? (
        <FlatList
          data={filteredInvoices}
          keyExtractor={(item) => item.id}
          renderItem={renderInvoiceCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <FileText size={42} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No Invoices Found</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                {search ? 'Try clearing your search query.' : 'There are no invoices matching this filter.'}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredReceipts}
          keyExtractor={(item) => item.id}
          renderItem={renderReceiptCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <ReceiptIcon size={42} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No Receipts Found</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                {search ? 'Try clearing your search query.' : 'There are no receipts matching this filter.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segmentedWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
    borderRadius: 10,
  },
  segmentTabActive: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentLabel: { fontSize: 13, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 0 },
  listContent: { padding: 16, paddingBottom: 140, gap: 12 },
  card: { padding: 16, borderRadius: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemNumber: { fontSize: 15, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  clientName: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  datesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  metaText: { fontSize: 12 },
  methodBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  methodText: { fontSize: 10, fontWeight: '700' },
  referenceText: { fontSize: 11, marginTop: 4 },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 10,
  },
  amountLabel: { fontSize: 11, fontWeight: '600' },
  amountTotal: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  amountBalance: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  settledBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  settledText: { color: '#166534', fontSize: 11, fontWeight: '700' },
  expandedItems: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    gap: 6,
  },
  lineItemsTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  lineItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineItemDesc: { fontSize: 12, flex: 1, marginRight: 8 },
  lineItemAmount: { fontSize: 12, fontWeight: '700', flexShrink: 0 },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 10,
  },
  expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  expandBtnText: { fontSize: 13, fontWeight: '700' },
  actionButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconAction: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  pdfBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  pdfBtnOutline: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  pdfBtnOutlineText: { fontSize: 12, fontWeight: '700' },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  confirmBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', maxWidth: 260 },
});
