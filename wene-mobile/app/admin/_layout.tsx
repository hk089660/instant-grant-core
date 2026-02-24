import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { View } from 'react-native';
import { adminTheme } from '../../src/ui/adminTheme';
import { loadAdminSession } from '../../src/lib/adminAuth';
import { applyAdminSessionRuntimeScope, resolveAdminRuntimeScope } from '../../src/lib/adminRuntimeScope';
import { Loading } from '../../src/ui/components';
import { useAuth } from '../../src/contexts/AuthContext';

export default function AdminLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { refresh } = useAuth();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const appliedScopeRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const session = await loadAdminSession();
        if (session?.token) {
          const nextScope = resolveAdminRuntimeScope(session);
          if (nextScope !== appliedScopeRef.current) {
            await applyAdminSessionRuntimeScope(session);
            appliedScopeRef.current = nextScope;
          }
        } else {
          appliedScopeRef.current = null;
          await refresh();
        }
        if (!cancelled) {
          setIsAuthorized(Boolean(session?.token));
        }
      } catch {
        if (!cancelled) {
          setIsAuthorized(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [segments, refresh]);

  useEffect(() => {
    if (isAuthorized === null) return;

    const inLogin = segments[segments.length - 1] === 'login';
    if (!isAuthorized && !inLogin) {
      router.replace('/admin/login');
      return;
    }
    if (isAuthorized && inLogin) {
      router.replace('/admin');
    }
  }, [isAuthorized, segments, router]);

  if (isAuthorized === null) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: adminTheme.colors.background,
        }}
      >
        <Loading message="管理画面を読み込み中です..." size="large" mode="admin" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
