export type Role = 'viewer' | 'operator' | 'admin';

export type EventState = 'draft' | 'published' | 'ended';

export type ParticipationState = 'started' | 'completed' | 'expired' | 'invalid';

export const roleLabel: Record<Role, string> = {
  viewer: '閲覧のみ',
  operator: '運用者',
  admin: '管理者',
};

export const eventStateLabel: Record<EventState, string> = {
  draft: '下書き',
  published: '公開中',
  ended: '終了',
};
