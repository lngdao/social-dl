import { h } from 'preact';
import type { Settings } from '../adapters/types';
import { DEFAULT_SETTINGS } from '../shared/storage';

const QUALITY_OPTIONS = ['highest', '1080p', '720p', '360p'];

interface SettingsTabProps {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
}

export function SettingsTab({ settings, onUpdate }: SettingsTabProps) {
  return (
    <div class="flex flex-col gap-6 p-4">
      {/* Concurrency */}
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-gray-200">
          Concurrent Downloads
          <span class="ml-2 text-blue-400 font-bold">{settings.concurrency ?? DEFAULT_SETTINGS.concurrency}</span>
        </label>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={settings.concurrency ?? DEFAULT_SETTINGS.concurrency}
          onInput={(e) => onUpdate({ concurrency: Number((e.target as HTMLInputElement).value) })}
          class="w-full accent-blue-500"
        />
        <div class="flex justify-between text-xs text-gray-500">
          {[1, 2, 3, 4, 5].map(n => <span key={n}>{n}</span>)}
        </div>
      </div>

      {/* Default quality */}
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-gray-200">Default Quality</label>
        <select
          value={settings.defaultQuality ?? DEFAULT_SETTINGS.defaultQuality}
          onChange={(e) => onUpdate({ defaultQuality: (e.target as HTMLSelectElement).value })}
          class="bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          {QUALITY_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
      </div>
    </div>
  );
}
