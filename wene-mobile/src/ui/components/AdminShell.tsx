import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from './AppText';
import { adminTheme } from '../adminTheme';
import { loginAdmin } from '../../api/adminApi';
import { clearAdminSession, loadAdminSession, saveAdminSession } from '../../lib/adminAuth';

interface AdminShellProps {
  title: string;
  role?: string;
  children: React.ReactNode;
}

export const AdminShell: React.FC<AdminShellProps> = ({ title, children }) => {
  const router = useRouter();
  const [adminName, setAdminName] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadAdminSession()
      .then(async (session) => {
        if (!session || cancelled) return;
        if (session.adminName) {
          setAdminName(session.adminName);
          return;
        }
        const refreshed = await loginAdmin(session.token);
        const resolvedNameRaw = typeof refreshed.info?.name === 'string' ? refreshed.info.name.trim() : '';
        const resolvedName = resolvedNameRaw || (session.role === 'master' ? 'Master Operator' : '');
        if (!resolvedName || cancelled) return;
        setAdminName(resolvedName);
        await saveAdminSession({
          ...session,
          adminName: resolvedName,
          adminId:
            typeof refreshed.info?.adminId === 'string' && refreshed.info.adminId.trim()
              ? refreshed.info.adminId.trim()
              : session.adminId,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAdminName('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    await clearAdminSession();
    router.replace('/admin/login' as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleBlock}>
            <AppText variant="h3" style={styles.logo}>
              we-ne Admin
            </AppText>
            <AppText variant="caption" style={styles.pageTitle}>
              {title}
            </AppText>
          </View>
          <View style={styles.headerRightTop}>
            {adminName ? (
              <AppText variant="caption" style={styles.adminName}>
                管理者: {adminName}
              </AppText>
            ) : null}
          </View>
        </View>
        <View style={styles.right}>
          <View style={styles.nav}>
            <TouchableOpacity onPress={() => router.push('/admin' as any)}>
              <AppText variant="caption" style={styles.navText}>
                Events
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/admin/create' as any)}>
              <AppText variant="caption" style={styles.navText}>
                ＋発行
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/admin/participants' as any)}>
              <AppText variant="caption" style={styles.navText}>
                Participants
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/admin/categories' as any)}>
              <AppText variant="caption" style={styles.navText}>
                Categories
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout}>
              <AppText variant="caption" style={styles.navText}>
                Logout
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.colors.background,
  },
  header: {
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: adminTheme.spacing.sm,
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerRightTop: {
    maxWidth: '45%',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  logo: {
    color: adminTheme.colors.text,
    fontWeight: '800',
  },
  pageTitle: {
    color: adminTheme.colors.textSecondary,
    marginTop: 2,
  },
  adminName: {
    color: adminTheme.colors.textSecondary,
    textAlign: 'right',
  },
  right: {
    marginTop: adminTheme.spacing.xs,
  },
  nav: {
    flexDirection: 'row',
    gap: adminTheme.spacing.md,
    flexWrap: 'wrap',
  },
  navText: {
    color: adminTheme.colors.textSecondary,
  },
  content: {
    flex: 1,
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: adminTheme.spacing.md,
  },
});
