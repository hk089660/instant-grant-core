import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from './AppText';
import { adminTheme } from '../adminTheme';
import { fetchAdminReportObligations, loginAdmin, type AdminReportObligationItem } from '../../api/adminApi';
import { clearAdminSession, loadAdminSession, saveAdminSession } from '../../lib/adminAuth';
import { clearAdminRuntimeArtifacts } from '../../lib/adminRuntimeScope';
import { useAuth } from '../../contexts/AuthContext';

interface AdminShellProps {
  title: string;
  role?: string;
  children: React.ReactNode;
}

export const AdminShell: React.FC<AdminShellProps> = ({ title, children }) => {
  const router = useRouter();
  const { refresh } = useAuth();
  const [adminName, setAdminName] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [canViewOperatorReports, setCanViewOperatorReports] = useState(false);
  const [reportObligations, setReportObligations] = useState<AdminReportObligationItem[]>([]);
  const [reportCheckedAt, setReportCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAdminSession()
      .then(async (session) => {
        if (!session || cancelled) return;
        setCanViewOperatorReports(session.role === 'master');
        const deriveFallbackOperatorId = (seed: string): string => {
          let hash = 2166136261;
          for (let i = 0; i < seed.length; i += 1) {
            hash ^= seed.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
          }
          return (hash >>> 0).toString(16).padStart(8, '0');
        };
        const scopedOperatorId =
          (typeof session.adminId === 'string' && session.adminId.trim())
            ? session.adminId.trim()
            : `operator-${deriveFallbackOperatorId(`${session.role}:${session.token}`)}`;
        setOperatorId(scopedOperatorId);
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
          setOperatorId('');
          setCanViewOperatorReports(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canViewOperatorReports) {
      setReportObligations([]);
      setReportCheckedAt(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const loadReportObligations = async () => {
      try {
        const data = await fetchAdminReportObligations({ status: 'required', limit: 5 });
        if (cancelled) return;
        setReportObligations(data.items ?? []);
        setReportCheckedAt(data.checkedAt ?? new Date().toISOString());
      } catch {
        if (!cancelled) {
          setReportObligations([]);
        }
      }
    };

    void loadReportObligations();
    timer = setInterval(() => {
      void loadReportObligations();
    }, 30_000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [canViewOperatorReports]);

  const shortenActorId = (actorId: string): string => {
    if (actorId.length <= 22) return actorId;
    return `${actorId.slice(0, 10)}...${actorId.slice(-8)}`;
  };

  const handleLogout = async () => {
    const currentSession = await loadAdminSession();
    await clearAdminSession();
    await clearAdminRuntimeArtifacts(currentSession);
    await refresh();
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
            {operatorId ? (
              <AppText variant="caption" style={styles.adminName}>
                運営者ID: {operatorId}
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
      {canViewOperatorReports && reportObligations.length > 0 ? (
        <View style={styles.reportBanner}>
          <AppText variant="small" style={styles.reportBannerTitle}>
            報告義務ログ: 未対応 {reportObligations.length} 件
          </AppText>
          {reportObligations.slice(0, 3).map((item) => (
            <AppText key={item.reportId} variant="small" style={styles.reportBannerText}>
              [{item.type}] target={shortenActorId(item.targetActorId)} reason={item.reason}
            </AppText>
          ))}
          <AppText variant="small" style={styles.reportBannerMeta}>
            checkedAt: {reportCheckedAt ?? '-'}
          </AppText>
        </View>
      ) : null}
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
  reportBanner: {
    marginTop: adminTheme.spacing.xs,
    marginHorizontal: adminTheme.spacing.md,
    marginBottom: adminTheme.spacing.sm,
    borderWidth: 1,
    borderColor: '#FF4D4F',
    backgroundColor: 'rgba(255, 77, 79, 0.12)',
    borderRadius: adminTheme.radius.sm,
    padding: adminTheme.spacing.sm,
  },
  reportBannerTitle: {
    color: '#FF6B6B',
    fontWeight: '700',
  },
  reportBannerText: {
    color: '#FFD5D5',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  reportBannerMeta: {
    color: '#FFCFCF',
    marginTop: adminTheme.spacing.xs,
    fontSize: 11,
  },
});
