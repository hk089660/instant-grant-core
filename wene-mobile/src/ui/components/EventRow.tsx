import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { theme } from '../theme';

interface EventRowProps {
  title: string;
  datetime: string;
  host: string;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  textColor?: string;
  solanaMint?: string;
}

export const EventRow: React.FC<EventRowProps> = ({
  title,
  datetime,
  host,
  leftSlot,
  rightSlot,
  onPress,
  style,
  textColor,
  solanaMint,
}) => {
  const textStyle = textColor ? { color: textColor } : undefined;

  return (
    <TouchableOpacity style={[styles.row, style]} onPress={onPress} disabled={!onPress}>
      {leftSlot ? <View style={styles.left}>{leftSlot}</View> : null}
      <View style={styles.body}>
        <AppText variant="bodyLarge" style={textStyle}>
          {title}
        </AppText>
        <AppText variant="caption" style={textStyle}>
          {datetime}
        </AppText>
        <AppText variant="caption" style={textStyle}>
          主催: {host}
        </AppText>
        {solanaMint && (
          <View style={styles.tokenBadge}>
            <AppText variant="caption" style={styles.tokenText}>
              SPL Token: {solanaMint.slice(0, 6)}...{solanaMint.slice(-4)}
            </AppText>
          </View>
        )}
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
  left: {
    marginRight: theme.spacing.sm,
  },
  body: {
    flex: 1,
  },
  right: {
    marginLeft: theme.spacing.sm,
  },
  tokenBadge: {
    marginTop: theme.spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(110, 86, 207, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tokenText: {
    color: '#6e56cf',
    fontSize: 10,
    fontWeight: '600',
  }
});
