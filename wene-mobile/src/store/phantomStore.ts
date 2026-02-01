import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as nacl from 'tweetnacl';
import { devLog, devError } from '../utils/devLog';

// Base64エンコード（React Native用）
const base64Encode = (bytes: Uint8Array): string => {
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary);
};

interface PhantomConnectResult {
  publicKey: string;
  session: string;
  phantomPublicKey: string;
}

interface PhantomStore {
  // 暗号化キーペア
  encryptionKeyPair: nacl.BoxKeyPair | null;
  dappEncryptionPublicKey: string | null;
  dappSecretKey: Uint8Array | null;
  phantomEncryptionPublicKey: string | null;

  // アクション
  initializeKeyPair: () => nacl.BoxKeyPair;
  getOrCreateKeyPair: () => nacl.BoxKeyPair;
  saveKeyPair: (keyPair: nacl.BoxKeyPair) => Promise<void>;
  loadKeyPair: () => Promise<nacl.BoxKeyPair | null>;
  setPhantomEncryptionPublicKey: (pk: string | null) => void;
  savePhantomConnectResult: (publicKey: string, session: string, phantomPublicKey: string) => Promise<void>;
  loadPhantomConnectResult: () => Promise<PhantomConnectResult | null>;
  /** 接続開始前に古い session を破棄（decryption 不整合を防ぐ） */
  clearConnectResult: () => Promise<void>;
  /** v0用: 暗号キーペアと接続結果をすべて破棄（デバッグ・再接続用） */
  clearPhantomKeys: () => Promise<void>;
}

const STORAGE_KEY = 'phantom_encryption_keypair';
const STORAGE_KEY_CONNECT_RESULT = 'phantom_connect_result';

export const usePhantomStore = create<PhantomStore>((set, get) => ({
  encryptionKeyPair: null,
  dappEncryptionPublicKey: null,
  dappSecretKey: null,
  phantomEncryptionPublicKey: null,
  
  initializeKeyPair: () => {
    const keyPair = nacl.box.keyPair();
    set({
      encryptionKeyPair: keyPair,
      dappEncryptionPublicKey: base64Encode(keyPair.publicKey),
      dappSecretKey: keyPair.secretKey,
    });
    return keyPair;
  },
  
  getOrCreateKeyPair: () => {
    const { encryptionKeyPair } = get();
    if (encryptionKeyPair) {
      return encryptionKeyPair;
    }
    return get().initializeKeyPair();
  },
  
  saveKeyPair: async (keyPair) => {
    const data = {
      publicKey: Array.from(keyPair.publicKey),
      secretKey: Array.from(keyPair.secretKey),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    set({
      encryptionKeyPair: keyPair,
      dappEncryptionPublicKey: base64Encode(keyPair.publicKey),
      dappSecretKey: keyPair.secretKey,
    });
  },
  
  loadKeyPair: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return null;
      }
      const data = JSON.parse(stored);
      const keyPair: nacl.BoxKeyPair = {
        publicKey: Uint8Array.from(data.publicKey),
        secretKey: Uint8Array.from(data.secretKey),
      };
      set({
        encryptionKeyPair: keyPair,
        dappEncryptionPublicKey: base64Encode(keyPair.publicKey),
        dappSecretKey: keyPair.secretKey,
      });
      return keyPair;
    } catch {
      return null;
    }
  },

  setPhantomEncryptionPublicKey: (pk) => set({ phantomEncryptionPublicKey: pk }),

  savePhantomConnectResult: async (publicKey, session, phantomPublicKey) => {
    const data: PhantomConnectResult = {
      publicKey,
      session,
      phantomPublicKey,
    };
    await AsyncStorage.setItem(STORAGE_KEY_CONNECT_RESULT, JSON.stringify(data));
    devLog('[phantomStore] savePhantomConnectResult success:', publicKey.substring(0, 8) + '...');
  },

  loadPhantomConnectResult: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_CONNECT_RESULT);
      if (!stored) {
        return null;
      }
      const data = JSON.parse(stored);
      return {
        publicKey: data.publicKey,
        session: data.session,
        phantomPublicKey: data.phantomPublicKey,
      } as PhantomConnectResult;
    } catch (e) {
      devError('[phantomStore] loadPhantomConnectResult error:', e);
      return null;
    }
  },

  clearConnectResult: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY_CONNECT_RESULT);
    set({ phantomEncryptionPublicKey: null });
    devLog('[phantomStore] clearConnectResult done');
  },

  clearPhantomKeys: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(STORAGE_KEY_CONNECT_RESULT);
    set({
      encryptionKeyPair: null,
      dappEncryptionPublicKey: null,
      dappSecretKey: null,
      phantomEncryptionPublicKey: null,
    });
    devLog('[phantomStore] clearPhantomKeys done');
  },
}));
