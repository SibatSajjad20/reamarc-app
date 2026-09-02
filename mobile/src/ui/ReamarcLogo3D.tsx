import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle, type ImageStyle } from 'react-native';

const LOGO_SOURCE = require('../../assets/reamarc-logo-3d.gif');

interface ReamarcLogo3DProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}

export const ReamarcLogo3D: React.FC<ReamarcLogo3DProps> = ({
  size = 64,
  style,
  imageStyle,
}) => {
  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Image
        source={LOGO_SOURCE}
        style={[{ width: size, height: size }, imageStyle]}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ReamarcLogo3D;
