import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

interface TruckLoaderProps {
  label?: string;
  size?: number; // scale multiplier, default 1
  truckColor?: string; // cabin color, default #965cfd
}

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
          toValue: 3,
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
          <Svg
            width={75}
            height={75}
            viewBox="0 0 453.459 453.459"
            fill="#282828"
          >
            <Path
              d="M252.882,0c-37.781,0-68.686,29.953-70.245,67.358h-6.917v8.954c-26.109,2.163-45.463,10.011-45.463,19.366h9.993 c-1.65,5.146-2.507,10.54-2.507,16.017c0,28.956,23.558,52.514,52.514,52.514c28.956,0,52.514-23.558,52.514-52.514 c0-5.478-0.856-10.872-2.506-16.017h9.992c0-9.354-19.352-17.204-45.463-19.366v-8.954h-6.149C200.189,38.779,223.924,16,252.882,0 c29.952,0,54.32,24.368,54.32,54.32c0,28.774-11.078,37.009-25.105,47.437c-17.444,12.968-37.216,27.667-37.216,78.884v113.914 h-0.797c-5.068,0-9.174,4.108-9.174,9.177c0,2.844,1.293,5.383,3.321,7.066c-3.432,27.933-26.851,95.744-8.226,115.459v11.202h45.75 v-11.202c18.625-19.715-4.794-87.527-8.227-115.459c2.029-1.683,3.322-4.223,3.322-7.066c0-5.068-4.107-9.177-9.176-9.177h-0.795 V196.641c0-43.174,14.942-54.283,30.762-66.043c14.793-10.997,31.559-23.461,31.559-60.277C323.202,31.545,291.656,0,252.882,0z M232.77,111.694c0,23.442-19.071,42.514-42.514,42.514c-23.442,0-42.514-19.072-42.514-42.514c0-5.531,1.078-10.957,3.141-16.017 h78.747C231.693,100.736,232.77,106.162,232.77,111.694z"
              fill="#282828"
            />
          </Svg>
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
          <Svg width={130} height={61} viewBox="0 0 198 93">
            {/* Truck Cabin */}
            <Path
              strokeWidth={3}
              stroke="#282828"
              fill={truckColor}
              d="M135 22.5H177.264C178.295 22.5 179.22 23.133 179.594 24.0939L192.33 56.8443C192.442 57.1332 192.5 57.4404 192.5 57.7504V89C192.5 90.3807 191.381 91.5 190 91.5H135C133.619 91.5 132.5 90.3807 132.5 89V25C132.5 23.6193 133.619 22.5 135 22.5Z"
            />
            {/* Window */}
            <Path
              strokeWidth={3}
              stroke="#282828"
              fill="#7D7C7C"
              d="M146 33.5H181.741C182.779 33.5 183.709 34.1415 184.078 35.112L190.538 52.112C191.16 53.748 189.951 55.5 188.201 55.5H146C144.619 55.5 143.5 54.3807 143.5 53V36C143.5 34.6193 144.619 33.5 146 33.5Z"
            />
            {/* Door Handle */}
            <Path
              strokeWidth={2}
              stroke="#282828"
              fill="#282828"
              d="M150 65C150 65.39 149.763 65.8656 149.127 66.2893C148.499 66.7083 147.573 67 146.5 67C145.427 67 144.501 66.7083 143.873 66.2893C143.237 65.8656 143 65.39 143 65C143 64.61 143.237 64.1344 143.873 63.7107C144.501 63.2917 145.427 63 146.5 63C147.573 63 148.499 63.2917 149.127 63.7107C149.763 64.1344 150 64.61 150 65Z"
            />
            {/* Headlight */}
            <Rect
              strokeWidth={2}
              stroke="#282828"
              fill="#FFFCAB"
              rx={1}
              height={7}
              width={5}
              y={63}
              x={187}
            />
            {/* Front Bumper */}
            <Rect
              strokeWidth={2}
              stroke="#282828"
              fill="#282828"
              rx={1}
              height={11}
              width={4}
              y={81}
              x={193}
            />
            {/* Cargo Box */}
            <Rect
              strokeWidth={3}
              stroke="#282828"
              fill="#DFDFDF"
              rx={2.5}
              height={90}
              width={121}
              y={1.5}
              x={6.5}
            />
            {/* Rear Step */}
            <Rect
              strokeWidth={2}
              stroke="#282828"
              fill="#DFDFDF"
              rx={2}
              height={4}
              width={6}
              y={84}
              x={1}
            />
          </Svg>
        </Animated.View>

        {/* Stationary Wheels at Bottom */}
        <View style={styles.truckTires}>
          {/* Rear Wheel */}
          <Svg width={20} height={20} viewBox="0 0 30 30">
            <Circle
              strokeWidth={3}
              stroke="#282828"
              fill="#282828"
              r={13.5}
              cy={15}
              cx={15}
            />
            <Circle fill="#DFDFDF" r={7} cy={15} cx={15} />
          </Svg>

          {/* Front Wheel */}
          <Svg width={20} height={20} viewBox="0 0 30 30">
            <Circle
              strokeWidth={3}
              stroke="#282828"
              fill="#282828"
              r={13.5}
              cy={15}
              cx={15}
            />
            <Circle fill="#DFDFDF" r={7} cy={15} cx={15} />
          </Svg>
        </View>

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
    width: 130,
    marginBottom: 4,
    zIndex: 2,
  },
  truckTires: {
    width: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    position: 'absolute',
    bottom: 0,
    zIndex: 3,
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
    zIndex: 4,
  },
  label: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '600',
    color: '#71717A',
    letterSpacing: 0.3,
  },
});
