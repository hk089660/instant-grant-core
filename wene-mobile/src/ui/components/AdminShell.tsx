import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText } from './AppText';
import { adminTheme } from '../adminTheme';
import type { Role } from '../../types/ui';
import { roleLabel } from '../../types/ui';
import { DevRoleSwitcher } from './DevRoleSwitcher';
import { pingSchoolApi } from '../../api/adminApiHealth';
import { isSchoolApiEnabled } from '../../config/api';
import { apiAdminLogout } from '../../api/adminApiClient';

interface AdminShellProps {
  title: string;
  role: Role;
  onRoleChange?: (role: Role) => void;
  children: React.ReactNode;
}

type ApiStatus = 'off' | 'on' | 'err';

export const AdminShell: React.FC<AdminShellProps> = ({ title, role, onRoleChange, children }) => {
  const router = useRouter();
  const showCategories = role === 'admin';
  const [apiStatus, setApiStatus] = useState<ApiStatus>('off');
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    pingSchoolApi().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setApiStatus('on');
        setApiError(null);
      } else if (result.error === 'disabled') {
        setApiStatus('off');
        setApiError(null);
      } else {
        setApiStatus('err');
        setApiError(result.error ?? result.status?.toString() ?? 'error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const apiLabel = apiStatus === 'on' ? 'API: ON' : apiStatus === 'err' ? 'API: ERR' : 'API: OFF';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <AppText variant="h3" style={styles.logo}>
          We-ne 管理画面
        </AppText>
        <AppText variant="caption" style={styles.pageTitle}>
          {title}
        </AppText>
        <View style={styles.right}>
          <AppText variant="small" style={styles.role}>
            {roleLabel[role]}
          </AppText>
          <AppText variant="small" style={[styles.apiStatus, apiStatus === 'on' && styles.apiOn, apiStatus === 'err' && styles.apiErr]}>
            {apiLabel}
            {apiError ? ` (${apiError})` : ''}
          </AppText>
          <View style={styles.nav}>
            <TouchableOpacity onPress={() => router.push('/admin' as any)}>
              <AppText variant="caption" style={styles.navText}>
                イベント
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/admin/participants' as any)}>
              <AppText variant="caption" style={styles.navText}>
                参加者
              </AppText>
            </TouchableOpacity>
            {showCategories ? (
              <TouchableOpacity onPress={() => router.push('/admin/categories' as any)}>
                <AppText variant="caption" style={styles.navText}>
                  カテゴリ
                </AppText>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={async () => {
                if (isSchoolApiEnabled()) {
                  await apiAdminLogout();
                  router.replace('/admin/login' as any);
                } else {
                  router.push('/admin/login' as any);
                }
              }}
            >
              <AppText variant="caption" style={styles.navText}>
                ログアウト
              </AppText>
            </TouchableOpacity>
            {typeof __DEV__ !== 'undefined' && __DEV__ ? (
              <TouchableOpacity onPress={() => router.push('/dev/web3' as any)}>
                <AppText variant="caption" style={styles.navText}>
                  Web3確認
                </AppText>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
      <View style={styles.content}>{children}</View>
      {onRoleChange ? (
        <View style={styles.dev}>
          <DevRoleSwitcher value={role} onChange={onRoleChange} />
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.colors.background,
  },
  header: {
    paddingHorizontal: adminTheme.spacing.lg,
    paddingTop: adminTheme.spacing.lg,
    paddingBottom: adminTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.background,
  },
  logo: {
    color: adminTheme.colors.text,
  },
  pageTitle: {
    color: adminTheme.colors.textSecondary,
    marginTop: adminTheme.spacing.xs,
  },
  right: {
    marginTop: adminTheme.spacing.sm,
  },
  role: {
    color: adminTheme.colors.textTertiary,
    marginBottom: adminTheme.spacing.xs,
  },
  apiStatus: {
    color: adminTheme.colors.textTertiary,
    marginBottom: adminTheme.spacing.xs,
  },
  apiOn: {
    color: adminTheme.colors.textSecondary,
  },
  apiErr: {
    color: '#e57373',
  },
  nav: {
    flexDirection: 'row',
    gap: adminTheme.spacing.md,
  },
  navText: {
    color: adminTheme.colors.textSecondary,
  },
  content: {
    flex: 1,
    padding: adminTheme.spacing.lg,
  },
  dev: {
    paddingHorizontal: adminTheme.spacing.lg,
    paddingBottom: adminTheme.spacing.lg,
  },
});
