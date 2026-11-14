import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme';
import { useTabBarOffset } from './layout';

export interface ScreenProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollable?: boolean;
  safeTop?: boolean;
  safeBottom?: boolean;
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  style,
  contentContainerStyle,
  scrollable = false,
  safeTop = true,
  safeBottom = true,
}) => {
  const theme = useTheme();
  const tabOffset = useTabBarOffset();

  const edges: ('top' | 'bottom' | 'left' | 'right')[] = ['left', 'right'];
  if (safeTop) edges.push('top');
  if (safeBottom) edges.push('bottom');

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.container, { backgroundColor: theme.bg }, style]}
    >
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {scrollable ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabOffset }, contentContainerStyle]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { paddingBottom: tabOffset }, contentContainerStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});

export default Screen;
