/**
 * 学校フロー用ルートパス
 * 画面遷移の一貫性を保つため定数化
 */

export const schoolRoutes = {
  home: '/',
  events: '/u',
  scan: '/u/scan',
  register: '/u/register',
  login: '/u/login',
  confirm: (eventId: string) => `/u/confirm?eventId=${eventId}`,
  success: (
    eventId: string,
    params?: {
      tx?: string;
      receipt?: string;
      already?: boolean;
      /** userId+pin フロー: created | already */
      status?: 'created' | 'already';
      confirmationCode?: string;
      mint?: string;
      reflected?: boolean;
      onchainBlocked?: boolean;
      popEntryHash?: string;
      popAuditHash?: string;
      popSigner?: string;
      auditReceiptId?: string;
      auditReceiptHash?: string;
    }
  ) => {
    const base = `/u/success?eventId=${encodeURIComponent(eventId)}`;
    const query: string[] = [];
    if (params?.tx) query.push(`tx=${encodeURIComponent(params.tx)}`);
    if (params?.receipt) query.push(`receipt=${encodeURIComponent(params.receipt)}`);
    if (params?.already) query.push('already=1');
    if (params?.status) query.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.confirmationCode)
      query.push(`confirmationCode=${encodeURIComponent(params.confirmationCode)}`);
    if (params?.mint) query.push(`mint=${encodeURIComponent(params.mint)}`);
    if (params?.reflected) query.push('reflected=1');
    if (params?.onchainBlocked) query.push('onchainBlocked=1');
    if (params?.popEntryHash) query.push(`popEntryHash=${encodeURIComponent(params.popEntryHash)}`);
    if (params?.popAuditHash) query.push(`popAuditHash=${encodeURIComponent(params.popAuditHash)}`);
    if (params?.popSigner) query.push(`popSigner=${encodeURIComponent(params.popSigner)}`);
    if (params?.auditReceiptId) query.push(`auditReceiptId=${encodeURIComponent(params.auditReceiptId)}`);
    if (params?.auditReceiptHash) query.push(`auditReceiptHash=${encodeURIComponent(params.auditReceiptHash)}`);
    return query.length > 0 ? `${base}&${query.join('&')}` : base;
  },
  schoolClaim: (eventId: string) => `/r/school/${eventId}`,
} as const;
