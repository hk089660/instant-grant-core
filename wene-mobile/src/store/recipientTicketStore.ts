import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'wene:recipient_tickets';

export interface RecipientTicket {
  eventId: string;
  eventName: string;
  joinedAt: number;
  txSignature?: string;
  receiptPubkey?: string;
  popEntryHash?: string;
  popAuditHash?: string;
  popSigner?: string;
}

interface RecipientTicketStore {
  tickets: RecipientTicket[];
  isLoading: boolean;
  loadTickets: () => Promise<void>;
  addTicket: (ticket: RecipientTicket) => Promise<void>;
  isJoined: (eventId: string) => boolean;
  getTicketByEventId: (eventId: string) => RecipientTicket | undefined;
}

const loadFromStorage = async (): Promise<RecipientTicket[]> => {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const raw = item as Record<string, unknown>;
        const eventId = typeof raw.eventId === 'string' ? raw.eventId.trim() : '';
        const eventName = typeof raw.eventName === 'string' ? raw.eventName : '';
        const joinedAt = typeof raw.joinedAt === 'number' && Number.isFinite(raw.joinedAt) ? raw.joinedAt : Date.now();
        if (!eventId || !eventName) return null;
        return {
          eventId,
          eventName,
          joinedAt,
          txSignature: typeof raw.txSignature === 'string' ? raw.txSignature : undefined,
          receiptPubkey: typeof raw.receiptPubkey === 'string' ? raw.receiptPubkey : undefined,
          popEntryHash: typeof raw.popEntryHash === 'string' ? raw.popEntryHash : undefined,
          popAuditHash: typeof raw.popAuditHash === 'string' ? raw.popAuditHash : undefined,
          popSigner: typeof raw.popSigner === 'string' ? raw.popSigner : undefined,
        } as RecipientTicket;
      })
      .filter((ticket): ticket is RecipientTicket => ticket !== null);
  } catch {
    return [];
  }
};

const saveToStorage = async (tickets: RecipientTicket[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
};

function mergeTicket(existing: RecipientTicket, incoming: RecipientTicket): RecipientTicket {
  return {
    ...existing,
    ...incoming,
    joinedAt: existing.joinedAt || incoming.joinedAt,
    txSignature: incoming.txSignature ?? existing.txSignature,
    receiptPubkey: incoming.receiptPubkey ?? existing.receiptPubkey,
    popEntryHash: incoming.popEntryHash ?? existing.popEntryHash,
    popAuditHash: incoming.popAuditHash ?? existing.popAuditHash,
    popSigner: incoming.popSigner ?? existing.popSigner,
  };
}

export const useRecipientTicketStore = create<RecipientTicketStore>((set, get) => ({
  tickets: [],
  isLoading: false,

  loadTickets: async () => {
    set({ isLoading: true });
    try {
      const tickets = await loadFromStorage();
      set({ tickets, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  addTicket: async (ticket: RecipientTicket) => {
    const { tickets } = get();
    const idx = tickets.findIndex((t) => t.eventId === ticket.eventId);
    const next =
      idx === -1
        ? [...tickets, ticket]
        : tickets.map((current, i) => (i === idx ? mergeTicket(current, ticket) : current));
    await saveToStorage(next);
    set({ tickets: next });
  },

  isJoined: (eventId: string) => {
    return get().tickets.some((t) => t.eventId === eventId);
  },

  getTicketByEventId: (eventId: string) => {
    return get().tickets.find((ticket) => ticket.eventId === eventId);
  },
}));
