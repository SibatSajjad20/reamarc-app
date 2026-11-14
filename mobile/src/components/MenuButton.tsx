import React from 'react';
import { StyleSheet } from 'react-native';
import { Menu } from 'lucide-react-native';
import { useDrawer } from '../context/DrawerContext';
import { useTheme } from '../theme';
import { PressScale } from '../ui/motion';

export function MenuButton({ color }: { color?: string }) {
  const { openDrawer } = useDrawer();
  const theme = useTheme();
  return (
    <PressScale
      onPress={openDrawer}
      hitSlop={8}
      accessibilityLabel="Open menu"
      style={[
        styles.btn,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Menu size={20} color={color || theme.text} strokeWidth={2} />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
