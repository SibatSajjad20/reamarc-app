import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

export function FadeIn({
  children,
  delay = 0,
  duration = 180,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, delay, useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration, delay, useNativeDriver: true }),
    ]).start();
  }, [delay, duration, opacity, translate]);
  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY: translate }] }]}>
      {children}
    </Animated.View>
  );
}

/** Layout styles stay on Pressable so flex:1 tab items do not collapse. */
export function PressScale({
  children,
  style,
  contentStyle,
  ...rest
}: PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      {...rest}
      style={style}
      onPressIn={(e) => {
        Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28, bounciness: 0 }).start();
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 4 }).start();
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View style={[{ transform: [{ scale }] }, contentStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

export function useSheetMotion(visible: boolean, duration = 180) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      translateY.setValue(18);
      return;
    }
    opacity.setValue(0);
    translateY.setValue(18);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration, useNativeDriver: true }),
    ]).start();
  }, [visible, duration, opacity, translateY]);

  return { opacity, translateY };
}

export function SuccessBurst({
  show,
  color = '#059669',
  backgroundColor = '#ECFDF5',
}: {
  show: boolean;
  color?: string;
  backgroundColor?: string;
}) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!show) {
      opacity.setValue(0);
      return;
    }
    scale.setValue(0.7);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: 140, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 70, useNativeDriver: true }),
      ]),
    ]).start();
    const hide = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start();
    }, 650);
    return () => clearTimeout(hide);
  }, [show, opacity, scale]);

  if (!show) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        alignSelf: 'center',
        top: '38%',
        zIndex: 20,
        opacity,
        transform: [{ scale }],
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 18,
            height: 10,
            borderLeftWidth: 3,
            borderBottomWidth: 3,
            borderColor: color,
            transform: [{ rotate: '-45deg' }, { translateY: -2 }],
          }}
        />
      </View>
    </Animated.View>
  );
}
