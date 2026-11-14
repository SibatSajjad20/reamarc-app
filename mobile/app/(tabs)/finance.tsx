import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import FinanceScreen from '../finance/index';
import { ModuleHeader } from '../../src/ui/ModuleHeader';
import { useTheme } from '../../src/theme';

export default function FinanceTab() {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <ModuleHeader title="Finance" />
      <FinanceScreen />
    </SafeAreaView>
  );
}
