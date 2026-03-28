import type { HistoryEntry } from '../adapters/types';
import { getRawHistory, saveRawHistory } from '../shared/storage';

const MAX_HISTORY = 500;

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  const history = await getRawHistory();
  const updated = [entry, ...history].slice(0, MAX_HISTORY);
  await saveRawHistory(updated);
}

export async function getHistory(): Promise<HistoryEntry[]> {
  return getRawHistory();
}

export async function clearHistory(): Promise<void> {
  await saveRawHistory([]);
}
