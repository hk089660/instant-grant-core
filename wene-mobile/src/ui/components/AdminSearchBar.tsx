import React from 'react';
import { View, TextInput, StyleSheet, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { adminTheme } from '../adminTheme';

interface AdminSearchBarProps {
  value: string;
  /** ラベル（例: 「アカウント情報で絞り込み」） */
  label?: string;
  placeholder?: string;
  /** ラベル下の補足テキスト */
  hint?: string;
  onChange: (text: string) => void;
  style?: ViewStyle;
}

export const AdminSearchBar: React.FC<AdminSearchBarProps> = ({
  value,
  label = '検索',
  placeholder = 'ID / 表示名 / 確認コードで検索',
  hint,
  onChange,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <AppText variant="caption" style={styles.label}>
        {label}
      </AppText>
      {hint ? (
        <AppText variant="small" style={styles.hint}>
          {hint}
        </AppText>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={adminTheme.colors.textTertiary}
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: adminTheme.spacing.md,
  },
  label: {
    color: adminTheme.colors.text,
    marginBottom: adminTheme.spacing.xs,
  },
  hint: {
    color: adminTheme.colors.textSecondary,
    marginBottom: adminTheme.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surface,
  },
});
