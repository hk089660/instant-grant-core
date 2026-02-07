/**
 * 管理者ロールを取得・更新するフック
 * API 有効時: /me でセッション取得。未ログインなら role は null。
 * API 無効時: ストレージから永続化ロールを読み込み（従来の mock）。
 */

import { useState, useEffect, useCallback } from 'react';
import type { Role } from '../types/ui';
import { isSchoolApiEnabled } from '../config/api';
import { apiAdminMe } from '../api/adminApiClient';
import { loadAdminRole, getMockAdminRole, setMockAdminRole } from '../data/adminMock';

export interface UseAdminRoleResult {
  role: Role | null;
  setRole: (r: Role) => void;
  loading: boolean;
}

export function useAdminRole(): UseAdminRoleResult {
  const [role, setRoleState] = useState<Role | null>(isSchoolApiEnabled() ? null : getMockAdminRole());
  const [loading, setLoading] = useState(isSchoolApiEnabled());

  useEffect(() => {
    if (isSchoolApiEnabled()) {
      setLoading(true);
      apiAdminMe()
        .then((res) => {
          setRoleState(res.ok && res.role ? res.role : null);
        })
        .catch(() => {
          setRoleState(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      loadAdminRole().then((r) => setRoleState(r));
    }
  }, []);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    setMockAdminRole(r);
  }, []);

  return { role, setRole, loading };
}
