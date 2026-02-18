
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchoolStore, type Env } from '../src/storeDO';

// Mock DurableObjectState
class MockStorage {
    private data = new Map<string, any>();

    async get<T = unknown>(key: string): Promise<T | undefined> {
        return this.data.get(key) as T | undefined;
    }

    async put(key: string, value: any): Promise<void> {
        this.data.set(key, value);
    }

    async list(options?: { prefix?: string }): Promise<Map<string, unknown>> {
        const result = new Map<string, unknown>();
        const prefix = options?.prefix || '';
        for (const [key, value] of this.data.entries()) {
            if (key.startsWith(prefix)) {
                result.set(key, value);
            }
        }
        return result;
    }
}

class MockDurableObjectState {
    storage: MockStorage;
    id: any = { toString: () => 'mock-id' };
    waitUntil(promise: Promise<any>): void { /* no-op */ }
    blockConcurrencyWhile(callback: () => Promise<any>): Promise<any> { return callback(); }

    constructor() {
        this.storage = new MockStorage();
    }
}

describe('SchoolStore Audit Log', () => {
    let store: SchoolStore;
    let mockState: any;
    let mockEnv: Env;

    beforeEach(() => {
        mockState = new MockDurableObjectState();
        mockEnv = {};
        // @ts-ignore - Mocking DO state
        store = new SchoolStore(mockState, mockEnv);
    });

    it('should create a genesis audit log entry', async () => {
        const eventId = 'event-123';
        const entry = await store.appendAuditLog(
            'TEST_EVENT',
            { type: 'user', id: 'u1' },
            { foo: 'bar' },
            eventId
        );

        expect(entry.event).toBe('TEST_EVENT');
        expect(entry.eventId).toBe(eventId);
        expect(entry.prev_hash).toBe('GENESIS');
        expect(entry.entry_hash).toBeDefined();
        expect(entry.ts).toBeDefined();

        // Verify storage update
        const lastHash = await mockState.storage.get(`audit:lastHash:${eventId}`);
        expect(lastHash).toBe(entry.entry_hash);
    });

    it('should chain hashes correctly for sequential logs', async () => {
        const eventId = 'event-chain';

        // First entry
        const entry1 = await store.appendAuditLog(
            'EVENT_1',
            { type: 'system', id: 'sys' },
            {},
            eventId
        );

        expect(entry1.prev_hash).toBe('GENESIS');

        // Second entry
        const entry2 = await store.appendAuditLog(
            'EVENT_2',
            { type: 'system', id: 'sys' },
            {},
            eventId
        );

        expect(entry2.prev_hash).toBe(entry1.entry_hash);
        expect(entry2.event).toBe('EVENT_2');

        // Verify storage has latest hash
        const lastHash = await mockState.storage.get(`audit:lastHash:${eventId}`);
        expect(lastHash).toBe(entry2.entry_hash);
    });

    it('should maintain separate hash chains for different events', async () => {
        const eventA = 'event-A';
        const eventB = 'event-B';

        const entryA1 = await store.appendAuditLog('A1', { type: 'u', id: '1' }, {}, eventA);
        const entryB1 = await store.appendAuditLog('B1', { type: 'u', id: '1' }, {}, eventB);

        expect(entryA1.prev_hash).toBe('GENESIS');
        expect(entryB1.prev_hash).toBe('GENESIS'); // Should be GENESIS for new event ID

        const entryA2 = await store.appendAuditLog('A2', { type: 'u', id: '1' }, {}, eventA);
        expect(entryA2.prev_hash).toBe(entryA1.entry_hash);

        // Check that B chain is unaffected
        const lastHashB = await mockState.storage.get(`audit:lastHash:${eventB}`);
        expect(lastHashB).toBe(entryB1.entry_hash);
    });
});
