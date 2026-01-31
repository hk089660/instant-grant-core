import React from 'react';
import { Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { theme } from '../theme';

type TextVariant = 'h1' | 'h2' | 'h3' | 'body' | 'bodyLarge' | 'caption' | 'small';

interface AppTextProps {
  children: React.ReactNode;
  variant?: TextVariant;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
}

export const AppText: React.FC<AppTextProps> = ({
  children,
  variant = 'body',
  style,
  numberOfLines,
  selectable,
}) => {
  return (
    <Text
      style={[styles.base, theme.typography[variant], style]}
      numberOfLines={numberOfLines}
      selectable={selectable}
    >
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  base: {
    // ベーススタイル
  },
});
