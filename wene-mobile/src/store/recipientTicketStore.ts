import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_PREFIX = 'wene:recipient_tickets:v2';

function normalizeActiveUserId(userId?: string | null): string | null {
  const normalized = typeof userId === 'string' ? userId.trim().toLowerCase() : '';
  return normalized || null;
}

function normalizeUserScope(userId?: string | null): string {
  return normalizeActiveUserId(userId) ?? 'guest';
}

function getStorageKey(userId?: string | null): string {
  return `${STORAGE_KEY_PREFIX}:${normalizeUserScope(userId)}`;
}

export interface RecipientTicket {
  eventId: string;
  eventName: string;
  joinedAt: number;
  mintAddress?: string;
  txSignature?: string;
  receiptPubkey?: string;
  onchainReceipts?: Array<{
    txSignature: string;
    receiptPubkey?: string;
    claimedAt: number;
  }>;
  popEntryHash?: string;
  popAuditHash?: string;
  popSigner?: string;
  confirmationCode?: string;
  auditReceiptId?: string;
  auditReceiptHash?: string;
}

type OnchainReceiptLike = {
  txSignature?: unknown;
  receiptPubkey?: unknown;
  claimedAt?: unknown;
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeClaimedAt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeOnchainReceipts(
  items: OnchainReceiptLike[],
  fallbackClaimedAt: number
): Array<{
  txSignature: string;
  receiptPubkey?: string;
  claimedAt: number;
}> {
  const deduped = new Map<string, { txSignature: string; receiptPubkey?: string; claimedAt: number }>();
  for (const item of items) {
    const txSignature = normalizeString(item.txSignature);
    if (!txSignature) continue;
    const receiptPubkey = normalizeString(item.receiptPubkey);
    const claimedAt = normalizeClaimedAt(item.claimedAt, fallbackClaimedAt);
    const existing = deduped.get(txSignature);
    if (!existing) {
      deduped.set(txSignature, {
        txSignature,
        receiptPubkey,
        claimedAt,
      });
      continue;
    }
    deduped.set(txSignature, {
      txSignature,
      receiptPubkey: existing.receiptPubkey ?? receiptPubkey,
      claimedAt: Math.max(existing.claimedAt, claimedAt),
    });
  }
  return Array.from(deduped.values()).sort((a, b) => b.claimedAt - a.claimedAt);
}

function normalizeTicketOnchainFields(ticket: RecipientTicket): RecipientTicket {
  const onchainReceipts = normalizeOnchainReceipts(
    [
      ...(ticket.onchainReceipts ?? []),
      {
        txSignature: ticket.txSignature,
        receiptPubkey: ticket.receiptPubkey,
        claimedAt: ticket.joinedAt,
      },
    ],
    ticket.joinedAt
  );
  const latestOnchain = onchainReceipts[0];
  return {
    ...ticket,
    txSignature: latestOnchain?.txSignature ?? ticket.txSignature,
    receiptPubkey: latestOnchain?.receiptPubkey ?? ticket.receiptPubkey,
    onchainReceipts: onchainReceipts.length > 0 ? onchainReceipts : undefined,
  };
}

interface RecipientTicketStore {
  activeUserId: string | null;
  tickets: RecipientTicket[];
  isLoading: boolean;
  setActiveUser: (userId: string | null) => Promise<void>;
  clearUserTickets: (userId?: string | null) => Promise<void>;
  loadTickets: () => Promise<void>;
  replaceTickets: (tickets: RecipientTicket[]) => Promise<void>;
  addTicket: (ticket: RecipientTicket) => Promise<void>;
  isJoined: (eventId: string) => boolean;
  getTicketByEventId: (eventId: string) => RecipientTicket | undefined;
}

const loadFromStorage = async (userId?: string | null): Promise<RecipientTicket[]> => {
  const value = await AsyncStorage.getItem(getStorageKey(userId));
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
        const normalizedTicket: RecipientTicket = {
          eventId,
          eventName,
          joinedAt,
          mintAddress: typeof raw.mintAddress === 'string' ? raw.mintAddress : undefined,
          txSignature: typeof raw.txSignature === 'string' ? raw.txSignature : undefined,
          receiptPubkey: typeof raw.receiptPubkey === 'string' ? raw.receiptPubkey : undefined,
          onchainReceipts: Array.isArray(raw.onchainReceipts)
            ? normalizeOnchainReceipts(raw.onchainReceipts as OnchainReceiptLike[], joinedAt)
            : undefined,
          popEntryHash: typeof raw.popEntryHash === 'string' ? raw.popEntryHash : undefined,
          popAuditHash: typeof raw.popAuditHash === 'string' ? raw.popAuditHash : undefined,
          popSigner: typeof raw.popSigner === 'string' ? raw.popSigner : undefined,
          confirmationCode: typeof raw.confirmationCode === 'string' ? raw.confirmationCode : undefined,
          auditReceiptId: typeof raw.auditReceiptId === 'string' ? raw.auditReceiptId : undefined,
          auditReceiptHash: typeof raw.auditReceiptHash === 'string' ? raw.auditReceiptHash : undefined,
        };
        return normalizeTicketOnchainFields(normalizedTicket);
      })
      .filter((ticket): ticket is RecipientTicket => ticket !== null);
  } catch {
    return [];
  }
};

const saveToStorage = async (tickets: RecipientTicket[], userId?: string | null): Promise<void> => {
  await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(tickets));
};

function mergeTicket(existing: RecipientTicket, incoming: RecipientTicket): RecipientTicket {
  const mergedOnchainReceipts = normalizeOnchainReceipts(
    [
      ...(existing.onchainReceipts ?? []),
      ...(incoming.onchainReceipts ?? []),
      {
        txSignature: existing.txSignature,
        receiptPubkey: existing.receiptPubkey,
        claimedAt: existing.joinedAt,
      },
      {
        txSignature: incoming.txSignature,
        receiptPubkey: incoming.receiptPubkey,
        claimedAt: incoming.joinedAt,
      },
    ],
    Math.max(existing.joinedAt, incoming.joinedAt)
  );
  const latestOnchain = mergedOnchainReceipts[0];
  return {
    ...existing,
    ...incoming,
    joinedAt: existing.joinedAt || incoming.joinedAt,
    mintAddress: incoming.mintAddress ?? existing.mintAddress,
    txSignature: latestOnchain?.txSignature ?? incoming.txSignature ?? existing.txSignature,
    receiptPubkey: latestOnchain?.receiptPubkey ?? incoming.receiptPubkey ?? existing.receiptPubkey,
    onchainReceipts: mergedOnchainReceipts.length > 0 ? mergedOnchainReceipts : undefined,
    popEntryHash: incoming.popEntryHash ?? existing.popEntryHash,
    popAuditHash: incoming.popAuditHash ?? existing.popAuditHash,
    popSigner: incoming.popSigner ?? existing.popSigner,
    confirmationCode: incoming.confirmationCode ?? existing.confirmationCode,
    auditReceiptId: incoming.auditReceiptId ?? existing.auditReceiptId,
    auditReceiptHash: incoming.auditReceiptHash ?? existing.auditReceiptHash,
  };
}

export const useRecipientTicketStore = create<RecipientTicketStore>((set, get) => ({
  activeUserId: null,
  tickets: [],
  isLoading: false,

  setActiveUser: async (userId) => {
    const normalized = normalizeActiveUserId(userId);
    set({
      activeUserId: normalized,
      tickets: [],
      isLoading: true,
    });
    try {
      const tickets = await loadFromStorage(normalized);
      if (get().activeUserId !== normalized) return;
      set({ tickets, isLoading: false });
    } catch {
      if (get().activeUserId !== normalized) return;
      set({ tickets: [], isLoading: false });
    }
  },

  clearUserTickets: async (userId) => {
    const normalized = normalizeActiveUserId(userId);
    await AsyncStorage.removeItem(getStorageKey(normalized));
    if (get().activeUserId === normalized) {
      set({ tickets: [] });
    }
  },

  loadTickets: async () => {
    const { activeUserId } = get();
    set({ isLoading: true });
    try {
      const tickets = await loadFromStorage(activeUserId);
      if (get().activeUserId !== activeUserId) return;
      set({ tickets, isLoading: false });
    } catch {
      if (get().activeUserId !== activeUserId) return;
      set({ isLoading: false });
    }
  },

  replaceTickets: async (incomingTickets: RecipientTicket[]) => {
    const { activeUserId } = get();
    const deduped: RecipientTicket[] = [];
    for (const incoming of incomingTickets) {
      const eventId = incoming.eventId.trim();
      const eventName = incoming.eventName.trim();
      if (!eventId || !eventName) continue;
      const normalized: RecipientTicket = {
        ...incoming,
        eventId,
        eventName,
        joinedAt: Number.isFinite(incoming.joinedAt) ? incoming.joinedAt : Date.now(),
      };
      const canonical = normalizeTicketOnchainFields(normalized);
      const existingIndex = deduped.findIndex((ticket) => ticket.eventId === eventId);
      if (existingIndex < 0) {
        deduped.push(canonical);
      } else {
        deduped[existingIndex] = mergeTicket(deduped[existingIndex], canonical);
      }
    }
    await saveToStorage(deduped, activeUserId);
    if (get().activeUserId !== activeUserId) return;
    set({ tickets: deduped });
  },

  addTicket: async (ticket: RecipientTicket) => {
    const { tickets, activeUserId } = get();
    const canonicalTicket = normalizeTicketOnchainFields(ticket);
    const idx = tickets.findIndex((t) => t.eventId === ticket.eventId);
    const next =
      idx === -1
        ? [...tickets, canonicalTicket]
        : tickets.map((current, i) => (i === idx ? mergeTicket(current, canonicalTicket) : current));
    await saveToStorage(next, activeUserId);
    if (get().activeUserId !== activeUserId) return;
    set({ tickets: next });
  },

  isJoined: (eventId: string) => {
    return get().tickets.some((t) => t.eventId === eventId);
  },

  getTicketByEventId: (eventId: string) => {
    return get().tickets.find((ticket) => ticket.eventId === eventId);
  },
}));
