import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  type PressableProps,
} from 'react-native';
import { useTheme, radii } from '../theme';

export interface CardProps extends Omit<PressableProps, 'style'> {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'subtle' | 'elevated';
  onPress?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = 'default',
  onPress,
  ...rest
}) => {
  const theme = useTheme();

  const containerStyle: ViewStyle = {
    backgroundColor: variant === 'subtle' ? theme.bgSubtle : theme.card,
    borderColor: theme.border,
    borderWidth: variant === 'elevated' ? 0 : 1,
    borderRadius: radii['2xl'],
    padding: 16,
    ...(variant === 'elevated'
      ? {
          shadowColor: '#0F172A',
          shadowOpacity: theme.isDark ? 0.28 : 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        }
      : {}),
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: theme.ripple, borderless: false }}
        style={({ pressed }) => [
          containerStyle,
          pressed && { opacity: 0.88 },
          style,
        ]}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[containerStyle, style]}>
      {children}
    </View>
  );
};

export default Card;
