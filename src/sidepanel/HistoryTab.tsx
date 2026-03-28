import { h } from 'preact';
import type { HistoryEntry, Platform } from '../adapters/types';

function platformIcon(platform: Platform): string {
  switch (platform) {
    case 'facebook': return '📘';
    case 'instagram': return '📷';
    case 'tiktok': return '🎵';
    default: return '🎬';
  }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface HistoryTabProps {
  entries: HistoryEntry[];
  onClearAll: () => void;
}

export function HistoryTab({ entries, onClearAll }: HistoryTabProps) {
  if (entries.length === 0) {
    return (
      <div class="flex flex-col items-center justify-center h-48 text-gray-500 text-sm">
        No download history
      </div>
    );
  }

  return (
    <div class="flex flex-col gap-2 p-3">
      <div class="flex justify-end">
        <button
          onClick={onClearAll}
          class="text-xs text-red-400 hover:text-red-300 px-3 py-1 rounded border border-red-800 hover:border-red-600 transition-colors"
        >
          Clear all
        </button>
      </div>
      {entries.map(entry => (
        <div key={entry.id} class="bg-gray-800 rounded-lg p-3 flex items-center gap-3">
          <span class="text-lg">{platformIcon(entry.platform)}</span>
          <div class="flex-1 min-w-0">
            <div class="text-sm text-gray-100 truncate">{entry.title || entry.id}</div>
            <div class="text-xs text-gray-400">{formatDate(entry.downloadedAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
