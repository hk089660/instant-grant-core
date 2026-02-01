import * as nacl from 'tweetnacl';
import { Linking, Platform, ToastAndroid } from 'react-native';
import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import * as LinkingExpo from 'expo-linking';
import { setPendingSignTx, resolvePendingSignTx, rejectPendingSignTx } from './phantomSignTxPending';
import { openPhantomConnect } from '../wallet/openPhantom';
import { setLastPhantomConnect, setLastPhantomSign } from './phantomUrlDebug';
import { devLog, devWarn, devError } from './devLog';

export interface PhantomConnectParams {
  dappEncryptionPublicKey: string;
  redirectLink: string;
  cluster?: 'devnet' | 'mainnet-beta';
  appUrl: string;
}

export interface PhantomConnectResult {
  publicKey: string;
  session: string;
}

/**
 * Base64エンコード（React Native用）
 */
const base64Encode = (bytes: Uint8Array): string => {
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary);
};

/**
 * Base64デコード（React Native用）
 */
const base64Decode = (str: string): Uint8Array => {
  const binary = atob(str);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

/**
 * Phantom Connect用の暗号化キーペアを生成
 */
export const generateEncryptionKeyPair = (): nacl.BoxKeyPair => {
  return nacl.box.keyPair();
}

/**
 * Phantom Connect URLを生成
 * dapp_encryption_public_keyはBase58エンコードで送信
 */
export const buildPhantomConnectUrl = (params: PhantomConnectParams): string => {
  const { dappEncryptionPublicKey, redirectLink, cluster = 'devnet', appUrl } = params;
  
  // Base64 → Base58変換
  let dappKeyBase58: string;
  try {
    const decoded = base64Decode(dappEncryptionPublicKey);
    dappKeyBase58 = bs58.encode(decoded);
    devLog('[buildPhantomConnectUrl] dapp_encryption_public_key converted to base58, length:', dappKeyBase58.length);
  } catch (e) {
    devWarn('[buildPhantomConnectUrl] Failed to convert to base58, using as-is');
    dappKeyBase58 = dappEncryptionPublicKey;
  }
  
  // redirect_link: ベースのみ。クエリ(errorCode等)はPhantomが付与。searchParams.set が1回だけエンコード
  const redirectRaw = redirectLink;
  const redirectEncoded = encodeURIComponent(redirectRaw);
  try {
    if (redirectRaw.includes('%') && redirectRaw !== decodeURIComponent(redirectRaw)) {
      devWarn('[PHANTOM] connect redirect_link 二重エンコード検知?: rawに%含む', redirectRaw);
    }
  } catch {
    /* ignore */
  }

  const url = new URL('https://phantom.app/ul/v1/connect');
  url.searchParams.set('app_url', appUrl);
  url.searchParams.set('dapp_encryption_public_key', dappKeyBase58);
  url.searchParams.set('redirect_link', redirectRaw);
  url.searchParams.set('cluster', cluster);

  const fullUrl = url.toString();
  devLog('[PHANTOM] connect redirect_link raw:', redirectRaw);
  devLog('[PHANTOM] connect redirect_link encoded(1回):', redirectEncoded);
  devLog('[PHANTOM] connect URL全文(1行):', fullUrl);
  devLog('[PHANTOM] connect cluster=devnet 確認:', fullUrl.includes('cluster=devnet') ? 'OK' : 'NG', fullUrl);
  setLastPhantomConnect(fullUrl, redirectRaw, redirectEncoded);
  return fullUrl;
};

/**
 * Phantom browse deeplink を生成（in-app browser で開く用）
 * 形式: https://phantom.app/ul/browse/<url>?ref=<ref>
 * - url: 開きたいページのフルURL（例: https://example.com/u/scan）
 * - ref: サイトの基点URL（例: https://example.com）
 * どちらもURLエンコードする。Android で「Phantom→ブラウザへ戻れない」問題を避けるため、
 * 生徒用QRの内容をこの deeplink にすると Phantom 内ブラウザで開ける。
 */
export const buildPhantomBrowseUrl = (appBaseUrl: string, path: string): string => {
  const base = appBaseUrl.replace(/\/$/, '');
  const pathNorm = path.startsWith('/') ? path : `/${path}`;
  const fullPageUrl = `${base}${pathNorm}`;
  const browseUrl = `https://phantom.app/ul/browse/${encodeURIComponent(fullPageUrl)}?ref=${encodeURIComponent(base)}`;
  return browseUrl;
};

/**
 * Phantom リダイレクトとして許可する URL かどうか（SECURITY_REVIEW M4: スキーム検証）
 * scheme が wene かつ hostname が phantom の場合のみ true。
 */
export function isAllowedPhantomRedirectUrl(url: string): boolean {
  try {
    const parsed = LinkingExpo.parse(url);
    const scheme = (parsed as { scheme?: string }).scheme ?? '';
    const hostname = (parsed as { hostname?: string }).hostname ?? '';
    return scheme === 'wene' && hostname === 'phantom';
  } catch {
    return false;
  }
}

/**
 * クエリパラメータを安全にURLデコード（Phantom仕様: base58のため + 等がエンコードされている場合あり）
 */
const decodeParam = (v: unknown): string => {
  if (typeof v !== 'string') return '';
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

/**
 * PhantomからのリダイレクトURLを解析
 */
export const parsePhantomRedirect = (url: string): { data: string; nonce: string } | null => {
  try {
    const parsed = LinkingExpo.parse(url);
    const qp = parsed.queryParams ?? {};
    const data = decodeParam(qp.data);
    const nonce = decodeParam(qp.nonce);
    
    if (!data || !nonce) {
      return null;
    }
    
    return { data, nonce };
  } catch {
    return null;
  }
};

/**
 * Phantomからの暗号化データを復号
 */
export const decryptPhantomResponse = (
  encryptedData: string,
  nonce: string,
  dappSecretKey: Uint8Array,
  phantomPublicKey: string
): PhantomConnectResult | null => {
  try {
    // Base58デコード
    const encrypted = bs58.decode(encryptedData);
    const nonceBytes = bs58.decode(nonce);
    const phantomPubkeyBytes = bs58.decode(phantomPublicKey);
    
    // 復号
    const decrypted = nacl.box.open(encrypted, nonceBytes, phantomPubkeyBytes, dappSecretKey);
    
    if (!decrypted) {
      return null;
    }
    
    // JSONパース
    const result = JSON.parse(new TextDecoder().decode(decrypted));
    
    return {
      publicKey: result.public_key || result.publicKey,
      session: result.session,
    };
  } catch (error) {
    devError('Failed to decrypt Phantom response:', error);
    return null;
  }
};

/**
 * Phantom Connectを開始
 */
export const initiatePhantomConnect = async (
  dappEncryptionPublicKey: string,
  dappSecretKey: Uint8Array,
  redirectLink: string = 'wene://phantom/connect',
  cluster: 'devnet' | 'mainnet-beta' = 'devnet',
  appUrl: string = 'https://wene.app'
): Promise<void> => {
  const url = buildPhantomConnectUrl({
    dappEncryptionPublicKey,
    redirectLink,
    cluster,
    appUrl,
  });
  
  await openPhantomConnect(url);
};

const NACL_NONCE_BYTES = 24;

/**
 * Phantom Connectリダイレクト処理
 * Phantom仕様: phantom_encryption_public_key / nonce / data は base58。nonce は decode 後 24 bytes 必須。
 */
export const handlePhantomConnectRedirect = (
  url: string,
  dappSecretKey: Uint8Array
): { ok: true; result: PhantomConnectResult; phantomPublicKey: string } | { ok: false; error: string; stage: string } => {
  try {
    devLog('[handlePhantomConnectRedirect] stage=start, url (trunc):', url.substring(0, 120) + (url.length > 120 ? '...' : ''));
    
    const urlParsed = LinkingExpo.parse(url);
    const qp = urlParsed.queryParams ?? {};
    
    if (qp.errorCode || qp.errorMessage) {
      return { ok: false, error: `${qp.errorCode}: ${qp.errorMessage}`, stage: 'error_response' };
    }
    
    const data = decodeParam(qp.data);
    const nonce = decodeParam(qp.nonce);
    const phantomPublicKey = decodeParam(qp.phantom_encryption_public_key);
    
    if (!data || !nonce || !phantomPublicKey) {
      devWarn('[handlePhantomConnectRedirect] stage=check_params, missing params', {
        dataLen: data?.length ?? 0,
        nonceLen: nonce?.length ?? 0,
        phantomPkLen: phantomPublicKey?.length ?? 0,
      });
      return { ok: false, error: 'Missing required params', stage: 'check_params' };
    }
    
    // 失敗時ログ: 各パラメータの文字列長と base58 decode 後の byte 長
    let nonceBytes: Uint8Array;
    let encrypted: Uint8Array;
    let phantomPubkeyBytes: Uint8Array;
    try {
      nonceBytes = bs58.decode(nonce);
      encrypted = bs58.decode(data);
      phantomPubkeyBytes = bs58.decode(phantomPublicKey);
    } catch (decodeErr) {
      const msg = (decodeErr as Error)?.message ?? String(decodeErr);
      devWarn('[handlePhantomConnectRedirect] stage=decode_fail', {
        phantom_encryption_public_key_strLen: phantomPublicKey.length,
        nonce_strLen: nonce.length,
        data_strLen: data.length,
        error: msg,
      });
      return { ok: false, error: `Base58 decode failed: ${msg}`, stage: 'decode' };
    }
    
    if (nonceBytes.length !== NACL_NONCE_BYTES) {
      devWarn('[handlePhantomConnectRedirect] stage=nonce_length', {
        nonce_strLen: nonce.length,
        nonce_byteLen: nonceBytes.length,
        required: NACL_NONCE_BYTES,
      });
      return { ok: false, error: `Invalid nonce length: ${nonceBytes.length}, expected ${NACL_NONCE_BYTES}`, stage: 'nonce_length' };
    }
    
    // 使用中の dapp 側 keypair の publicKey (base58)。connect 開始時に送った dapp_encryption_public_key と一致している必要あり
    let dappPublicKeyBase58: string;
    try {
      const kp = nacl.box.keyPair.fromSecretKey(dappSecretKey);
      dappPublicKeyBase58 = bs58.encode(kp.publicKey);
    } catch {
      dappPublicKeyBase58 = '(fromSecretKey failed)';
    }
    devLog('[handlePhantomConnectRedirect] stage=decrypt', {
      phantom_encryption_public_key_strLen: phantomPublicKey.length,
      phantom_encryption_public_key_byteLen: phantomPubkeyBytes.length,
      nonce_strLen: nonce.length,
      nonce_byteLen: nonceBytes.length,
      data_strLen: data.length,
      data_byteLen: encrypted.length,
      dapp_publicKey_base58: dappPublicKeyBase58,
      dappSecretKey_byteLen: dappSecretKey.length,
      note: 'connect開始時に送った dapp_encryption_public_key と dapp_publicKey_base58 が一致していること',
    });
    
    const decrypted = nacl.box.open(encrypted, nonceBytes, phantomPubkeyBytes, dappSecretKey);
    
    if (!decrypted) {
      devWarn('[handlePhantomConnectRedirect] stage=decrypt_failed (nacl.box.open returned null)');
      return { ok: false, error: 'Decryption failed', stage: 'decrypt' };
    }
    
    devLog('[handlePhantomConnectRedirect] stage=decrypt_ok, decrypted length:', decrypted.length);
    
    const jsonString = new TextDecoder().decode(decrypted);
    const result = JSON.parse(jsonString);
    
    devLog('[handlePhantomConnectRedirect] stage=json_parse, success, keys:', Object.keys(result));
    
    return {
      ok: true,
      result: {
        publicKey: result.public_key,
        session: result.session,
      },
      phantomPublicKey,
    };
  } catch (e) {
    const errorMsg = (e as Error)?.message ?? String(e);
    devError('[handlePhantomConnectRedirect] exception:', errorMsg);
    return { ok: false, error: errorMsg, stage: 'exception' };
  }
};

// --- signTransaction ---

export interface PhantomSignTransactionParams {
  tx: Transaction;
  session: string;
  dappEncryptionPublicKey: string;
  dappSecretKey: Uint8Array;
  phantomEncryptionPublicKey: string;
  redirectLink?: string;
  cluster?: 'devnet' | 'mainnet-beta';
  appUrl?: string;
}

/**
 * Phantom signTransaction URL を生成
 */
export const buildPhantomSignTransactionUrl = (params: PhantomSignTransactionParams): string => {
  const {
    tx,
    session,
    dappEncryptionPublicKey,
    dappSecretKey,
    phantomEncryptionPublicKey,
    redirectLink = 'wene://phantom/sign',
    cluster = 'devnet',
    appUrl = 'https://wene.app',
  } = params;

  // Base64 → Base58変換
  let dappKeyBase58: string;
  try {
    const decoded = base64Decode(dappEncryptionPublicKey);
    dappKeyBase58 = bs58.encode(decoded);
  } catch {
    dappKeyBase58 = dappEncryptionPublicKey;
  }

  const nonce = nacl.randomBytes(24);
  const phantomPk = bs58.decode(phantomEncryptionPublicKey);

  const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  // Phantom 仕様: payload 内の transaction は base58 エンコード
  const transactionBase58 = bs58.encode(new Uint8Array(serialized));
  const payloadJson = JSON.stringify({ transaction: transactionBase58, session });
  const payloadBytes = new TextEncoder().encode(payloadJson);

  const encrypted = nacl.box(
    payloadBytes,
    nonce,
    phantomPk,
    dappSecretKey
  );

  if (!encrypted) {
    throw new Error('Failed to encrypt signTransaction payload');
  }

  // redirect_link: ベースのみ(wene://phantom/sign)。クエリはPhantomが付与。searchParams.set が1回だけエンコード
  const redirectRaw = redirectLink;
  const redirectEncoded = encodeURIComponent(redirectRaw);
  try {
    if (redirectRaw.includes('%') && redirectRaw !== decodeURIComponent(redirectRaw)) {
      devWarn('[PHANTOM] sign redirect_link 二重エンコード検知?: rawに%含む', redirectRaw);
    }
  } catch {
    /* ignore */
  }

  const url = new URL('https://phantom.app/ul/v1/signTransaction');
  url.searchParams.set('dapp_encryption_public_key', dappKeyBase58);
  url.searchParams.set('nonce', bs58.encode(nonce));
  url.searchParams.set('redirect_link', redirectRaw);
  url.searchParams.set('payload', bs58.encode(encrypted));
  url.searchParams.set('app_url', appUrl);
  url.searchParams.set('cluster', cluster);

  const fullUrl = url.toString();
  devLog('[PHANTOM] sign redirect_link raw:', redirectRaw);
  devLog('[PHANTOM] sign redirect_link encoded(1回):', redirectEncoded);
  devLog('[PHANTOM] sign URL全文(1行):', fullUrl);
  devLog('[PHANTOM] sign cluster=devnet 確認:', fullUrl.includes('cluster=devnet') ? 'OK' : 'NG', fullUrl);
  setLastPhantomSign(fullUrl, redirectRaw, redirectEncoded);
  return fullUrl;
};

/**
 * Phantom signTransaction リダイレクトの復号
 * Phantom 仕様: 復号後の JSON の transaction は base58 エンコード
 */
export const decryptPhantomSignTransactionResponse = (
  encryptedData: string,
  nonce: string,
  dappSecretKey: Uint8Array,
  phantomPublicKey: string
): Transaction | null => {
  try {
    const encrypted = bs58.decode(encryptedData);
    const nonceBytes = bs58.decode(nonce);
    const phantomPk = bs58.decode(phantomPublicKey);

    const decrypted = nacl.box.open(encrypted, nonceBytes, phantomPk, dappSecretKey);
    if (!decrypted) {
      return null;
    }

    const result = JSON.parse(new TextDecoder().decode(decrypted));
    const signedEncoded =
      result.transaction ?? result.signed_transaction ?? result.signedTransaction;
    if (!signedEncoded) {
      return null;
    }

    // Phantom は transaction を base58 で返す（base64 ではない）
    const signedBuf = bs58.decode(signedEncoded);
    return Transaction.from(signedBuf);
  } catch (error) {
    devError('Failed to decrypt signTransaction response:', error);
    return null;
  }
};

/**
 * Phantom signTransaction を開始
 */
export const signTransaction = async (
  params: PhantomSignTransactionParams
): Promise<Transaction> => {
  const url = buildPhantomSignTransactionUrl(params);

  return new Promise<Transaction>((resolve, reject) => {
    setPendingSignTx(resolve, reject);

    devLog('[CLAIM] signTransaction: before openPhantomConnect');
    openPhantomConnect(url)
      .then(() => {
        devLog('[CLAIM] signTransaction: openPhantomConnect done, waiting for Phantom redirect');
      })
      .catch((err) => {
        devError('[CLAIM] signTransaction: openPhantomConnect failed:', err);
        rejectPendingSignTx(err instanceof Error ? err : new Error(String(err)));
      });
  });
};

/**
 * signTransaction リダイレクト処理
 * data / nonce は base58。phantom_encryption_public_key は sign リダイレクトには含まれないため、
 * connect 時に保存した phantomEncryptionPublicKey を fallback として使用する。
 */
export const handleRedirect = (
  url: string,
  dappSecretKey: Uint8Array,
  phantomEncryptionPublicKeyFromSession?: string
): { ok: true; tx: Transaction } | { ok: false; error: string } => {
  const urlParsed = LinkingExpo.parse(url);
  const qp = urlParsed.queryParams ?? {};

  const errorCode = decodeParam(qp.errorCode ?? qp.error_code);
  if (errorCode) {
    const msg = errorCode === '4001' ? '署名がキャンセルされました' : `Phantom error: ${errorCode}`;
    rejectPendingSignTx(new Error(msg));
    return { ok: false, error: msg };
  }

  const data = decodeParam(qp.data);
  const nonce = decodeParam(qp.nonce);
  const phantomPublicKey =
    decodeParam(qp.phantom_encryption_public_key) || phantomEncryptionPublicKeyFromSession;

  if (!data || !nonce) {
    rejectPendingSignTx(new Error('Invalid redirect URL'));
    return { ok: false, error: 'Invalid redirect URL' };
  }

  if (!phantomPublicKey) {
    rejectPendingSignTx(new Error('Phantom public key not found'));
    return { ok: false, error: 'Phantom public key not found' };
  }

  let nonceBytes: Uint8Array;
  try {
    nonceBytes = bs58.decode(nonce);
  } catch {
    rejectPendingSignTx(new Error('Invalid nonce (base58 decode failed)'));
    return { ok: false, error: 'Invalid nonce' };
  }
  if (nonceBytes.length !== NACL_NONCE_BYTES) {
    devWarn('[handleRedirect] signTransaction nonce length:', nonceBytes.length, 'expected:', NACL_NONCE_BYTES);
    rejectPendingSignTx(new Error(`Invalid nonce length: ${nonceBytes.length}`));
    return { ok: false, error: `Invalid nonce length: ${nonceBytes.length}` };
  }

  const tx = decryptPhantomSignTransactionResponse(
    data,
    nonce,
    dappSecretKey,
    phantomPublicKey
  );

  if (!tx) {
    rejectPendingSignTx(new Error('Failed to decrypt signed transaction'));
    return { ok: false, error: 'Failed to decrypt signed transaction' };
  }

  resolvePendingSignTx(tx);
  return { ok: true, tx };
};
