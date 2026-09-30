import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { crmApi } from '../../lib/crmApi';
import type { CrmLead } from '../../types/crm';

interface WonLeadPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (lead: CrmLead) => void;
}

export const WonLeadPicker: React.FC<WonLeadPickerProps> = ({ visible, onClose, onSelect }) => {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setDebounced('');
      return;
    }
    const timer = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query, visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    crmApi
      .listLeads({ outcome: 'won', search: debounced || undefined, limit: 50 })
      .then((res) => {
        if (cancelled) return;
        const won = (res.items || []).filter((lead) => lead.outcome === 'won');
        setLeads(won);
        setTotal(res.total ?? won.length);
      })
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setLeads([]);
        setError(err?.message || 'Could not load won leads.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, debounced]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>New deal</Text>
              <Text style={styles.subtitle}>Choose a lead that has been marked won.</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search won leads"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              autoCorrect={false}
            />
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.indigo} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : (
            <FlatList
              data={leads}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={leads.length === 0 ? styles.emptyList : undefined}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {debounced
                    ? 'No won leads match that search.'
                    : 'No won leads yet. Mark a lead as won, then create the deal.'}
                </Text>
              }
              ListFooterComponent={
                total > leads.length ? (
                  <Text style={styles.footer}>Showing {leads.length} of {total}. Search to narrow the list.</Text>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    if (item.outcome !== 'won') return;
                    onSelect(item);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[item.company, item.email].filter(Boolean).join(' · ') || 'Won lead'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '80%',
    minHeight: 360,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.muted,
  },
  searchBox: {
    marginHorizontal: 20,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    backgroundColor: colors.bg,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  center: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  error: {
    color: colors.rose,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  empty: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.muted,
  },
  footer: {
    padding: 16,
    textAlign: 'center',
    fontSize: 11,
    color: colors.muted,
  },
});
