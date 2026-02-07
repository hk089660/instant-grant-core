import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText, Button } from '../../ui/components';
import { theme } from '../../ui/theme';
import { setStudentSession } from '../../utils/studentSession';
import {
  upsertStudentRegistry,
  maskStudentCode,
} from '../../data/studentRegistryMock';
import { schoolRoutes } from '../../lib/schoolRoutes';

/**
 * 生徒登録画面（モック）
 * 登録成功時に setStudentSession の直後に upsertStudentRegistry を呼ぶ。
 * 学年は UI で 1..12 の範囲を検証する。
 * 実装時はバックエンド API が生徒プロファイルを保存する想定。
 * studentCode は端末に保存せず、マスクしたコードのみレジストリに保存する。
 */
export const RegisterScreen: React.FC = () => {
  const router = useRouter();
  const [grade, setGrade] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const gradeNum = parseInt(grade.trim(), 10);
    if (Number.isNaN(gradeNum) || gradeNum < 1 || gradeNum > 12) {
      Alert.alert('入力エラー', '学年は 1～12 の数値を入力してください');
      return;
    }
    const name = displayName.trim();
    if (!name) {
      Alert.alert('入力エラー', '表示名を入力してください');
      return;
    }
    const code = studentCode.trim();
    if (!code) {
      Alert.alert('入力エラー', '確認用コードを入力してください');
      return;
    }

    setLoading(true);
    try {
      // モック: studentId は仮発行。実 API では registerStudent の応答で受け取る。
      const studentId = `stu-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await setStudentSession({ studentId });

      await upsertStudentRegistry({
        studentId,
        grade: gradeNum,
        studentCodeMasked: maskStudentCode(code),
        displayName: name,
        registeredAt: new Date().toISOString(),
      });

      router.replace(schoolRoutes.events as any);
    } catch (e) {
      Alert.alert('エラー', e instanceof Error ? e.message : '登録に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <AppText variant="h2" style={styles.title}>
          生徒登録
        </AppText>
        <AppText variant="caption" style={styles.subtitle}>
          参加券・参加証を利用するために登録してください（モック）
        </AppText>

        <AppText variant="caption" style={styles.label}>
          学年（1～12）
        </AppText>
        <TextInput
          style={styles.input}
          value={grade}
          onChangeText={setGrade}
          placeholder="例: 3"
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="number-pad"
        />

        <AppText variant="caption" style={styles.label}>
          表示名
        </AppText>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="例: 山田 太郎"
          placeholderTextColor={theme.colors.textTertiary}
          autoCapitalize="none"
        />

        <AppText variant="caption" style={styles.label}>
          確認用コード（末尾4桁のみ保存されます）
        </AppText>
        <TextInput
          style={styles.input}
          value={studentCode}
          onChangeText={setStudentCode}
          placeholder="例: 12345678"
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="number-pad"
        />

        <Button
          title={loading ? '登録中…' : '登録する'}
          onPress={handleSubmit}
          disabled={loading}
          style={styles.submitButton}
        />
        <Button
          title="戻る"
          variant="secondary"
          onPress={() => router.back()}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  label: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.text,
  },
  submitButton: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
});
