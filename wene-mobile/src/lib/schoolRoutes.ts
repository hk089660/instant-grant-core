/**
 * 学校フロー用ルートパス
 * 画面遷移の一貫性を保つため定数化
 */

export const schoolRoutes = {
  home: '/',
  events: '/u',
  scan: '/u/scan',
  confirm: (eventId: string) => `/u/confirm?eventId=${eventId}`,
  success: (
    eventId: string,
    params?: { tx?: string; receipt?: string; already?: boolean }
  ) => {
    const base = `/u/success?eventId=${encodeURIComponent(eventId)}`;
    const query: string[] = [];
    if (params?.tx) query.push(`tx=${encodeURIComponent(params.tx)}`);
    if (params?.receipt) query.push(`receipt=${encodeURIComponent(params.receipt)}`);
    if (params?.already) query.push('already=1');
    return query.length > 0 ? `${base}&${query.join('&')}` : base;
  },
  schoolClaim: (eventId: string) => `/r/school/${eventId}`,
} as const;
