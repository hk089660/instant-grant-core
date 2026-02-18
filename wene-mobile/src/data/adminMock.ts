import type { Role, EventState } from '../types/ui';

let currentRole: Role = 'admin';

export const getMockAdminRole = (): Role => currentRole;
export const setMockAdminRole = (role: Role): void => {
  currentRole = role;
};

export const mockCategories = [
  { id: 'all', label: 'すべて' },
  { id: 'volunteer', label: 'ボランティア' },
  { id: 'school', label: '学校行事' },
  { id: 'other', label: '未分類（Other）' },
];

export const mockEvents: Array<{
  id: string;
  title: string;
  datetime: string;
  host: string;
  state: EventState;
  rtCount: number;
  totalCount: number;
}> = [
  {
    id: 'evt-001',
    title: '地域清掃ボランティア',
    datetime: '2026/02/02 09:00-10:30',
    host: '生徒会',
    state: 'published',
    rtCount: 23,
    totalCount: 58,
  },
  {
    id: 'evt-002',
    title: '進路説明会',
    datetime: '2026/02/10 15:00-16:00',
    host: '進路指導室',
    state: 'draft',
    rtCount: 8,
    totalCount: 8,
  },
];

export const mockParticipants = [
  { id: 'stu-081', display: 'Student-081', code: '#A7F3', time: '10:02' },
  { id: 'stu-142', display: 'Student-142', code: '#B112', time: '10:05' },
  { id: 'stu-203', display: '-', code: '#C821', time: '10:07' },
];

export const mockParticipantLogs = [
  {
    id: 'stu-081',
    display: 'Student-081',
    event: '地域清掃ボランティア',
    code: '#A7F3',
    time: '2026/02/02 10:02',
  },
  {
    id: 'stu-142',
    display: 'Student-142',
    event: '進路説明会',
    code: '#B112',
    time: '2026/02/10 15:05',
  },
];
