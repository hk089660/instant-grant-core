/**
 * schoolClaimClient mock implementation
 *
 * NOTE:
 * - This file is used for mock / offline development.
 * - The old retryable (intentional failure) scenario has been removed.
 */

export type SchoolEvent = {
  id: string;
  title: string;
  datetime?: string;
  host?: string;
  state: 'draft' | 'published' | 'closed' | string;
};

export type SchoolClaimErrorCode = 'not_found' | 'bad_request' | 'retryable' | 'internal';

export type SchoolClaimResult =
  | {
      success: true;
      alreadyJoined: boolean;
      claimedCount?: number;
      completedCount?: number;
    }
  | {
      success: false;
      error: {
        code: SchoolClaimErrorCode;
        message: string;
      };
    };

// Mock events used by the client.
// Keep this aligned with the API seed (evt-001 / evt-002).
export const MOCK_EVENTS: SchoolEvent[] = [
  {
    id: 'evt-001',
    title: 'イベント 1',
    datetime: '2026/02/15 09:00-10:00',
    host: '実行委員会',
    state: 'published',
  },
  {
    id: 'evt-002',
    title: 'イベント 2',
    datetime: '2026/02/15 10:30-11:30',
    host: '実行委員会',
    state: 'published',
  },
];

type Counts = { claimed: number; completed: number };

const joinedByEvent = new Map<string, Set<string>>();
const countsByEvent = new Map<string, Counts>();

function getKey(params: { joinToken?: string; walletAddress?: string }): string {
  const key = (params.joinToken ?? params.walletAddress ?? '').trim();
  return key;
}

function getCounts(eventId: string): Counts {
  const existing = countsByEvent.get(eventId);
  if (existing) return existing;
  const init = { claimed: 0, completed: 0 };
  countsByEvent.set(eventId, init);
  return init;
}

export async function listEvents(): Promise<SchoolEvent[]> {
  return MOCK_EVENTS;
}

export async function getEvent(eventId: string): Promise<SchoolEvent | null> {
  return MOCK_EVENTS.find((e) => e.id === eventId) ?? null;
}

export async function submitClaim(params: {
  eventId: string;
  joinToken?: string;
  walletAddress?: string;
}): Promise<SchoolClaimResult> {
  const eventId = (params.eventId ?? '').trim();
  if (!eventId) {
    return {
      success: false,
      error: { code: 'bad_request', message: 'eventId is required' },
    };
  }

  const event = await getEvent(eventId);
  if (!event) {
    return {
      success: false,
      error: { code: 'not_found', message: 'イベントが見つかりません' },
    };
  }

  const subjectKey = getKey(params);
  if (!subjectKey) {
    return {
      success: false,
      error: { code: 'bad_request', message: 'joinToken or walletAddress is required' },
    };
  }

  const set = joinedByEvent.get(eventId) ?? new Set<string>();
  const alreadyJoined = set.has(subjectKey);

  if (!alreadyJoined) {
    set.add(subjectKey);
    joinedByEvent.set(eventId, set);
    const c = getCounts(eventId);
    c.claimed += 1;
  }

  const c = getCounts(eventId);
  return {
    success: true,
    alreadyJoined,
    claimedCount: c.claimed,
    completedCount: c.completed,
  };
}

export const schoolClaimClientMock = {
  listEvents,
  getEvent,
  submitClaim,
};

export default schoolClaimClientMock;
