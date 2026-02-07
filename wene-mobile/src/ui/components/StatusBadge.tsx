import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { adminTheme } from '../adminTheme';
import type { EventState } from '../../types/ui';
import { eventStateLabel } from '../../types/ui';

interface StatusBadgeProps {
  state: EventState;
  style?: ViewStyle;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ state, style }) => {
  return (
    <View style={[styles.badge, style]}>
      <AppText variant="small" style={styles.text}>
        {eventStateLabel[state]}
      </AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: adminTheme.spacing.sm,
    paddingVertical: 4,
    borderRadius: adminTheme.radius.sm,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
  },
  text: {
    color: adminTheme.colors.textSecondary,
  },
});
