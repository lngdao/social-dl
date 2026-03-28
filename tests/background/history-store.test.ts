import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string[]) => Object.fromEntries(keys.map(k => [k, store[k]]))),
      set: vi.fn(async (data: Record<string, unknown>) => { Object.assign(store, data); }),
    },
  },
});

import { addHistoryEntry, getHistory, clearHistory } from '../../src/background/history-store';
import type { HistoryEntry } from '../../src/adapters/types';

beforeEach(() => { Object.keys(store).forEach(k => delete store[k]); vi.clearAllMocks(); });

describe('history-store', () => {
  it('adds and retrieves a history entry', async () => {
    const entry: HistoryEntry = { id: 'e1', title: 'Test', platform: 'facebook', sourceUrl: 'https://fb.com/reel/1', downloadedAt: 1000 };
    await addHistoryEntry(entry);
    const history = await getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('e1');
  });

  it('clears history', async () => {
    await addHistoryEntry({ id: 'e2', title: 'Test2', platform: 'instagram', sourceUrl: 'https://ig.com/reel/2', downloadedAt: 2000 });
    await clearHistory();
    expect(await getHistory()).toHaveLength(0);
  });

  it('prepends newer entries to front', async () => {
    await addHistoryEntry({ id: 'a', title: 'A', platform: 'tiktok', sourceUrl: '', downloadedAt: 1 });
    await addHistoryEntry({ id: 'b', title: 'B', platform: 'tiktok', sourceUrl: '', downloadedAt: 2 });
    const history = await getHistory();
    expect(history[0].id).toBe('b');
  });
});
