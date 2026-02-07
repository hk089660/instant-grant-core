import { useEffect } from 'react';
import { useRouter } from 'expo-router';

/**
 * 登録の正規 URL は /register。ここに来た場合は /register へリダイレクトする。
 */
export default function URegisterRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/register' as any);
  }, [router]);
  return null;
}
