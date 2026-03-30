import { h } from 'preact';
import type { Settings, MergeMethod } from '../adapters/types';
import { DEFAULT_SETTINGS } from '../shared/storage';

const QUALITY_OPTIONS = ['highest', '1080p', '720p', '360p'];
const MERGE_OPTIONS: { value: MergeMethod; label: string; desc: string }[] = [
  { value: 'mp4box', label: 'MP4Box (Recommended)', desc: 'Lightweight JS-based merge, fast startup' },
  { value: 'ffmpeg', label: 'FFmpeg WASM', desc: 'Full FFmpeg in WebAssembly, slower but robust' },
  { value: 'direct', label: 'Direct (No merge)', desc: 'Download video-only, skip audio merge' },
];

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

      {/* Merge Method */}
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-gray-200">Merge Method</label>
        <select
          value={settings.mergeMethod ?? DEFAULT_SETTINGS.mergeMethod}
          onChange={(e) => onUpdate({ mergeMethod: (e.target as HTMLSelectElement).value as MergeMethod })}
          class="bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          {MERGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <p class="text-xs text-gray-500">
          {MERGE_OPTIONS.find(o => o.value === (settings.mergeMethod ?? DEFAULT_SETTINGS.mergeMethod))?.desc}
        </p>
      </div>

      {/* Cobalt Instance */}
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-gray-200">Cobalt Instance</label>
        <input
          type="url"
          value={settings.cobaltInstance ?? DEFAULT_SETTINGS.cobaltInstance}
          onInput={(e) => onUpdate({ cobaltInstance: (e.target as HTMLInputElement).value })}
          placeholder="https://cobalt-backend.canine.tools"
          class="bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm px-3 py-2 focus:outline-none focus:border-blue-500"
        />
        <p class="text-xs text-gray-500">
          Server for DASH merge. Leave default or pick from{' '}
          <a href="https://instances.cobalt.best/" target="_blank" rel="noopener" class="text-blue-400 hover:underline">community instances</a>.
        </p>
      </div>

      {/* Cobalt API Key */}
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-gray-200">Cobalt API Key</label>
        <input
          type="password"
          value={settings.cobaltApiKey ?? DEFAULT_SETTINGS.cobaltApiKey}
          onInput={(e) => onUpdate({ cobaltApiKey: (e.target as HTMLInputElement).value })}
          placeholder="Optional — only if instance requires auth"
          class="bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm px-3 py-2 focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}
