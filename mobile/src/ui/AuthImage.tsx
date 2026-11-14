import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { Image as ImageIcon } from 'lucide-react-native';
import { getAccessToken } from '../lib/secure';
import { mediaNeedsAuth, resolveThumbUrl } from '../lib/mediaUrl';
import { useTheme } from '../theme';

type Props = {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  wrapStyle?: StyleProp<ViewStyle>;
  width?: 200 | 400 | 800;
};

export function AuthImage({ uri, style, wrapStyle, width = 400 }: Props) {
  const theme = useTheme();
  const resolved = useMemo(() => resolveThumbUrl(uri, width), [uri, width]);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    if (!resolved || !mediaNeedsAuth(resolved)) return;
    void getAccessToken().then((value) => {
      if (live) setToken(value);
    });
    return () => {
      live = false;
    };
  }, [resolved]);

  const box = [styles.fallback, { backgroundColor: theme.bgSubtle }, wrapStyle, style];

  if (!resolved || failed) {
    return (
      <View style={box}>
        <ImageIcon size={18} color={theme.textMuted} />
      </View>
    );
  }

  const needsAuth = mediaNeedsAuth(resolved);
  if (needsAuth && !token) {
    return <View style={box} />;
  }

  return (
    <View style={[styles.clip, wrapStyle, style]}>
      <Image
        source={
          needsAuth && token
            ? {
                uri: resolved,
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: 'image/*',
                  'X-Client': 'mobile',
                  'X-Requested-With': 'XMLHttpRequest',
                },
              }
            : { uri: resolved }
        }
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  clip: {
    overflow: 'hidden',
  },
});
