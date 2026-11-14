import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle, type ImageStyle } from 'react-native';

const LOGO_SOURCE = require('../../assets/icon.png');

export interface OneWorkLaneLogoProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}

export const OneWorkLaneLogo: React.FC<OneWorkLaneLogoProps> = ({
  size = 64,
  style,
  imageStyle,
}) => {
  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Image
        source={LOGO_SOURCE}
        style={[{ width: size, height: size, borderRadius: Math.round(size * 0.2) }, imageStyle]}
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

export default OneWorkLaneLogo;
