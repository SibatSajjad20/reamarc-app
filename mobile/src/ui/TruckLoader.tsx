import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { OneWorkLaneLogo } from './OneWorkLaneLogo';
import { colors } from '../theme';

interface TruckLoaderProps {
  label?: string;
  size?: number; // scale multiplier, default 1
  truckColor?: string; // preserved for backward compatibility
}

/**
 * Mobile App Loading Component:
 * - Renders the OneWorkLane app mark
 * - Zero native binary dependencies (safe for OTA updates and Expo Go)
 */
export const TruckLoader: React.FC<TruckLoaderProps> = ({
  label = 'Loading...',
  size = 1,
}) => {
  const logoSize = Math.round(72 * size);

  return (
    <View style={styles.container}>
      <OneWorkLaneLogo size={logoSize} />
      {!!label && (
        <Text style={styles.label}>{label}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
  },
});

export default TruckLoader;
