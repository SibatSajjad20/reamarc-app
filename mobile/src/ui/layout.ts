import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Inner height of the floating quick-nav bar (icons + labels), excluding home-indicator inset. */
export const TAB_BAR_INNER = 56;

export function useTabBarOffset(): number {
  const insets = useSafeAreaInsets();
  const home = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 8);
  return TAB_BAR_INNER + home + 16;
}
