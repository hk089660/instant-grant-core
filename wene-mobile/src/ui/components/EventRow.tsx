import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { AppText } from './AppText';
import { theme } from '../theme';
import { adminTheme } from '../adminTheme';

interface EventRowProps {
  title: string;
  datetime: string;
  host: string;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  /** 管理者UI用: 文字・枠を白系に */
  tone?: 'light' | 'dark';
}

export const EventRow: React.FC<EventRowProps> = ({
  title,
  datetime,
  host,
  leftSlot,
  rightSlot,
  onPress,
  style,
  tone = 'light',
}) => {
  const isDark = tone === 'dark';
  const textStyle: TextStyle | undefined = isDark ? { color: '#ffffff' } : undefined;
  const rowStyle = isDark ? [styles.row, styles.rowDark, style] : [styles.row, style];
  return (
    <TouchableOpacity style={rowStyle} onPress={onPress} disabled={!onPress}>
      {leftSlot ? <View style={styles.left}>{leftSlot}</View> : null}
      <View style={styles.body}>
        <AppText variant="bodyLarge" style={textStyle}>{title}</AppText>
        <AppText variant="caption" style={textStyle}>{datetime}</AppText>
        <AppText variant="caption" style={textStyle}>主催: {host}</AppText>
      </View>
      {rightSlot ? <View style={styles.right}>{rightSlot}</View> : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  rowDark: {
    borderBottomColor: adminTheme.colors.border,
  },
  textDark: {
    color: '#ffffff',
  },
  left: {
    marginRight: theme.spacing.sm,
  },
  body: {
    flex: 1,
  },
  right: {
    marginLeft: theme.spacing.sm,
  },
});
