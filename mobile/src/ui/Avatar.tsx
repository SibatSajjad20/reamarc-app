import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { resolveAvatarUri } from '../lib/avatarUrl';
import { API_URL, useTheme } from '../theme';
import { initials } from './format';

export function Avatar({
  name,
  uri,
  size = 44,
}: {
  name?: string | null;
  uri?: string | null;
  size?: number;
}) {
  const theme = useTheme();
  const radius = size / 2;
  const resolved = resolveAvatarUri(uri, size, API_URL);
  const [failed, setFailed] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setFailed(false);
    opacity.setValue(0);
  }, [resolved, opacity]);

  const wrap = {
    width: size,
    height: size,
    borderRadius: radius,
    backgroundColor: theme.primaryLight,
    overflow: 'hidden' as const,
  };

  if (resolved && !failed) {
    return (
      <View style={[styles.wrap, wrap]}>
        <Text style={[styles.text, { fontSize: size * 0.34, color: theme.primary }]}>{initials(name)}</Text>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
          <Image
            source={{ uri: resolved }}
            onLoad={() => {
              Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
            }}
            onError={() => setFailed(true)}
            style={{ width: size, height: size, borderRadius: radius }}
          />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, wrap]}>
      <Text style={[styles.text, { fontSize: size * 0.34, color: theme.primary }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontWeight: '600' },
});
