/**
 * 学校フロー用ルートパス
 * 画面遷移の一貫性を保つため定数化
 */

export const schoolRoutes = {
  home: '/',
  events: '/u',
  register: '/register',
  join: (eventId: string, token?: string) =>
    token ? `/u/join?eventId=${encodeURIComponent(eventId)}&token=${encodeURIComponent(token)}` : `/u/join?eventId=${encodeURIComponent(eventId)}`,
  scan: '/u/scan',
  confirm: (eventId: string) => `/u/confirm?eventId=${eventId}`,
  success: (eventId: string) => `/u/success?eventId=${eventId}`,
  certificates: '/u/certificates',
  schoolClaim: (eventId: string) => `/r/school/${eventId}`,
} as const;
