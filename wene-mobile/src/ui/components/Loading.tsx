import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Animated, Easing } from 'react-native';
import { theme } from '../theme';
import { adminTheme } from '../adminTheme';
import { AppText } from './AppText';

interface LoadingProps {
  message?: string;
  size?: 'small' | 'large';
  mode?: 'default' | 'admin';
}

const DOT_COUNT = 3;
const DOT_INTERVAL_MS = 320;
const MODERN_BAR_COUNT = 3;
const MODERN_BAR_DURATION_MS = 520;
const MODERN_BAR_DELAY_MS = 120;

export const Loading: React.FC<LoadingProps> = ({
  message,
  size = 'small',
  mode = 'default',
}) => {
  const [activeDotIndex, setActiveDotIndex] = useState(0);
  const isAdmin = mode === 'admin';
  const modernBarAnim = useRef(
    Array.from({ length: MODERN_BAR_COUNT }, () => new Animated.Value(0.35))
  ).current;
  const textColor = isAdmin ? adminTheme.colors.text : theme.colors.textSecondary;
  const indicatorColor = isAdmin ? adminTheme.colors.text : theme.colors.black;

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setInterval(() => {
      setActiveDotIndex((prev) => (prev + 1) % DOT_COUNT);
    }, DOT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) return;
    const animations = modernBarAnim.map((value, idx) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(idx * MODERN_BAR_DELAY_MS),
          Animated.timing(value, {
            toValue: 1,
            duration: MODERN_BAR_DURATION_MS,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.35,
            duration: MODERN_BAR_DURATION_MS,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    );
    animations.forEach((anim) => anim.start());
    return () => {
      animations.forEach((anim) => anim.stop());
    };
  }, [isAdmin, modernBarAnim]);

  const modernLoader = (
    <View style={styles.modernRow}>
      {modernBarAnim.map((anim, idx) => (
        <Animated.View
          key={`loading-modern-bar-${idx}`}
          style={[
            styles.modernBar,
            {
              opacity: anim,
              transform: [
                {
                  scaleY: anim.interpolate({
                    inputRange: [0.35, 1],
                    outputRange: [0.65, 1.25],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );

  if (message) {
    return (
      <View style={styles.container}>
        {isAdmin ? <ActivityIndicator size={size} color={indicatorColor} /> : modernLoader}
        <AppText variant="caption" style={[styles.message, { color: textColor }]}>
          {message}
        </AppText>
        {isAdmin ? (
          <View style={styles.dotRow}>
            {Array.from({ length: DOT_COUNT }).map((_, idx) => (
              <View
                key={`loading-dot-${idx}`}
                style={[
                  styles.dot,
                  {
                    backgroundColor: textColor,
                    opacity: activeDotIndex === idx ? 1 : 0.22,
                  },
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  if (isAdmin) {
    return (
      <View style={styles.simpleContainer}>
        <View style={styles.dotRow}>
          {Array.from({ length: DOT_COUNT }).map((_, idx) => (
            <View
              key={`loading-simple-dot-${idx}`}
              style={[
                styles.dot,
                {
                  backgroundColor: textColor,
                  opacity: activeDotIndex === idx ? 1 : 0.22,
                },
              ]}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.simpleContainer}>
      {modernLoader}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  simpleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  message: {
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  modernRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 22,
  },
  modernBar: {
    width: 6,
    height: 20,
    borderRadius: 999,
    backgroundColor: theme.colors.textSecondary,
  },
});
