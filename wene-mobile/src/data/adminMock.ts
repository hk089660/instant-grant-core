import type { Role, EventState } from '../types/ui';

let currentRole: Role = 'admin';

export const getMockAdminRole = (): Role => currentRole;
export const setMockAdminRole = (role: Role): void => {
  currentRole = role;
};

export const mockCategories = [
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
