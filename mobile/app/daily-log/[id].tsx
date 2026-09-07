import React, { useCallback, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import {
  DailyLogEntry,
  buildEntriesQuery,
  deliverableLabel,
  formatHoursShort,
  isHttpUrl,
  isUploadPath,
  splitDeliverables,
  taskStatusTone,
} from '../../src/lib/dailyLog';
import {
  findCachedEntryById,
  getCachedEntries,
  isCacheStale,
  setCachedEntries,
} from '../../src/lib/dailyLogCache';
import { colors } from '../../src/theme';
import { Avatar } from '../../src/ui/Avatar';
import { DailyLogDetailSkeleton } from '../../src/ui/Skeleton';
import { formatDisplayDate, prettyRole } from '../../src/ui/format';

function Field({ label, value }: { label: string; value?: string | null }) {
  const display = String(value || '').trim();
  if (!display) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{display}</Text>
    </View>
  );
}

export default function DailyLogDetailScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string; userId?: string }>();
  const entryId = typeof params.id === 'string' ? params.id : '';
  const date =
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : '';
  const userId = typeof params.userId === 'string' ? params.userId : '';

  const initialCached = entryId ? findCachedEntryById(entryId) : null;
  const [entry, setEntry] = useState<DailyLogEntry | null>(initialCached);
  const [loading, setLoading] = useState(!initialCached);
  const [error, setError] = useState('');
  const didBlurRef = useRef(false);
  const reqIdRef = useRef(0);
  const hadCacheOnMount = useRef(Boolean(initialCached));

  const load = useCallback(
    async (opts: { soft?: boolean; force?: boolean } = {}) => {
      const { soft = false, force = false } = opts;
      if (!entryId || !date) {
        setEntry(null);
        setError('Missing log reference');
        setLoading(false);
        return;
      }

      const fromCache = findCachedEntryById(entryId);
      if (fromCache && !force) {
        setEntry(fromCache);
        setLoading(false);
        setError('');
      }

      const dayCached = getCachedEntries(date, date, userId, '');
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      if (fromCache && !force && !isCacheStale(dayCached, date, date, today) && soft) {
        return;
      }

      if (!fromCache && !soft) setLoading(true);
      setError('');
      const reqId = ++reqIdRef.current;

      try {
        const query = buildEntriesQuery({
          startDate: date,
          endDate: date,
          userId: userId || undefined,
          limit: 500,
        });
        const data = await api<DailyLogEntry[]>(`/daily-log/entries${query}`);
        if (reqId !== reqIdRef.current) return;
        const list = Array.isArray(data) ? data : [];
        setCachedEntries(date, date, userId, '', list);
        const found = list.find((item) => item.id === entryId) || null;
        setEntry(found);
        if (!found) setError('Log not found');
      } catch (err: any) {
        if (reqId !== reqIdRef.current) return;
        if (!fromCache) {
          setEntry(null);
          setError(err?.message || 'Failed to load task detail');
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [entryId, date, userId],
  );

  useFocusEffect(
    useCallback(() => {
      if (!didBlurRef.current) {
        void load({ soft: hadCacheOnMount.current });
        return () => {
          didBlurRef.current = true;
        };
      }
      void load({ soft: true });
      return () => {
        didBlurRef.current = true;
      };
    }, [load]),
  );

  if (loading && !entry) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <DailyLogDetailSkeleton />
      </SafeAreaView>
    );
  }

  if (!entry) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]} edges={['bottom']}>
        <View style={styles.emptyBox}>
          <Ionicons name="document-outline" size={28} color={colors.muted} />
          <Text style={styles.emptyText}>{error || 'Log not found'}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load({ force: true })}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const tone = taskStatusTone(entry.task_status);
  const deliverables = splitDeliverables(entry.deliverables);
  const customFields = entry.custom_fields
    ? Object.entries(entry.custom_fields).filter(([, v]) => String(v ?? '').trim())
    : [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Avatar name={entry.resource_name} size={42} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.heroName}>{entry.resource_name}</Text>
              <Text style={styles.heroMeta}>
                {entry.department || 'General'}
                {entry.role ? ` · ${prettyRole(entry.role)}` : ''}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.statusText, { color: tone.fg }]}>{tone.label}</Text>
            </View>
          </View>

          <Text style={styles.taskTitle}>{entry.task_description || 'Untitled task'}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={13} color={colors.indigo} />
              <Text style={styles.metaChipText}>{formatDisplayDate(entry.date)}</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={13} color={colors.indigo} />
              <Text style={styles.metaChipText}>{formatHoursShort(entry.hours_utilized)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Details</Text>
          <Field label="Client / Project" value={entry.client_project} />
          <Field label="Task type" value={entry.task_type} />
          <Field label="Hours utilized" value={formatHoursShort(entry.hours_utilized)} />
          {entry.start_time || entry.end_time ? (
            <Field
              label="Time range"
              value={`${entry.start_time || '—'} – ${entry.end_time || '—'}`}
            />
          ) : null}
          <Field label="Revisions done" value={entry.revisions_done} />
          <Field label="Remarks" value={entry.remarks} />
          <Field label="Variance reason" value={entry.variance_reason} />
        </View>

        {customFields.length > 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Custom fields</Text>
            {customFields.map(([key, value]) => (
              <Field key={key} label={key} value={String(value)} />
            ))}
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Deliverables</Text>
          {deliverables.length === 0 ? (
            <Text style={styles.emptyInline}>No deliverables attached</Text>
          ) : (
            deliverables.map((item, index) => {
              const http = isHttpUrl(item);
              const upload = isUploadPath(item);
              const label = deliverableLabel(item);
              if (http) {
                return (
                  <Pressable
                    key={`${item}-${index}`}
                    style={styles.deliverableRow}
                    onPress={() => Linking.openURL(item)}
                  >
                    <Ionicons name="link-outline" size={16} color={colors.indigo} />
                    <Text style={styles.deliverableLink} numberOfLines={2}>
                      {label}
                    </Text>
                    <Ionicons name="open-outline" size={14} color={colors.muted} />
                  </Pressable>
                );
              }
              return (
                <View key={`${item}-${index}`} style={styles.deliverableRow}>
                  <Ionicons
                    name={upload ? 'document-attach-outline' : 'attach-outline'}
                    size={16}
                    color={colors.slate}
                  />
                  <Text style={styles.deliverableFile} numberOfLines={2}>
                    {label}
                  </Text>
                  {upload ? <Text style={styles.fileChip}>File</Text> : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginHorizontal: 20,
  },
  emptyText: { marginTop: 8, fontSize: 13, color: colors.muted, textAlign: 'center' },
  retryBtn: {
    marginTop: 12,
    backgroundColor: colors.indigo,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 12,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  heroName: { fontSize: 15, fontWeight: '800', color: colors.text },
  heroMeta: { marginTop: 2, fontSize: 12, color: colors.muted },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  taskTitle: { fontSize: 17, fontWeight: '800', color: colors.text, lineHeight: 24 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaChipText: { fontSize: 12, fontWeight: '700', color: colors.indigo },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 10 },
  field: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  fieldValue: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 20 },
  emptyInline: { fontSize: 13, color: colors.muted },
  deliverableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F4F4F5',
  },
  deliverableLink: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.indigo },
  deliverableFile: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  fileChip: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
});
