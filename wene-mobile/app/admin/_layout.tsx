import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAdminRole } from '../../src/hooks/useAdminRole';
import { isSchoolApiEnabled } from '../../src/config/api';
import { setOnUnauthorized } from '../../src/api/adminApiClient';

/**
 * 管理者エリアのゲート。
 * - loading = /me 取得中（in-flight）。role === null とは区別する。
 * - /admin/login のときはリダイレクトせず必ずログイン画面を表示。
 * - /admin/* (login 以外) で API 有効かつ未ログインなら /admin/login へリダイレクト。
 * - onUnauthorized はマウント時に1回だけ登録（ループ防止）。
 */
function AdminGate() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const segments = useSegments();
  const { role, loading } = useAdminRole();

  const isLoginScreen = segments[segments.length - 1] === 'login';
  const pathname = segments.join('/');

  // 401 時リダイレクト: 1回だけ登録し、ref で最新の router を参照
  useEffect(() => {
    setOnUnauthorized(() => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[AdminGate] onUnauthorized -> redirect to /admin/login');
      }
      routerRef.current.replace('/admin/login' as any);
    });
    return () => setOnUnauthorized(null);
  }, []);

  // API 有効かつ未ログイン時は login 以外なら /admin/login へ（loading 中はリダイレクトしない）
  useEffect(() => {
    if (loading || isLoginScreen) return;
    if (!isSchoolApiEnabled() || role !== null) return;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[AdminGate] redirect to /admin/login (role=null, path=', pathname, ')');
    }
    router.replace('/admin/login' as any);
  }, [loading, role, isLoginScreen, pathname, router]);

  // /admin/login のときは常に Stack を表示（ログイン画面をブロックしない）
  if (isLoginScreen) {
    return (
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'default',
        }}
      />
    );
  }

  // login 以外で /me 取得中はローディング表示
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator color="#fff" size="large" />
        <Text style={{ color: '#999', marginTop: 8 }}>読み込み中…</Text>
      </View>
    );
  }

  // API 有効かつ role === null のときは上記 useEffect がリダイレクトするまで一瞬 Stack が出る可能性あり（許容）
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'default',
      }}
    />
  );
}

export default function AdminLayout() {
  return <AdminGate />;
}
