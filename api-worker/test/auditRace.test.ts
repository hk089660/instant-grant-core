
import { describe, it, expect, beforeEach } from 'vitest';
import { SchoolStore, type Env } from '../src/storeDO';

// Mock DurableObjectState with delay to simulate race condition
class MockStorage {
    private data = new Map<string, any>();

    async get<T = unknown>(key: string): Promise<T | undefined> {
        // Simulate latency
        await new Promise(r => setTimeout(r, 10));
        return this.data.get(key) as T | undefined;
    }

    async put(key: string, value: any): Promise<void> {
        // Simulate latency
        await new Promise(r => setTimeout(r, 10));
        this.data.set(key, value);
    }

    async list(options?: { prefix?: string }): Promise<Map<string, unknown>> {
        return new Map();
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

describe('SchoolStore Audit Log Race Condition', () => {
    let store: SchoolStore;
    let mockState: any;

    beforeEach(() => {
        mockState = new MockDurableObjectState();
        // @ts-ignore
        store = new SchoolStore(mockState, {});
    });

    it('should handle concurrent requests without forking the chain', async () => {
        const eventId = 'race-event';

        // Simulate 3 concurrent requests
        const p1 = store.appendAuditLog('E1', { type: 'u', id: '1' }, {}, eventId);
        const p2 = store.appendAuditLog('E2', { type: 'u', id: '2' }, {}, eventId);
        const p3 = store.appendAuditLog('E3', { type: 'u', id: '3' }, {}, eventId);

        const results = await Promise.all([p1, p2, p3]);

        const hashes = results.map(r => r.prev_hash);

        // If race condition exists, multiple entries might have 'GENESIS' as prev_hash
        const genesisCount = hashes.filter(h => h === 'GENESIS').length;

        console.log('Prev Hashes:', hashes);

        // Ideally, only 1 should be GENESIS
        expect(genesisCount).toBe(1);

        // All prev_hashes should be unique (GENESIS, Hash1, Hash2)
        const uniqueHashes = new Set(hashes);
        expect(uniqueHashes.size).toBe(3);
    });
});
