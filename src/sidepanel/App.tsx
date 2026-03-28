import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { DownloadJob, HistoryEntry, Settings } from '../adapters/types';
import { DEFAULT_SETTINGS } from '../shared/storage';
import { QueueTab } from './QueueTab';
import { HistoryTab } from './HistoryTab';
import { SettingsTab } from './SettingsTab';

type Tab = 'queue' | 'history' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'queue', label: 'Queue' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('queue');
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Load initial state
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_QUEUE' }, (res) => {
      if (res?.payload) setJobs(res.payload);
    });
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (res) => {
      if (res?.payload) setHistory(res.payload);
    });
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
      if (res?.payload) setSettings(res.payload);
    });
  }, []);

  // Subscribe to live updates
  useEffect(() => {
    function listener(message: { type: string; payload: unknown }) {
      if (message.type === 'QUEUE_UPDATE') setJobs(message.payload as DownloadJob[]);
      if (message.type === 'HISTORY_UPDATE') setHistory(message.payload as HistoryEntry[]);
      if (message.type === 'SETTINGS_UPDATE') setSettings(message.payload as Settings);
    }
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  function handleUpdateSettings(patch: Partial<Settings>) {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', payload: patch });
  }

  function handleClearHistory() {
    chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
      setHistory([]);
    });
  }

  return (
    <div class="flex flex-col h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <div class="px-4 pt-4 pb-0">
        <h1 class="text-base font-bold text-white mb-3">Social Downloader</h1>
        {/* Tab bar */}
        <div class="flex border-b border-gray-700">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              class={[
                'flex-1 text-sm py-2 font-medium transition-colors',
                tab === t.id
                  ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                  : 'text-gray-400 hover:text-gray-200',
              ].join(' ')}
            >
              {t.label}
              {t.id === 'queue' && jobs.length > 0 && (
                <span class="ml-1 text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5">
                  {jobs.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div class="flex-1 overflow-y-auto">
        {tab === 'queue' && <QueueTab jobs={jobs} />}
        {tab === 'history' && <HistoryTab entries={history} onClearAll={handleClearHistory} />}
        {tab === 'settings' && <SettingsTab settings={settings} onUpdate={handleUpdateSettings} />}
      </div>
    </div>
  );
}
