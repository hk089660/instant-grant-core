/**
 * Admin カテゴリ管理画面
 * 将来的に API で管理。現在はプレースホルダー。
 */
import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Button, Card, AdminShell } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';

export const AdminCategoriesScreen: React.FC = () => {
  const router = useRouter();

  return (
    <AdminShell title="カテゴリ管理" role="admin">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="h2" style={styles.title}>
            カテゴリ管理
          </AppText>
          <Button title="戻る" variant="secondary" dark onPress={() => router.back()} />
        </View>

        <AppText variant="caption" style={styles.note}>
          カテゴリの追加・編集・削除は今後のアップデートで実装予定です
        </AppText>

        <Card style={styles.card}>
          <AppText variant="body" style={styles.cardText}>
            カテゴリ一覧は Worker API からの取得に統一予定です。
          </AppText>
          <AppText variant="small" style={styles.cardDim}>
            現在この画面では静的データを表示しません。
          </AppText>
        </Card>
      </ScrollView>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  content: {},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: adminTheme.spacing.md,
  },
  title: { color: adminTheme.colors.text },
  note: {
    color: adminTheme.colors.textSecondary,
    marginBottom: adminTheme.spacing.md,
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
    borderWidth: 1,
    borderRadius: adminTheme.radius.md,
    padding: adminTheme.spacing.md,
    marginBottom: adminTheme.spacing.lg,
  },
  cardText: { color: adminTheme.colors.text },
  cardDim: { color: adminTheme.colors.textTertiary, marginTop: adminTheme.spacing.sm },
});
