import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { formatCrmStage } from '../../ui/format';
import type { CrmPipelineStage } from '../../types/crm';

export type QuickFilter = 'all' | 'uncontacted' | 'due' | 'won' | 'lost';

interface PipelineFilterSheetProps {
  visible: boolean;
  mode?: 'leads' | 'deals';
  stages: CrmPipelineStage[];
  quickFilter: QuickFilter;
  selectedStage: string;
  onClose: () => void;
  onChangeQuickFilter: (value: QuickFilter) => void;
  onChangeStage: (value: string) => void;
  onClear: () => void;
}

const STATUS_OPTIONS: { id: QuickFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'uncontacted', label: 'Uncontacted' },
  { id: 'due', label: 'Due' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];

export function filterSummary(quickFilter: QuickFilter, selectedStage: string): string | null {
  const parts: string[] = [];
  if (quickFilter !== 'all') {
    parts.push(STATUS_OPTIONS.find((o) => o.id === quickFilter)?.label || quickFilter);
  }
  if (selectedStage !== 'all') {
    parts.push(formatCrmStage(selectedStage));
  }
  return parts.length ? parts.join(' · ') : null;
}

export const PipelineFilterSheet: React.FC<PipelineFilterSheetProps> = ({
  visible,
  mode = 'leads',
  stages,
  quickFilter,
  selectedStage,
  onClose,
  onChangeQuickFilter,
  onChangeStage,
  onClear,
}) => {
  const hasFilters =
    (mode === 'leads' && quickFilter !== 'all') || selectedStage !== 'all';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Filters</Text>
              <Text style={styles.subtitle}>
                {mode === 'leads' ? 'Narrow the lead list' : 'Narrow the deal list'}
              </Text>
            </View>
            {hasFilters ? (
              <TouchableOpacity onPress={onClear} hitSlop={8}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {mode === 'leads' ? (
            <>
              <Text style={styles.sectionLabel}>Status</Text>
              <View style={styles.chipWrap}>
                {STATUS_OPTIONS.map((opt) => {
                  const active = quickFilter === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.chip, active ? styles.chipActive : null]}
                      onPress={() => onChangeQuickFilter(opt.id)}
                    >
                      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={styles.sectionLabel}>Stage</Text>
          <ScrollView style={styles.stageScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.chipWrap}>
              <TouchableOpacity
                style={[styles.chip, selectedStage === 'all' ? styles.chipActive : null]}
                onPress={() => onChangeStage('all')}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedStage === 'all' ? styles.chipTextActive : null,
                  ]}
                >
                  All stages
                </Text>
              </TouchableOpacity>
              {stages.map((st) => {
                const active = selectedStage === st.id;
                return (
                  <TouchableOpacity
                    key={st.id}
                    style={[styles.chip, active ? styles.chipActive : null]}
                    onPress={() => onChangeStage(st.id)}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                      {formatCrmStage(st.id)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24, 24, 27, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  clearText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.indigo,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 8,
    marginTop: 4,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.slate,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  stageScroll: {
    maxHeight: 180,
  },
  doneBtn: {
    marginTop: 8,
    backgroundColor: colors.indigo,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
