import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { adminTheme } from '../../src/ui/adminTheme';
import { loadAdminSession } from '../../src/lib/adminAuth';

export default function AdminLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const session = await loadAdminSession();
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
  }, [segments]);

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
        <ActivityIndicator size="large" color={adminTheme.colors.text} />
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

