import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

interface TruckLoaderProps {
  label?: string;
  size?: number; // scale multiplier, default 1
  truckColor?: string; // cabin color, default #965cfd
}

/**
 * Pure React Native TruckLoader:
 * - Uses 100% pure React Native Views & Animated styles
 * - Zero native binary dependencies (runs Over-The-Air on all existing APKs without reinstalling)
 * - 60 FPS native driver animations
 */
export const TruckLoader: React.FC<TruckLoaderProps> = ({
  label = 'Loading...',
  size = 1,
  truckColor = '#965cfd',
}) => {
  // Suspension bounce animation (up and down)
  const bounceAnim = useRef(new Animated.Value(0)).current;
  // Road & lamp scrolling animation (right to left)
  const scrollAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Truck bounce loop (1.0s)
    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 2.5,
          duration: 500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );

    // 2. Road & lamppost scroll loop (1.4s)
    const scrollLoop = Animated.loop(
      Animated.timing(scrollAnim, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    bounceLoop.start();
    scrollLoop.start();

    return () => {
      bounceLoop.stop();
      scrollLoop.stop();
    };
  }, [bounceAnim, scrollAnim]);

  // Interpolations for sliding scenery
  const lampTranslateX = scrollAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [180, -220],
  });

  const dash1TranslateX = scrollAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [120, -220],
  });

  const dash2TranslateX = scrollAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [160, -200],
  });

  return (
    <View style={[styles.container, { transform: [{ scale: size }] }]}>
      <View style={styles.truckWrapper}>
        {/* Animated Moving Lamp Post */}
        <Animated.View
          style={[
            styles.lampPost,
            {
              transform: [{ translateX: lampTranslateX }],
            },
          ]}
        >
          {/* Curved Lamp Arm */}
          <View style={styles.lampHeadWrapper}>
            <View style={styles.lampArm} />
            <View style={styles.lampHead} />
          </View>
          {/* Pole */}
          <View style={styles.lampPole} />
          {/* Base */}
          <View style={styles.lampBase} />
        </Animated.View>

        {/* Animated Bouncing Truck Body */}
        <Animated.View
          style={[
            styles.truckBody,
            {
              transform: [{ translateY: bounceAnim }],
            },
          ]}
        >
          <View style={styles.truckRow}>
            {/* Cargo Box (Grey Container) */}
            <View style={styles.cargoBox}>
              <View style={styles.cargoLine} />
              <View style={styles.cargoRearStep} />
            </View>

            {/* Cabin (Purple Head) */}
            <View style={[styles.cabin, { backgroundColor: truckColor }]}>
              {/* Windshield Window */}
              <View style={styles.window} />
              {/* Door Handle */}
              <View style={styles.doorHandle} />
              {/* Headlight */}
              <View style={styles.headlight} />
              {/* Front Bumper */}
              <View style={styles.bumper} />
            </View>
          </View>

          {/* Dual Wheels Attached to Truck */}
          <View style={styles.wheelsRow}>
            {/* Rear Wheel */}
            <View style={styles.wheel}>
              <View style={styles.wheelRim} />
            </View>
            {/* Front Wheel */}
            <View style={styles.wheel}>
              <View style={styles.wheelRim} />
            </View>
          </View>
        </Animated.View>

        {/* Road Base */}
        <View style={styles.road}>
          {/* Road Markings Dash 1 */}
          <Animated.View
            style={[
              styles.roadDash1,
              { transform: [{ translateX: dash1TranslateX }] },
            ]}
          />
          {/* Road Markings Dash 2 */}
          <Animated.View
            style={[
              styles.roadDash2,
              { transform: [{ translateX: dash2TranslateX }] },
            ]}
          />
        </View>
      </View>

      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  truckWrapper: {
    width: 190,
    height: 95,
    flexDirection: 'column',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  truckBody: {
    position: 'relative',
    marginBottom: 6,
    zIndex: 3,
  },
  truckRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  cargoBox: {
    width: 78,
    height: 52,
    backgroundColor: '#DFDFDF',
    borderWidth: 2.2,
    borderColor: '#282828',
    borderRadius: 3,
    position: 'relative',
  },
  cargoLine: {
    position: 'absolute',
    left: 4,
    top: 4,
    right: 4,
    bottom: 4,
    borderWidth: 1,
    borderColor: '#C4C4C4',
    borderStyle: 'dashed',
    borderRadius: 2,
  },
  cargoRearStep: {
    position: 'absolute',
    left: -4,
    bottom: 4,
    width: 4,
    height: 3,
    backgroundColor: '#DFDFDF',
    borderWidth: 1.5,
    borderColor: '#282828',
    borderRadius: 1,
  },
  cabin: {
    width: 44,
    height: 38,
    borderWidth: 2.2,
    borderColor: '#282828',
    borderTopRightRadius: 18,
    borderBottomRightRadius: 4,
    position: 'relative',
    marginLeft: -1,
  },
  window: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 24,
    height: 18,
    backgroundColor: '#7D7C7C',
    borderWidth: 1.8,
    borderColor: '#282828',
    borderTopRightRadius: 14,
    borderBottomRightRadius: 2,
  },
  doorHandle: {
    position: 'absolute',
    top: 24,
    left: 5,
    width: 5,
    height: 2.2,
    backgroundColor: '#282828',
    borderRadius: 1,
  },
  headlight: {
    position: 'absolute',
    bottom: 5,
    right: -2,
    width: 3.5,
    height: 5,
    backgroundColor: '#FFFCAB',
    borderWidth: 1,
    borderColor: '#282828',
    borderRadius: 1,
  },
  bumper: {
    position: 'absolute',
    bottom: -1,
    right: -4,
    width: 4,
    height: 7,
    backgroundColor: '#282828',
    borderRadius: 1,
  },
  wheelsRow: {
    position: 'absolute',
    bottom: -8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 8,
    zIndex: 4,
  },
  wheel: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#282828',
    borderWidth: 2,
    borderColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelRim: {
    width: 7.5,
    height: 7.5,
    borderRadius: 3.75,
    backgroundColor: '#DFDFDF',
  },
  road: {
    width: '100%',
    height: 2,
    backgroundColor: '#282828',
    position: 'relative',
    bottom: 0,
    borderRadius: 2,
    zIndex: 1,
    overflow: 'hidden',
  },
  roadDash1: {
    position: 'absolute',
    width: 24,
    height: 2,
    backgroundColor: '#F4F4F5',
    borderRadius: 1,
  },
  roadDash2: {
    position: 'absolute',
    width: 14,
    height: 2,
    backgroundColor: '#F4F4F5',
    borderRadius: 1,
  },
  lampPost: {
    position: 'absolute',
    bottom: 2,
    zIndex: 2,
    alignItems: 'center',
  },
  lampHeadWrapper: {
    alignItems: 'flex-start',
    width: 28,
  },
  lampArm: {
    width: 22,
    height: 14,
    borderTopWidth: 2.8,
    borderRightWidth: 2.8,
    borderColor: '#282828',
    borderTopRightRadius: 14,
  },
  lampHead: {
    width: 12,
    height: 6,
    backgroundColor: '#282828',
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    marginTop: -2,
    marginLeft: 15,
  },
  lampPole: {
    width: 2.8,
    height: 52,
    backgroundColor: '#282828',
    borderRadius: 1.4,
    marginTop: -1,
  },
  lampBase: {
    width: 8,
    height: 3,
    backgroundColor: '#282828',
    borderRadius: 1.5,
  },
  label: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '600',
    color: '#71717A',
    letterSpacing: 0.3,
  },
});
