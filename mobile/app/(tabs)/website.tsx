import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebsiteScreen from '../website-projects/index';
import { ModuleHeader } from '../../src/ui/ModuleHeader';
import { useTheme } from '../../src/theme';

export default function WebsiteTab() {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <ModuleHeader title="Website" />
      <WebsiteScreen />
    </SafeAreaView>
  );
}
