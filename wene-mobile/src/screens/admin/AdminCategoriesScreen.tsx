import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Button, Card, AdminShell } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { getCategories } from '../../data/adminMock';
import { useAdminRole } from '../../hooks/useAdminRole';

export const AdminCategoriesScreen: React.FC = () => {
  const router = useRouter();
  const { role, setRole, loading } = useAdminRole();
  if (loading || role == null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <AppText variant="caption" style={{ color: adminTheme.colors.textSecondary }}>読み込み中…</AppText>
      </View>
    );
  }
  const isAdmin = role === 'admin';

  return (
    <AdminShell
      title="カテゴリ管理"
      role={role}
      onRoleChange={(nextRole) => {
        setRole(nextRole);
        setRole(nextRole);
      }}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="h2" style={styles.title}>
            カテゴリ管理
          </AppText>
          <Button title="戻る" variant="secondary" onPress={() => router.back()} tone="dark" />
        </View>

        {!isAdmin ? (
          <Card style={styles.card}>
            <AppText variant="bodyLarge" style={styles.cardText}>
              管理者のみ操作できます
            </AppText>
            <AppText variant="caption" style={styles.note}>
              閲覧モードでは編集できません
            </AppText>
          </Card>
        ) : (
          <>
            <AppText variant="caption" style={styles.note}>
              削除したカテゴリのイベントは「未分類」に移動します
            </AppText>

            <Card style={styles.card}>
              {getCategories().map((category, index) => (
                <View key={category.id} style={styles.row}>
                  <AppText variant="bodyLarge" style={styles.cardText}>
                    {category.label}
                  </AppText>
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.actionButton}>
                      <AppText variant="caption" style={styles.actionText}>
                        編集
                      </AppText>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                      <AppText variant="caption" style={styles.actionText}>
                        削除
                      </AppText>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                      <AppText variant="caption" style={styles.actionText}>
                        {index === 0 ? '上へ' : '下へ'}
                      </AppText>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </Card>

            <Button title="カテゴリを追加" variant="secondary" onPress={() => {}} tone="dark" />
          </>
        )}
      </ScrollView>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  content: {
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: adminTheme.spacing.md,
  },
  title: {
    color: adminTheme.colors.text,
  },
  note: {
    color: adminTheme.colors.textSecondary,
    marginBottom: adminTheme.spacing.md,
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
    marginBottom: adminTheme.spacing.lg,
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
    paddingVertical: adminTheme.spacing.sm,
  },
  cardText: {
    color: adminTheme.colors.text,
  },
  actions: {
    flexDirection: 'row',
    marginTop: adminTheme.spacing.xs,
  },
  actionButton: {
    marginRight: adminTheme.spacing.sm,
  },
  actionText: {
    color: adminTheme.colors.textSecondary,
  },
});
