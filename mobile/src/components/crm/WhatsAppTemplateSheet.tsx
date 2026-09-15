import React from 'react';
import {
  ActivityIndicator,
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
import type { CrmTemplate } from '../../types/crm';

interface WhatsAppTemplateSheetProps {
  visible: boolean;
  templates: CrmTemplate[];
  loading?: boolean;
  leadName?: string;
  onClose: () => void;
  onSelect: (templateId: string | null) => void;
}

export const WhatsAppTemplateSheet: React.FC<WhatsAppTemplateSheetProps> = ({
  visible,
  templates,
  loading,
  leadName,
  onClose,
  onSelect,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>WhatsApp message</Text>
          <Text style={styles.subtitle}>
            {leadName ? `Choose a template for ${leadName}` : 'Choose a template'}
          </Text>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={colors.indigo} />
          ) : (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              {templates.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.card}
                  onPress={() => onSelect(t.id)}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{t.name}</Text>
                    {t.is_default ? (
                      <View style={styles.defaultPill}>
                        <Text style={styles.defaultPillText}>Default</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardBody} numberOfLines={3}>
                    {t.body}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={styles.blankRow} onPress={() => onSelect(null)}>
                <Ionicons name="chatbubble-outline" size={18} color={colors.slate} />
                <Text style={styles.blankText}>Open chat only (no template)</Text>
              </TouchableOpacity>
            </ScrollView>
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
    maxHeight: '75%',
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
    marginBottom: 14,
  },
  scroll: {
    maxHeight: 420,
  },
  card: {
    backgroundColor: colors.bg,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  defaultPill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  defaultPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.indigo,
  },
  cardBody: {
    fontSize: 13,
    color: colors.slate,
    lineHeight: 18,
  },
  blankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  blankText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate,
  },
});
