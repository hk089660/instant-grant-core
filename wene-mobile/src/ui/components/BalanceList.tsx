import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { AppText } from './AppText';
import { theme } from '../theme';
import type { BalanceItem } from '../../types/balance';
import { computeTodayUsable, isExpiringSoon } from '../../utils/balance';

// --- changed ---
export const BALANCE_LIST_DUMMY: BalanceItem[] = [
  {
    id: "credit-1",
    name: "デモ支援クレジット",
    issuer: "We-ne",
    amountText: "1,250",
    unit: "円",
    expiresAt: "2026/02/15",
    source: "credit",
    todayUsable: true,
  },
  {
    id: "credit-2",
    name: "ボランティア参加券",
    issuer: "北区コミュニティ",
    amountText: "3",
    unit: "枚",
    expiresAt: "2026/03/01",
    source: "credit",
    todayUsable: true,
  },
  {
    id: "credit-3",
    name: "加盟店クーポン",
    issuer: "○○商店街",
    amountText: "500",
    unit: "円",
    source: "credit",
    todayUsable: true,
  },
];

export type { BalanceItem };

export interface BalanceListProps {
  /** ウォレット接続済みなら true（接続前はグレーアウト + 文言表示） */
  connected: boolean;
  /** 残高データ（ソート済みを渡す想定。未指定時はダミーデータ） */
  items?: BalanceItem[];
  /** 行タップ時のコールバック（詳細画面遷移用） */
  onItemPress?: (item: BalanceItem) => void;
  style?: ViewStyle;
}

export const BalanceList: React.FC<BalanceListProps> = ({
  connected,
  items = BALANCE_LIST_DUMMY,
  onItemPress,
  style,
}) => {
  return (
    <View style={[styles.section, style]}>
      <AppText variant="caption" style={styles.sectionLabel}>
        残高
      </AppText>
      <View style={[styles.listWrap, !connected && styles.listWrapDisabled]}>
        {!connected ? (
          <View style={styles.overlay}>
            <AppText variant="body" style={styles.overlayText}>
              ウォレット接続後に表示されます
            </AppText>
          </View>
        ) : null}
        {connected && items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <AppText variant="body" style={styles.emptyText}>
              参加券はありません
            </AppText>
          </View>
        ) : null}
        <View style={styles.listContent}>
          {items.map((item, index) => {
            const todayUsable = item.todayUsable ?? computeTodayUsable(item.expiresAt);
            const expiringSoon = isExpiringSoon(item.expiresAt) || item.status === 'expiring';
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                onPress={() => onItemPress?.(item)}
                style={[styles.row, index === items.length - 1 && styles.rowLast]}
                disabled={!connected}
              >
                <View style={styles.rowLeft}>
                  <View style={styles.icon} />
                  <View style={styles.rowText}>
                    <AppText variant="body" style={styles.name} numberOfLines={1}>
                      {item.name}
                    </AppText>
                    <AppText variant="caption" style={styles.issuer} numberOfLines={1}>
                      {item.issuer}
                    </AppText>
                    {item.expiresAt ? (
                      <AppText variant="small" style={styles.expires}>
                        期限: {item.expiresAt}
                      </AppText>
                    ) : null}
                    <View style={styles.badgeRow}>
                      {expiringSoon ? (
                        <View style={styles.badgeExpiring}>
                          <Text style={styles.badgeText}>期限間近</Text>
                        </View>
                      ) : null}
                      {todayUsable ? (
                        <View style={styles.badgeToday}>
                          <Text style={styles.badgeText}>今日使える</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
                <View style={styles.rowRight}>
                  <AppText variant="body" style={styles.amount}>
                    {item.amountText} {item.unit}
                  </AppText>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  sectionLabel: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  listWrap: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  listWrapDisabled: {
    backgroundColor: theme.colors.gray100,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  overlayText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  emptyWrap: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  listContent: {
    paddingVertical: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.gray200,
    marginRight: theme.spacing.md,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    marginBottom: theme.spacing.xs,
  },
  issuer: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  expires: {
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.xs,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: theme.spacing.xs,
  },
  badgeExpiring: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255, 0, 0, 0.12)",
  },
  badgeToday: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(0, 0, 0, 0.08)",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    opacity: 0.8,
  },
  rowRight: {
    marginLeft: theme.spacing.sm,
    alignItems: 'flex-end',
  },
  amount: {
    fontWeight: '600',
  },
});
