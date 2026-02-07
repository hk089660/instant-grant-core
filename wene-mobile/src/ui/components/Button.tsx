import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { theme } from '../theme';
import { adminTheme } from '../adminTheme';

type ButtonVariant = 'primary' | 'secondary';
type ButtonSize = 'large' | 'medium';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  /** 管理者UI用: 背景・文字を暗色テーマに（文字は白） */
  tone?: 'light' | 'dark';
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'large',
  disabled = false,
  loading = false,
  style,
  tone = 'light',
}) => {
  const isDisabled = disabled || loading;
  const isDark = tone === 'dark';
  const buttonStyles = isDark
    ? [
        styles.button,
        variant === 'primary' ? styles.primaryDark : styles.secondaryDark,
        styles[size],
        isDisabled && styles.disabled,
        style,
      ]
    : [
        styles.button,
        styles[variant],
        styles[size],
        isDisabled && styles.disabled,
        style,
      ];
  const textStyles = isDark
    ? ([styles.text, styles[`${size}Text`], styles.textDark] as TextStyle[])
    : [styles.text, styles[`${variant}Text`], styles[`${size}Text`]];
  const indicatorColor = isDark ? adminTheme.colors.text : (variant === 'primary' ? theme.colors.white : theme.colors.black);

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator size="small" color={indicatorColor} />
      ) : (
        <Text style={textStyles}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  primary: {
    backgroundColor: theme.colors.black,
  },
  secondary: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  primaryDark: {
    backgroundColor: adminTheme.colors.primary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  secondaryDark: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  large: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    minWidth: 200,
  },
  medium: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minHeight: 44,
  },
  disabled: {
    backgroundColor: theme.colors.disabled,
    borderColor: theme.colors.disabled,
  },
  text: {
    fontWeight: '600',
  },
  primaryText: {
    color: theme.colors.white,
  },
  secondaryText: {
    color: theme.colors.black,
  },
  textDark: {
    color: adminTheme.colors.text,
  },
  largeText: {
    fontSize: 16,
  },
  mediumText: {
    fontSize: 14,
  },
});
