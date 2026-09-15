import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import type { CrmLead } from '../../types/crm';
import { formatCrmStage, getOutreachStatus, titleCaseName } from '../../ui/format';

interface LeadCardProps {
  lead: CrmLead;
  onPress: () => void;
  onWhatsApp: (lead: CrmLead) => void;
  onCall: (lead: CrmLead) => void;
  onClaim?: (lead: CrmLead) => void;
  onChangeStage?: (lead: CrmLead) => void;
}

export const LeadCard: React.FC<LeadCardProps> = memo(({
  lead,
  onPress,
  onWhatsApp,
  onCall,
  onClaim,
  onChangeStage,
}) => {
  const isUnassigned = !lead.assigned_to;
  const isClosed = Boolean(lead.outcome);
  const outreach = getOutreachStatus(lead);

  let slaText: string | null = null;
  let slaCritical = false;

  if (!isClosed && !lead.contacted && !lead.whatsapp_opened_at) {
    const startStr = lead.assigned_at || lead.created_at;
    if (startStr) {
      const elapsedMins = Math.floor((Date.now() - new Date(startStr).getTime()) / 60000);
      if (elapsedMins >= 15) {
        slaText = `${elapsedMins}m`;
        slaCritical = true;
      } else if (elapsedMins >= 0) {
        slaText = `${elapsedMins}m`;
      }
    }
  }

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <Text style={styles.name} numberOfLines={1}>
            {titleCaseName(lead.name)}
          </Text>
          <Text style={styles.company} numberOfLines={1}>
            {[lead.company, lead.city].filter(Boolean).join(' · ') || 'Direct Inbound'}
          </Text>
        </View>

        <View style={styles.badgeContainer}>
          {lead.outcome ? (
            <View
              style={[
                styles.outcomeBadge,
                lead.outcome === 'won' ? styles.wonBadge : styles.lostBadge,
              ]}
            >
              <Text
                style={[
                  styles.outcomeText,
                  lead.outcome === 'won' ? styles.wonText : styles.lostText,
                ]}
              >
                {lead.outcome.toUpperCase()}
              </Text>
            </View>
          ) : onChangeStage ? (
            <TouchableOpacity
              style={styles.stageBadgeBtn}
              onPress={(e) => {
                e.stopPropagation();
                onChangeStage(lead);
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel={`Change stage: current ${formatCrmStage(lead.stage)}`}
            >
              <Text style={styles.stageText}>{formatCrmStage(lead.stage)}</Text>
              <Ionicons name="chevron-down" size={11} color={colors.indigo} style={{ marginLeft: 3 }} />
            </TouchableOpacity>
          ) : (
            <View style={styles.stageBadge}>
              <Text style={styles.stageText}>{formatCrmStage(lead.stage)}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.tagsRow}>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>{titleCaseName(lead.source) || 'Lead'}</Text>
        </View>

        {lead.service ? (
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText} numberOfLines={1}>
              {lead.service}
            </Text>
          </View>
        ) : null}

        {!isClosed ? (
          <View
            style={[
              styles.outreachChip,
              outreach.tone === 'emerald'
                ? styles.outreachDone
                : outreach.tone === 'amber'
                  ? styles.outreachOpen
                  : styles.outreachPending,
            ]}
          >
            <Text
              style={[
                styles.outreachText,
                outreach.tone === 'emerald'
                  ? styles.outreachDoneText
                  : outreach.tone === 'amber'
                    ? styles.outreachOpenText
                    : styles.outreachPendingText,
              ]}
            >
              {outreach.label}
            </Text>
          </View>
        ) : null}

        {slaText ? (
          <View style={[styles.slaChip, slaCritical ? styles.slaCriticalChip : styles.slaWarningChip]}>
            <Ionicons
              name={slaCritical ? 'alert-circle' : 'time-outline'}
              size={11}
              color={slaCritical ? colors.rose : colors.amber}
            />
            <Text
              style={[
                styles.slaChipText,
                slaCritical ? styles.slaCriticalText : styles.slaWarningText,
              ]}
            >
              {slaText}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actionRow}>
        <View style={styles.assigneeContainer}>
          <Ionicons
            name={isUnassigned ? 'help-circle-outline' : 'person-circle-outline'}
            size={16}
            color={isUnassigned ? colors.amber : colors.muted}
          />
          <Text
            style={[styles.assigneeText, isUnassigned ? styles.unassignedText : null]}
            numberOfLines={1}
          >
            {isUnassigned ? 'Unassigned' : titleCaseName(lead.assigned_to_name) || 'Assigned'}
          </Text>
        </View>

        <View style={styles.buttonsContainer}>
          {isUnassigned && onClaim ? (
            <TouchableOpacity
              style={styles.claimButton}
              onPress={() => onClaim(lead)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.claimButtonText}>Claim</Text>
            </TouchableOpacity>
          ) : null}

          {lead.phone_valid ? (
            <>
              <TouchableOpacity
                style={styles.iconAction}
                onPress={() => onWhatsApp(lead)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="WhatsApp"
              >
                <Ionicons name="logo-whatsapp" size={18} color={colors.emerald} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconAction}
                onPress={() => onCall(lead)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Call"
              >
                <Ionicons name="call" size={17} color={colors.indigo} />
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.noPhoneText}>No phone</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

LeadCard.displayName = 'LeadCard';

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleContainer: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  company: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    fontWeight: '500',
  },
  badgeContainer: {
    alignItems: 'flex-end',
  },
  stageBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  stageBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  stageText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.indigo,
  },
  outcomeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  outcomeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  wonBadge: {
    backgroundColor: '#ECFDF5',
  },
  wonText: {
    color: colors.emerald,
  },
  lostBadge: {
    backgroundColor: '#FFF1F2',
  },
  lostText: {
    color: colors.rose,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  metaChip: {
    backgroundColor: colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: 140,
  },
  metaChipText: {
    fontSize: 11,
    color: colors.slate,
    fontWeight: '600',
  },
  outreachChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  outreachPending: {
    backgroundColor: colors.bg,
  },
  outreachOpen: {
    backgroundColor: '#FFFBEB',
  },
  outreachDone: {
    backgroundColor: '#ECFDF5',
  },
  outreachText: {
    fontSize: 11,
    fontWeight: '600',
  },
  outreachPendingText: {
    color: colors.muted,
  },
  outreachOpenText: {
    color: colors.amber,
  },
  outreachDoneText: {
    color: colors.emerald,
  },
  slaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  slaWarningChip: {
    backgroundColor: '#FEF3C7',
  },
  slaWarningText: {
    color: '#B45309',
  },
  slaCriticalChip: {
    backgroundColor: '#FFE4E6',
  },
  slaCriticalText: {
    color: '#BE123C',
  },
  slaChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.bg,
    paddingTop: 10,
  },
  assigneeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 6,
  },
  assigneeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  unassignedText: {
    color: colors.amber,
    fontWeight: '700',
  },
  buttonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  claimButton: {
    backgroundColor: colors.amber,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  iconAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhoneText: {
    fontSize: 11,
    color: colors.muted,
  },
});
