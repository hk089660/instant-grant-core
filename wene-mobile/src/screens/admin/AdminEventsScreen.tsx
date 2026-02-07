import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Button, CategoryTabs, CountBadge, EventRow, AdminShell, StatusBadge } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { getCategories, getDisplayRtCount } from '../../data/adminMock';
import { useAdminRole } from '../../hooks/useAdminRole';
import { listEvents } from '../../data/adminEventsStore';
import type { AdminEvent } from '../../data/adminEventsStore';

export const AdminEventsScreen: React.FC = () => {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { role, setRole, loading } = useAdminRole();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const canManageCategories = role === 'admin';
  const canCreateEvent = role === 'admin' || role === 'operator';

  if (loading || role == null) {
    return (
      <View style={[styles.content, { justifyContent: 'center', alignItems: 'center' }]}>
        <AppText variant="caption" style={{ color: adminTheme.colors.textSecondary }}>読み込み中…</AppText>
      </View>
    );
  }

  const fetchEvents = useCallback(async () => {
    const list = await listEvents();
    setEvents(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [fetchEvents])
  );

  return (
    <AdminShell
      title="イベント一覧"
      role={role}
      onRoleChange={setRole}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="h2" style={styles.title}>
            イベント一覧
          </AppText>
          <View style={styles.headerActions}>
            {canCreateEvent ? (
              <Button title="イベント作成" variant="secondary" onPress={() => router.push('/admin/events/new' as any)} tone="dark" />
            ) : null}
            {canManageCategories ? (
              <Button
                title="カテゴリ管理"
                variant="secondary"
                onPress={() => router.push('/admin/categories' as any)}
                style={styles.actionButton}
                tone="dark"
              />
            ) : null}
          </View>
        </View>

        <CategoryTabs
          categories={getCategories()}
          selectedId={selectedCategory}
          onSelect={setSelectedCategory}
          tone="dark"
          style={styles.tabs}
        />

        <View style={styles.list}>
          {events.map((event) => (
            <EventRow
              key={event.id}
              title={event.title}
              datetime={event.datetime}
              host={event.host}
              tone="dark"
              leftSlot={
                <CountBadge
                  value={getDisplayRtCount(event.id)}
                  backgroundColor={adminTheme.colors.muted}
                  textColor={adminTheme.colors.textSecondary}
                />
              }
              rightSlot={<StatusBadge state={event.state} />}
              onPress={() => router.push(`/admin/events/${event.id}` as any)}
              style={styles.row}
            />
          ))}
        </View>

        <AppText variant="small" style={styles.note}>
          RT=現在までの参加完了数
        </AppText>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    marginLeft: adminTheme.spacing.sm,
  },
  title: {
    color: '#ffffff',
  },
  tabs: {
    marginBottom: adminTheme.spacing.md,
  },
  list: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    paddingHorizontal: adminTheme.spacing.md,
    marginBottom: adminTheme.spacing.lg,
  },
  row: {
    borderBottomColor: adminTheme.colors.border,
  },
  note: {
    color: '#cccccc',
    marginTop: adminTheme.spacing.sm,
  },
});
