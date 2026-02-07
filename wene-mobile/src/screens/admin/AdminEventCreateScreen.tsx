import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Button, Card, AdminShell } from '../../ui/components';
import { adminTheme } from '../../ui/adminTheme';
import { getCategories } from '../../data/adminMock';
import { useAdminRole } from '../../hooks/useAdminRole';
import { createEvent } from '../../data/adminEventsStore';
import type { EventState } from '../../types/ui';

export const AdminEventCreateScreen: React.FC = () => {
  const router = useRouter();
  const { role, setRole, loading } = useAdminRole();
  if (loading || role == null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <AppText variant="caption" style={{ color: adminTheme.colors.textSecondary }}>読み込み中…</AppText>
      </View>
    );
  }
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [host, setHost] = useState('');
  const [categoryId, setCategoryId] = useState(getCategories()[0]?.id ?? 'other');
  const [state, setState] = useState<EventState>('draft');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role === 'viewer') {
      router.replace('/admin' as any);
    }
  }, [role, router]);

  const handleSubmit = async () => {
    const t = title.trim();
    if (!t) {
      setError('タイトルを入力してください');
      return;
    }
    const d = date.trim();
    if (!d) {
      setError('日付を入力してください（YYYY-MM-DD）');
      return;
    }
    const timeStr = time.trim() || '00:00';
    setError(null);
    setSubmitting(true);
    try {
      const event = await createEvent({
        title: t,
        date: d,
        time: timeStr,
        host: host.trim(),
        categoryId,
        state,
      });
      setSubmitting(false);
      router.replace(`/admin/events/${event.id}` as any);
    } catch (e) {
      setSubmitting(false);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      Alert.alert('エラー', msg);
    }
  };

  if (role === 'viewer') {
    return (
      <View style={styles.centered}>
        <AppText variant="body" style={styles.text}>
          権限がありません
        </AppText>
      </View>
    );
  }

  return (
    <AdminShell
      title="イベント作成"
      role={role}
      onRoleChange={(r) => {
        setRole(r);
        if (r === 'viewer') router.replace('/admin' as any);
      }}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <AppText variant="h2" style={styles.title}>
            イベント作成
          </AppText>
          <Button title="戻る" variant="secondary" onPress={() => router.back()} tone="dark" />
        </View>

        {error ? (
          <Card style={styles.errorCard}>
            <AppText variant="caption" style={styles.errorText}>
              {error}
            </AppText>
          </Card>
        ) : null}

        <Card style={styles.card}>
          <AppText variant="caption" style={styles.label}>
            タイトル（必須）
          </AppText>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="例: 地域清掃ボランティア"
            placeholderTextColor={adminTheme.colors.textTertiary}
          />

          <AppText variant="caption" style={styles.label}>
            日付（YYYY-MM-DD）
          </AppText>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="例: 2026-02-20"
            placeholderTextColor={adminTheme.colors.textTertiary}
            keyboardType="numbers-and-punctuation"
          />

          <AppText variant="caption" style={styles.label}>
            時刻（HH:mm）
          </AppText>
          <TextInput
            style={styles.input}
            value={time}
            onChangeText={setTime}
            placeholder="例: 09:00"
            placeholderTextColor={adminTheme.colors.textTertiary}
            keyboardType="numbers-and-punctuation"
          />

          <AppText variant="caption" style={styles.label}>
            主催
          </AppText>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="例: 生徒会"
            placeholderTextColor={adminTheme.colors.textTertiary}
          />

          <AppText variant="caption" style={styles.label}>
            カテゴリ
          </AppText>
          <View style={styles.categoryRow}>
            {getCategories().filter((c) => c.id !== 'all').map((c) => (
              <Button
                key={c.id}
                title={c.label}
                variant="secondary"
                onPress={() => setCategoryId(c.id)}
                tone="dark"
                style={categoryId === c.id ? styles.categoryBtnActive : styles.categoryBtn}
              />
            ))}
          </View>

          <AppText variant="caption" style={styles.label}>
            状態
          </AppText>
          <View style={styles.stateRow}>
            <Button
              title="下書き"
              variant="secondary"
              onPress={() => setState('draft')}
              tone="dark"
              style={state === 'draft' ? styles.categoryBtnActive : styles.categoryBtn}
            />
            <Button
              title="公開中"
              variant="secondary"
              onPress={() => setState('published')}
              tone="dark"
              style={state === 'published' ? styles.categoryBtnActive : styles.categoryBtn}
            />
          </View>
        </Card>

        <Button
          title={submitting ? '作成中…' : '作成する'}
          onPress={handleSubmit}
          disabled={submitting}
          tone="dark"
        />
      </ScrollView>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: adminTheme.spacing.xl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: adminTheme.colors.background,
  },
  text: {
    color: adminTheme.colors.text,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: adminTheme.spacing.md,
  },
  title: {
    color: '#ffffff',
  },
  errorCard: {
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
    marginBottom: adminTheme.spacing.md,
  },
  errorText: {
    color: '#ff9999',
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderColor: adminTheme.colors.border,
    marginBottom: adminTheme.spacing.lg,
  },
  label: {
    color: adminTheme.colors.textSecondary,
    marginBottom: adminTheme.spacing.xs,
    marginTop: adminTheme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.background,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTheme.spacing.sm,
    marginTop: adminTheme.spacing.xs,
  },
  stateRow: {
    flexDirection: 'row',
    gap: adminTheme.spacing.sm,
    marginTop: adminTheme.spacing.xs,
  },
  categoryBtn: {
    marginRight: 0,
  },
  categoryBtnActive: {
    opacity: 0.9,
  },
});
