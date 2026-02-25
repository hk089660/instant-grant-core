/**
 * 利用者識別（userId）の軽量 Auth Context
 * /u/* の Auth Gate と confirm での userId 取得に使用
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  getUserId,
  getDisplayName,
  setUserId as persistUserId,
  setDisplayName as persistDisplayName,
  clearDisplayName as persistClearDisplayName,
  clearUser as persistClearUser,
} from '../lib/userStorage';
import { JOIN_TOKEN_STORAGE_KEY } from '../lib/joinToken';
import { clearPhantomWebSignResult } from '../utils/phantomWebSignBridge';
import { useRecipientStore } from '../store/recipientStore';
import { useRecipientTicketStore } from '../store/recipientTicketStore';
import { usePhantomStore } from '../store/phantomStore';
import { clearUserClaimUsageCache } from '../utils/persistence';
import { clearParticipations } from '../data/participationStore';

export interface AuthState {
  userId: string | null;
  displayName: string | null;
  isReady: boolean;
}

export interface AuthContextValue extends AuthState {
  setUserId: (userId?: string | null) => Promise<void>;
  setDisplayName: (displayName?: string | null) => void;
  clearUser: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeUserId(userId?: string | null): string | null {
  const normalized = typeof userId === 'string' ? userId.trim().toLowerCase() : '';
  return normalized || null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    userId: null,
    displayName: null,
    isReady: false,
  });
  const scopeSeqRef = useRef(0);

  const applyRuntimeScope = useCallback(async (userId?: string | null) => {
    const normalized = normalizeUserId(userId);
    const currentSeq = ++scopeSeqRef.current;
    const recipientStore = useRecipientStore.getState();
    const ticketStore = useRecipientTicketStore.getState();
    const phantomStore = usePhantomStore.getState();

    recipientStore.reset();
    recipientStore.setActiveUserId(normalized);
    phantomStore.setActiveUser(normalized);
    await ticketStore.setActiveUser(normalized);
    if (scopeSeqRef.current !== currentSeq) return;

    if (!normalized) {
      return;
    }

    await phantomStore.loadKeyPair();
    if (scopeSeqRef.current !== currentSeq) return;
    const saved = await phantomStore.loadPhantomConnectResult();
    if (scopeSeqRef.current !== currentSeq || !saved) return;

    phantomStore.setPhantomEncryptionPublicKey(saved.phantomPublicKey);
    await recipientStore.setWalletPubkey(saved.publicKey);
    recipientStore.setPhantomSession(saved.session);
    recipientStore.setState('Connected');
  }, []);

  const resetSessionArtifactsOnLogout = useCallback(async (userId?: string | null) => {
    const normalized = normalizeUserId(userId);
    const ticketStore = useRecipientTicketStore.getState();
    const phantomStore = usePhantomStore.getState();
    const targetScopes: Array<string | null> = normalized ? [normalized, null] : [null];

    for (const scope of targetScopes) {
      await ticketStore.clearUserTickets(scope);
      await clearUserClaimUsageCache(scope);
      await clearParticipations(scope);
      phantomStore.setActiveUser(scope);
      await phantomStore.clearPhantomKeys();
    }

    clearPhantomWebSignResult();
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(JOIN_TOKEN_STORAGE_KEY);
        window.sessionStorage.removeItem('phantom_web_return_path');
      } catch {
        // no-op
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    const persistedUserId = normalizeUserId(getUserId());
    setState({
      userId: persistedUserId,
      displayName: getDisplayName(),
      isReady: true,
    });
    await applyRuntimeScope(persistedUserId);
  }, [applyRuntimeScope]);

  useEffect(() => {
    refresh().catch(() => {
      setState((prev) => ({ ...prev, isReady: true }));
    });
  }, [refresh]);

  const clearUser = useCallback(async () => {
    const currentUserId = normalizeUserId(state.userId);
    try {
      await resetSessionArtifactsOnLogout(currentUserId);
    } catch (e) {
      console.warn('[AuthContext] resetSessionArtifactsOnLogout failed:', e);
    }
    persistClearUser();
    try {
      await applyRuntimeScope(null);
    } catch (e) {
      console.warn('[AuthContext] applyRuntimeScope(null) failed:', e);
    }
    setState({ userId: null, displayName: null, isReady: true });
  }, [state.userId, resetSessionArtifactsOnLogout, applyRuntimeScope]);

  const setUserId = useCallback(async (userId?: string | null) => {
    const normalized = normalizeUserId(userId);

    if (!normalized) {
      await clearUser();
      return;
    }

    persistUserId(normalized);
    await applyRuntimeScope(normalized);

    setState((prev) => ({
      ...prev,
      userId: normalized,
      isReady: true,
    }));
  }, [clearUser, applyRuntimeScope]);

  const setDisplayName = useCallback((displayName?: string | null) => {
    const normalized = typeof displayName === 'string' ? displayName.trim() : '';

    if (!normalized) {
      persistClearDisplayName();
      setState((prev) => ({ ...prev, displayName: null }));
      return;
    }

    persistDisplayName(normalized);
    setState((prev) => ({ ...prev, displayName: normalized }));
  }, []);

  const value: AuthContextValue = {
    ...state,
    setUserId,
    setDisplayName,
    clearUser,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
