import type { HistoryEntry, Settings } from '../adapters/types';

const HISTORY_KEY = 'download_history';
const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  concurrency: 3,
  defaultQuality: 'highest',
  mergeMethod: 'mp4box',
  includeAudio: true,
  cobaltInstance: 'https://cobalt-backend.canine.tools',
  cobaltApiKey: '',
};

export async function storageGet<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get([key]);
  return (result[key] as T) ?? fallback;
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getSettings(): Promise<Settings> {
  return storageGet(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export async function saveSettings(settings: Settings): Promise<void> {
  return storageSet(SETTINGS_KEY, settings);
}

export async function getRawHistory(): Promise<HistoryEntry[]> {
  return storageGet<HistoryEntry[]>(HISTORY_KEY, []);
}

export async function saveRawHistory(history: HistoryEntry[]): Promise<void> {
  return storageSet(HISTORY_KEY, history);
}
