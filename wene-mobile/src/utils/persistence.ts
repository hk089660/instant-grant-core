import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ClaimedRecord {
  status: 'claimed';
  claimedAt: number; // unix timestamp (seconds)
  campaignId: string;
  walletPubkey?: string;
}

function normalizeUserScope(userId?: string | null): string {
  const normalized = typeof userId === 'string' ? userId.trim().toLowerCase() : '';
  return normalized || 'guest';
}

/**
 * 受給状態の保存キーを生成
 */
export const getClaimedKey = (
  campaignId: string,
  walletPubkey?: string | null,
  userId?: string | null
): string => {
  return `claimed:${normalizeUserScope(userId)}:${campaignId}:${walletPubkey || 'anonymous'}`;
};

/**
 * 受給状態を保存
 */
export const saveClaimed = async (
  campaignId: string,
  walletPubkey?: string | null,
  userId?: string | null
): Promise<void> => {
  const key = getClaimedKey(campaignId, walletPubkey, userId);
  const record: ClaimedRecord = {
    status: 'claimed',
    claimedAt: Math.floor(Date.now() / 1000),
    campaignId,
    walletPubkey: walletPubkey || undefined,
  };
  await AsyncStorage.setItem(key, JSON.stringify(record));
};

/**
 * 受給状態を読み込み
 */
export const loadClaimed = async (
  campaignId: string,
  walletPubkey?: string | null,
  userId?: string | null
): Promise<ClaimedRecord | null> => {
  const key = getClaimedKey(campaignId, walletPubkey, userId);
  const value = await AsyncStorage.getItem(key);
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as ClaimedRecord;
  } catch {
    return null;
  }
};

/**
 * 匿名キーからウォレットキーへの移行
 * 既に匿名で保存されている場合、ウォレットキーでも保存する
 */
export const migrateToWalletKey = async (
  campaignId: string,
  walletPubkey: string,
  userId?: string | null
): Promise<void> => {
  const anonymousKey = getClaimedKey(campaignId, null, userId);
  const anonymousValue = await AsyncStorage.getItem(anonymousKey);
  
  if (anonymousValue) {
    // 匿名キーのデータをウォレットキーにも保存
    const record: ClaimedRecord = JSON.parse(anonymousValue);
    record.walletPubkey = walletPubkey;
    const walletKey = getClaimedKey(campaignId, walletPubkey, userId);
    await AsyncStorage.setItem(walletKey, JSON.stringify(record));
  }
};

// ===== 使用済み永続化 =====

export interface UsedRecord {
  status: 'used';
  usedAt: number; // unix timestamp (seconds)
  campaignId: string;
  walletPubkey?: string;
  txSig: string; // 使用トランザクションの署名
  amount?: number; // 使用量（オプション）
}

/**
 * 使用済み状態の保存キーを生成
 */
export const getUsedKey = (
  campaignId: string,
  walletPubkey?: string | null,
  userId?: string | null
): string => {
  return `used:${normalizeUserScope(userId)}:${campaignId}:${walletPubkey || 'anonymous'}`;
};

/**
 * 使用済み状態を保存
 */
export const saveUsed = async (
  campaignId: string,
  walletPubkey: string | null,
  txSig: string,
  amount?: number,
  userId?: string | null
): Promise<void> => {
  const key = getUsedKey(campaignId, walletPubkey, userId);
  const record: UsedRecord = {
    status: 'used',
    usedAt: Math.floor(Date.now() / 1000),
    campaignId,
    walletPubkey: walletPubkey || undefined,
    txSig,
    amount,
  };
  await AsyncStorage.setItem(key, JSON.stringify(record));
};

/**
 * 使用済み状態を読み込み
 */
export const loadUsed = async (
  campaignId: string,
  walletPubkey?: string | null,
  userId?: string | null
): Promise<UsedRecord | null> => {
  const key = getUsedKey(campaignId, walletPubkey, userId);
  const value = await AsyncStorage.getItem(key);
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as UsedRecord;
  } catch {
    return null;
  }
};

export const clearUserClaimUsageCache = async (userId?: string | null): Promise<void> => {
  const userScope = normalizeUserScope(userId);
  const claimedPrefix = `claimed:${userScope}:`;
  const usedPrefix = `used:${userScope}:`;
  const keys = await AsyncStorage.getAllKeys();
  const targetKeys = keys.filter(
    (key) => key.startsWith(claimedPrefix) || key.startsWith(usedPrefix)
  );
  if (targetKeys.length === 0) return;
  await AsyncStorage.multiRemove(targetKeys);
};
