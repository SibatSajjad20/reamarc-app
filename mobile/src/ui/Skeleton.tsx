import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../theme';

type SkeletonBlockProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

/** Pulsing placeholder bar — JS-only, OTA-safe (no native deps). */
export function SkeletonBlock({
  width = '100%',
  height = 12,
  radius = 6,
  style,
}: SkeletonBlockProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: '#E4E4E7',
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Card-shaped rows matching daily-log group cards. */
export function DailyLogListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={`skel-${index}`} style={styles.card}>
          <View style={styles.row}>
            <SkeletonBlock width={36} height={36} radius={18} />
            <View style={styles.col}>
              <SkeletonBlock width={`${58 + (index % 3) * 8}%` as DimensionValue} height={13} />
              <SkeletonBlock
                width={`${40 + (index % 4) * 6}%` as DimensionValue}
                height={11}
                style={{ marginTop: 8 }}
              />
            </View>
            <SkeletonBlock width={36} height={12} radius={4} />
          </View>
          <SkeletonBlock height={10} style={{ marginTop: 14 }} />
          <SkeletonBlock width="72%" height={10} style={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

export function DailyLogDetailSkeleton() {
  return (
    <View style={styles.detail}>
      <View style={styles.card}>
        <View style={styles.row}>
          <SkeletonBlock width={42} height={42} radius={21} />
          <View style={[styles.col, { marginLeft: 12 }]}>
            <SkeletonBlock width="55%" height={14} />
            <SkeletonBlock width="40%" height={11} style={{ marginTop: 8 }} />
          </View>
        </View>
        <SkeletonBlock height={16} style={{ marginTop: 16 }} />
        <SkeletonBlock width="80%" height={16} style={{ marginTop: 8 }} />
        <View style={[styles.row, { marginTop: 14, gap: 8 }]}>
          <SkeletonBlock width={90} height={24} radius={999} />
          <SkeletonBlock width={70} height={24} radius={999} />
        </View>
      </View>
      <View style={styles.card}>
        <SkeletonBlock width="30%" height={13} />
        <SkeletonBlock height={12} style={{ marginTop: 14 }} />
        <SkeletonBlock width="70%" height={12} style={{ marginTop: 10 }} />
        <SkeletonBlock width="55%" height={12} style={{ marginTop: 10 }} />
        <SkeletonBlock width="65%" height={12} style={{ marginTop: 10 }} />
      </View>
    </View>
  );
}

/** Mirrors admin Overview: 2x2 metric cards + team directory rows. */
export function OverviewAttendanceSkeleton({ employeeRows = 5 }: { employeeRows?: number }) {
  return (
    <View style={styles.overview}>
      <View style={styles.metricsContainer}>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={styles.metricHead}>
              <SkeletonBlock width={54} height={11} radius={4} />
              <SkeletonBlock width={24} height={24} radius={8} />
            </View>
            <SkeletonBlock width={72} height={22} radius={6} style={{ marginTop: 4 }} />
            <SkeletonBlock height={6} radius={999} style={{ marginTop: 12 }} />
            <SkeletonBlock width="70%" height={10} radius={4} style={{ marginTop: 10 }} />
          </View>
          <View style={styles.metricCard}>
            <View style={styles.metricHead}>
              <SkeletonBlock width={68} height={11} radius={4} />
              <SkeletonBlock width={24} height={24} radius={8} />
            </View>
            <View style={styles.dualRow}>
              <View style={styles.dualCol}>
                <SkeletonBlock width={28} height={20} radius={5} />
                <SkeletonBlock width={48} height={10} radius={4} style={{ marginTop: 8 }} />
              </View>
              <View style={styles.dualColEnd}>
                <SkeletonBlock width={28} height={20} radius={5} />
                <SkeletonBlock width={36} height={10} radius={4} style={{ marginTop: 8 }} />
              </View>
            </View>
          </View>
        </View>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={styles.metricHead}>
              <SkeletonBlock width={88} height={11} radius={4} />
              <SkeletonBlock width={24} height={24} radius={8} />
            </View>
            <View style={styles.dualRow}>
              <View style={styles.dualCol}>
                <SkeletonBlock width={28} height={20} radius={5} />
                <SkeletonBlock width={36} height={10} radius={4} style={{ marginTop: 8 }} />
              </View>
              <View style={styles.dualColEnd}>
                <SkeletonBlock width={28} height={20} radius={5} />
                <SkeletonBlock width={40} height={10} radius={4} style={{ marginTop: 8 }} />
              </View>
            </View>
          </View>
          <View style={styles.metricCard}>
            <View style={styles.metricHead}>
              <SkeletonBlock width={72} height={11} radius={4} />
              <SkeletonBlock width={24} height={24} radius={8} />
            </View>
            <SkeletonBlock width={36} height={22} radius={6} style={{ marginTop: 4 }} />
            <SkeletonBlock width="65%" height={10} radius={4} style={{ marginTop: 12 }} />
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <SkeletonBlock width={140} height={15} radius={5} />
        <SkeletonBlock width={56} height={12} radius={4} />
      </View>

      <View style={styles.searchBar}>
        <SkeletonBlock width={16} height={16} radius={8} />
        <SkeletonBlock width="55%" height={12} radius={4} style={{ marginLeft: 10 }} />
      </View>

      <View style={styles.chipRow}>
        {[72, 88, 64, 70, 74].map((w, i) => (
          <SkeletonBlock key={`chip-${i}`} width={w} height={30} radius={999} />
        ))}
      </View>

      {Array.from({ length: employeeRows }).map((_, index) => (
        <View key={`emp-skel-${index}`} style={styles.empCard}>
          <View style={styles.empMain}>
            <SkeletonBlock width={38} height={38} radius={19} />
            <View style={styles.empCol}>
              <View style={styles.empNameRow}>
                <SkeletonBlock
                  width={`${48 + (index % 3) * 10}%` as DimensionValue}
                  height={13}
                  radius={4}
                />
                <SkeletonBlock width={58} height={20} radius={6} />
              </View>
              <SkeletonBlock
                width={`${40 + (index % 4) * 8}%` as DimensionValue}
                height={11}
                radius={4}
                style={{ marginTop: 8 }}
              />
            </View>
          </View>
          <View style={styles.empTimings}>
            <SkeletonBlock width={72} height={11} radius={4} />
            <SkeletonBlock width={72} height={11} radius={4} />
            <SkeletonBlock width={64} height={11} radius={4} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Sales Pipeline list skeleton — matches current filter button + cards. */
export function PipelineListSkeleton({ cardRows = 5 }: { cardRows?: number }) {
  return (
    <View style={styles.pipelineContainer}>
      <View style={styles.pipelineModeToggle}>
        <SkeletonBlock width="48%" height={34} radius={12} />
        <SkeletonBlock width="48%" height={34} radius={12} />
      </View>

      <View style={styles.pipelineFilterBar}>
        <SkeletonBlock width={108} height={34} radius={12} />
      </View>

      <View style={styles.pipelineFeed}>
        {Array.from({ length: cardRows }).map((_, index) => (
          <View key={`pipe-skel-${index}`} style={styles.pipelineCard}>
            <View style={styles.pipelineCardHeader}>
              <View style={{ flex: 1 }}>
                <SkeletonBlock
                  width={`${52 + (index % 3) * 12}%` as DimensionValue}
                  height={15}
                  radius={5}
                />
                <SkeletonBlock
                  width={`${38 + (index % 4) * 8}%` as DimensionValue}
                  height={11}
                  radius={4}
                  style={{ marginTop: 6 }}
                />
              </View>
              <SkeletonBlock width={74} height={22} radius={10} />
            </View>

            <View style={styles.pipelineTagsRow}>
              <SkeletonBlock width={54} height={20} radius={6} />
              <SkeletonBlock width={72} height={20} radius={6} />
              <SkeletonBlock width={88} height={20} radius={6} />
            </View>

            <View style={styles.pipelineCardFooter}>
              <View style={styles.pipelineAssignee}>
                <SkeletonBlock width={18} height={18} radius={9} />
                <SkeletonBlock width={64} height={11} radius={4} style={{ marginLeft: 6 }} />
              </View>
              <View style={styles.pipelineActions}>
                <SkeletonBlock width={36} height={36} radius={10} />
                <SkeletonBlock width={36} height={36} radius={10} style={{ marginLeft: 6 }} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Sales Pipeline lead profile detail skeleton — matches current tabs + cards. */
export function PipelineLeadDetailSkeleton() {
  return (
    <View style={styles.leadDetailContainer}>
      <View style={styles.leadDetailTopBar}>
        <SkeletonBlock width={40} height={40} radius={12} />
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <SkeletonBlock width="55%" height={16} radius={5} />
          <SkeletonBlock width="38%" height={11} radius={4} style={{ marginTop: 5 }} />
        </View>
        <SkeletonBlock width={92} height={32} radius={12} />
      </View>

      <View style={styles.leadDetailTabs}>
        <SkeletonBlock width="31%" height={40} radius={0} />
        <SkeletonBlock width="31%" height={40} radius={0} />
        <SkeletonBlock width="31%" height={40} radius={0} />
      </View>

      <View style={styles.leadDetailCard}>
        <SkeletonBlock width={70} height={14} radius={4} style={{ marginBottom: 14 }} />
        {[1, 2, 3].map((i) => (
          <View key={`c-field-${i}`} style={styles.leadDetailStackedField}>
            <SkeletonBlock width={56} height={11} radius={4} />
            <SkeletonBlock
              width={`${55 + i * 8}%` as DimensionValue}
              height={14}
              radius={4}
              style={{ marginTop: 4 }}
            />
          </View>
        ))}
      </View>

      <View style={styles.leadDetailCard}>
        <SkeletonBlock width={90} height={14} radius={4} style={{ marginBottom: 14 }} />
        {[1, 2, 3, 4].map((i) => (
          <View key={`r-field-${i}`} style={styles.leadDetailStackedField}>
            <SkeletonBlock width={64} height={11} radius={4} />
            <SkeletonBlock
              width={`${40 + i * 6}%` as DimensionValue}
              height={14}
              radius={4}
              style={{ marginTop: 4 }}
            />
          </View>
        ))}
      </View>

      <View style={styles.leadDetailCard}>
        <View style={styles.pipelineCardHeader}>
          <SkeletonBlock width={80} height={14} radius={4} />
          <SkeletonBlock width={64} height={22} radius={8} />
        </View>
        <View style={[styles.leadDetailStackedField, { marginTop: 12 }]}>
          <SkeletonBlock width={90} height={11} radius={4} />
          <SkeletonBlock width="45%" height={14} radius={4} style={{ marginTop: 4 }} />
        </View>
      </View>

      <View style={styles.leadDetailBottomBar}>
        <SkeletonBlock width="48%" height={48} radius={14} />
        <SkeletonBlock width="48%" height={48} radius={14} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  detail: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  col: { flex: 1, marginLeft: 10 },
  overview: { marginTop: 2 },
  metricsContainer: { marginBottom: 16 },
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  metricCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  metricHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dualRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  dualCol: { flex: 1 },
  dualColEnd: { flex: 1, alignItems: 'flex-end' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  empCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 10,
  },
  empMain: { flexDirection: 'row', alignItems: 'center' },
  empCol: { flex: 1, marginLeft: 12 },
  empNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  empTimings: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F4F4F5',
  },
  /* Sales Pipeline Skeletons */
  pipelineContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  pipelineMetricRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  pipelineModeToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  pipelineFilterBar: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  pipelineFeed: {
    gap: 10,
  },
  pipelineCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pipelineCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  pipelineTagsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  pipelineCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  pipelineAssignee: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pipelineActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /* Lead Detail Skeleton */
  leadDetailContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  leadDetailTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  leadDetailTabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  leadDetailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  leadDetailStackedField: {
    marginBottom: 12,
  },
  leadDetailFieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  leadDetailBottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
});
