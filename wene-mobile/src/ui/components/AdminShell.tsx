import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from './AppText';
import { adminTheme } from '../adminTheme';

interface AdminShellProps {
  title: string;
  role?: string;
  children: React.ReactNode;
}

export const AdminShell: React.FC<AdminShellProps> = ({ title, children }) => {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AppText variant="h3" style={styles.logo}>
          we-ne Admin
        </AppText>
        <AppText variant="caption" style={styles.pageTitle}>
          {title}
        </AppText>
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
            <TouchableOpacity onPress={() => router.push('/admin/login' as any)}>
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
  logo: {
    color: adminTheme.colors.text,
    fontWeight: '800',
  },
  pageTitle: {
    color: adminTheme.colors.textSecondary,
    marginTop: 2,
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
