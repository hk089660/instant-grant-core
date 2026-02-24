import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
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

export const Loading: React.FC<LoadingProps> = ({
  message,
  size = 'small',
  mode = 'default',
}) => {
  const [activeDotIndex, setActiveDotIndex] = useState(0);
  const isAdmin = mode === 'admin';
  const textColor = isAdmin ? adminTheme.colors.text : theme.colors.textSecondary;
  const indicatorColor = isAdmin ? adminTheme.colors.text : theme.colors.black;

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveDotIndex((prev) => (prev + 1) % DOT_COUNT);
    }, DOT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  if (message) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size={size} color={indicatorColor} />
        <AppText variant="caption" style={[styles.message, { color: textColor }]}>
          {message}
        </AppText>
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
      </View>
    );
  }

  // メッセージなしの場合も視認しやすいドットアニメーションを表示
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
});
