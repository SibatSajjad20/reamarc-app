import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { formatCrmStage } from '../../ui/format';
import type { CrmPipelineStage } from '../../types/crm';

interface StageSheetProps {
  visible: boolean;
  stages: CrmPipelineStage[];
  currentStage?: string | null;
  outcome?: string | null;
  leadName?: string;
  updatingStageId?: string | null;
  onClose: () => void;
  onSelectStage: (stageId: string, stageName?: string) => void;
  onMarkWon: () => void;
  onMarkLost: () => void;
}

export const StageSheet: React.FC<StageSheetProps> = ({
  visible,
  stages,
  currentStage,
  outcome,
  leadName,
  updatingStageId,
  onClose,
  onSelectStage,
  onMarkWon,
  onMarkLost,
}) => {
  const isClosed = Boolean(outcome);
  const isUpdating = Boolean(updatingStageId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={isUpdating ? undefined : onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Pipeline stage</Text>
          <Text style={styles.subtitle}>
            {leadName
              ? `Move "${leadName}" through the sales pipeline`
              : 'Move this lead through the sales pipeline'}
          </Text>

          <View style={styles.stageList}>
            {stages.map((st) => {
              const active = currentStage === st.id && !isClosed;
              const isTargetUpdating = updatingStageId === st.id;
              return (
                <TouchableOpacity
                  key={st.id}
                  style={[
                    styles.stageRow,
                    active ? styles.stageRowActive : null,
                    isUpdating && !isTargetUpdating ? styles.stageRowDisabled : null,
                  ]}
                  onPress={() => onSelectStage(st.id, st.name)}
                  disabled={isClosed || isUpdating}
                >
                  <Text
                    style={[
                      styles.stageLabel,
                      active ? styles.stageLabelActive : null,
                      isUpdating && !isTargetUpdating ? styles.stageLabelDisabled : null,
                    ]}
                  >
                    {formatCrmStage(st.id)}
                  </Text>
                  {isTargetUpdating ? (
                    <ActivityIndicator size="small" color={colors.indigo} />
                  ) : active ? (
                    <Ionicons name="checkmark" size={18} color={colors.indigo} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {!isClosed ? (
            <View style={styles.outcomeRow}>
              <TouchableOpacity
                style={[styles.wonBtn, isUpdating ? styles.btnDisabled : null]}
                onPress={onMarkWon}
                disabled={isUpdating}
              >
                <Ionicons name="trophy-outline" size={16} color={colors.emerald} />
                <Text style={styles.wonText}>Mark won</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.lostBtn, isUpdating ? styles.btnDisabled : null]}
                onPress={onMarkLost}
                disabled={isUpdating}
              >
                <Ionicons name="close-circle-outline" size={16} color={colors.rose} />
                <Text style={styles.lostText}>Mark lost</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.closedBanner}>
              <Text style={styles.closedText}>
                Closed as {String(outcome).toUpperCase()}
              </Text>
            </View>
          )}
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
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 14,
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
    marginBottom: 16,
  },
  stageList: {
    gap: 8,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stageRowActive: {
    backgroundColor: '#EEF2FF',
    borderColor: colors.indigo,
  },
  stageRowDisabled: {
    opacity: 0.5,
  },
  stageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate,
  },
  stageLabelActive: {
    color: colors.indigo,
    fontWeight: '700',
  },
  stageLabelDisabled: {
    color: colors.muted,
  },
  outcomeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  wonBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingVertical: 12,
    borderRadius: 12,
  },
  wonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.emerald,
  },
  lostBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF1F2',
    paddingVertical: 12,
    borderRadius: 12,
  },
  lostText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.rose,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  closedBanner: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  closedText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
});
