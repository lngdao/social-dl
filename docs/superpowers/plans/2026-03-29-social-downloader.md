# Social Downloader Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that downloads Reels from Facebook, Instagram, and TikTok — supports single video and bulk profile download, client-side only.

**Architecture:** Content scripts running in MAIN world monkey-patch `fetch` to intercept GraphQL/API responses and extract video metadata + quality URLs. A background Service Worker manages the download queue (concurrency=3), uses ffmpeg.wasm to merge DASH streams into MP4, and stores history in `chrome.storage.local`. UI consists of an injected overlay for single/bulk download and a Side Panel for queue/history/settings.

**Tech Stack:** WXT (extension framework), TypeScript, Preact, Tailwind CSS v4, ffmpeg.wasm v0.12, Vitest

---

## File Structure

```
entrypoints/
  background.ts              # Wires up queue, interceptor, message handlers
  content/index.ts           # Content script: detect platform, inject UI
  sidepanel/
    index.html
    main.tsx                 # Side panel Preact app entry
public/
  manifest.json              # (managed by wxt.config.ts)
src/
  adapters/
    types.ts                 # PlatformAdapter interface, VideoInfo, DownloadJob
    facebook.ts              # Facebook fetch interceptor + profile scroll
    instagram.ts             # Instagram fetch interceptor + profile scroll
    tiktok.ts                # TikTok fetch interceptor + profile scroll
  background/
    download-queue.ts        # Concurrent queue with retry logic
    ffmpeg-merge.ts          # ffmpeg.wasm wrapper: merge video+audio → MP4
    history-store.ts         # chrome.storage.local typed wrapper
    request-interceptor.ts   # webRequest CDN URL fallback capture
  content/
    platform-detector.ts     # Detect which adapter + page type
    fetch-interceptor.ts     # Monkey-patch window.fetch in MAIN world
    ui/
      single-button.tsx      # Overlay download button for single reel
      bulk-panel.tsx         # Floating panel for profile reels page
  sidepanel/
    App.tsx                  # Tabs: Queue / History / Settings
    QueueTab.tsx
    HistoryTab.tsx
    SettingsTab.tsx
  shared/
    messages.ts              # Message type unions for runtime.sendMessage
    storage.ts               # Typed chrome.storage wrappers
tests/
  adapters/
    facebook.test.ts
    instagram.test.ts
    tiktok.test.ts
  background/
    download-queue.test.ts
    history-store.test.ts
  content/
    platform-detector.test.ts
wxt.config.ts
tailwind.config.ts
tsconfig.json
package.json
```

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `wxt.config.ts`
- Create: `tsconfig.json`
- Create: `tailwind.config.ts`

- [ ] **Step 1: Scaffold WXT project**

```bash
cd /Users/longdao/Projects/social-downloader-extension
npx wxt@latest init . --template preact-ts
```

When prompted: pick "Preact" template, TypeScript yes.

- [ ] **Step 2: Install dependencies**

```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util @ffmpeg/core-mt preact
npm install -D vitest @vitest/ui tailwindcss @tailwindcss/vite autoprefixer
```

- [ ] **Step 3: Configure wxt.config.ts**

Replace generated `wxt.config.ts` with:

```typescript
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  extensionApi: 'chrome',
  manifest: {
    name: 'Social Downloader',
    version: '1.0.0',
    permissions: ['webRequest', 'storage', 'sidePanel', 'downloads'],
    host_permissions: [
      '*://*.facebook.com/*',
      '*://*.instagram.com/*',
      '*://*.tiktok.com/*',
      '*://*.fbcdn.net/*',
      '*://*.cdninstagram.com/*',
      '*://*.tiktokcdn.com/*',
    ],
    side_panel: { default_path: 'sidepanel.html' },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
```

- [ ] **Step 4: Configure Tailwind**

Create `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./entrypoints/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
} satisfies Config;
```

Create `src/style.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 5: Configure Vitest**

Add to `wxt.config.ts` inside `defineConfig`:

```typescript
// inside defineConfig({...})
runner: {
  disabled: true, // disable WXT test runner, use vitest directly
},
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 6: Add test script to package.json**

```bash
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
```

- [ ] **Step 7: Verify setup builds**

```bash
npm run dev
```

Expected: WXT starts dev server, no errors. Open `chrome://extensions`, load unpacked from `.output/chrome-mv3-dev/`.

- [ ] **Step 8: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold WXT extension with Preact, Tailwind, Vitest"
```

---

## Task 2: Shared Types & Messages

**Files:**
- Create: `src/shared/messages.ts`
- Create: `src/adapters/types.ts`

- [ ] **Step 1: Write failing test**

Create `tests/adapters/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { VideoInfo, DownloadJob, VideoQuality } from '../../src/adapters/types';

describe('types', () => {
  it('VideoInfo has required fields', () => {
    const info: VideoInfo = {
      id: 'test-id',
      title: 'Test Video',
      thumbnail: 'https://example.com/thumb.jpg',
      qualities: [{ label: '1080p', url: 'https://cdn.example.com/video.mp4', type: 'mp4' }],
      platform: 'facebook',
      sourceUrl: 'https://facebook.com/reel/123',
    };
    expect(info.id).toBe('test-id');
    expect(info.qualities[0].type).toBe('mp4');
  });

  it('DownloadJob starts as pending', () => {
    const job: DownloadJob = {
      id: 'job-1',
      videoInfo: {
        id: 'v1', title: 'V', thumbnail: '', qualities: [], platform: 'instagram', sourceUrl: '',
      },
      selectedQuality: '1080p',
      status: 'pending',
      progress: 0,
      retryCount: 0,
    };
    expect(job.status).toBe('pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/adapters/types'`

- [ ] **Step 3: Create src/adapters/types.ts**

```typescript
export type Platform = 'facebook' | 'instagram' | 'tiktok';
export type VideoType = 'mp4' | 'dash';
export type JobStatus = 'pending' | 'downloading' | 'merging' | 'done' | 'error';
export type PageType = 'single' | 'profile' | 'unknown';

export interface VideoQuality {
  label: string;       // e.g. "1080p", "720p", "360p"
  url: string;         // CDN URL for mp4, or manifest URL for dash
  type: VideoType;
  audioUrl?: string;   // only for dash: separate audio track URL
}

export interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  qualities: VideoQuality[];
  platform: Platform;
  sourceUrl: string;
}

export interface DownloadJob {
  id: string;
  videoInfo: VideoInfo;
  selectedQuality: string;  // matches VideoQuality.label
  status: JobStatus;
  progress: number;          // 0–100
  retryCount: number;
  error?: string;
}

export interface HistoryEntry {
  id: string;
  title: string;
  platform: Platform;
  sourceUrl: string;
  downloadedAt: number;  // Date.now()
  fileSizeBytes?: number;
}

export interface Settings {
  concurrency: number;       // default: 3
  defaultQuality: string;    // default: 'highest'
}

export interface PlatformAdapter {
  platform: Platform;
  matchesUrl(url: string): boolean;
  detectPageType(url: string): PageType;
  /** Called in MAIN world content script — sets up fetch interceptor, returns cleanup fn */
  installFetchInterceptor(onVideo: (info: VideoInfo) => void): () => void;
}
```

- [ ] **Step 4: Create src/shared/messages.ts**

```typescript
import type { VideoInfo, DownloadJob, HistoryEntry, Settings } from '../adapters/types';

// Messages sent from content script → background
export type ContentToBackground =
  | { type: 'BULK_DOWNLOAD_REQUEST'; payload: { videos: VideoInfo[]; quality: string } };

// Messages sent from background → side panel / content script
export type BackgroundToUI =
  | { type: 'QUEUE_UPDATE'; payload: DownloadJob[] }
  | { type: 'HISTORY_UPDATE'; payload: HistoryEntry[] }
  | { type: 'SETTINGS_UPDATE'; payload: Settings };

// Messages sent from side panel → background
export type SidePanelToBackground =
  | { type: 'GET_QUEUE' }
  | { type: 'GET_HISTORY' }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'CANCEL_JOB'; payload: { jobId: string } }
  | { type: 'CLEAR_HISTORY' };

export type AnyMessage = ContentToBackground | SidePanelToBackground;
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test
```

Expected: PASS — 2 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/adapters/types.ts src/shared/messages.ts tests/adapters/types.test.ts
git commit -m "feat: add shared types and message contracts"
```

---

## Task 3: Storage Module

**Files:**
- Create: `src/shared/storage.ts`
- Create: `tests/background/history-store.test.ts`
- Create: `src/background/history-store.ts`

- [ ] **Step 1: Write failing test for storage**

Create `tests/background/history-store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome.storage.local
const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string[]) => {
        return Object.fromEntries(keys.map(k => [k, store[k]]));
      }),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(store, data);
      }),
    },
  },
});

import { addHistoryEntry, getHistory, clearHistory } from '../../src/background/history-store';
import type { HistoryEntry } from '../../src/adapters/types';

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  vi.clearAllMocks();
});

describe('history-store', () => {
  it('adds and retrieves a history entry', async () => {
    const entry: HistoryEntry = {
      id: 'e1', title: 'Test', platform: 'facebook',
      sourceUrl: 'https://fb.com/reel/1', downloadedAt: 1000,
    };
    await addHistoryEntry(entry);
    const history = await getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('e1');
  });

  it('clears history', async () => {
    const entry: HistoryEntry = {
      id: 'e2', title: 'Test2', platform: 'instagram',
      sourceUrl: 'https://ig.com/reel/2', downloadedAt: 2000,
    };
    await addHistoryEntry(entry);
    await clearHistory();
    const history = await getHistory();
    expect(history).toHaveLength(0);
  });

  it('prepends newer entries to front', async () => {
    await addHistoryEntry({ id: 'a', title: 'A', platform: 'tiktok', sourceUrl: '', downloadedAt: 1 });
    await addHistoryEntry({ id: 'b', title: 'B', platform: 'tiktok', sourceUrl: '', downloadedAt: 2 });
    const history = await getHistory();
    expect(history[0].id).toBe('b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/background/history-store'`

- [ ] **Step 3: Create src/shared/storage.ts**

```typescript
import type { HistoryEntry, Settings } from '../adapters/types';

const HISTORY_KEY = 'download_history';
const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  concurrency: 3,
  defaultQuality: 'highest',
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
```

- [ ] **Step 4: Create src/background/history-store.ts**

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test
```

Expected: PASS — 3 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/shared/storage.ts src/background/history-store.ts tests/background/history-store.test.ts
git commit -m "feat: add storage and history-store modules"
```

---

## Task 4: Download Queue

**Files:**
- Create: `src/background/download-queue.ts`
- Create: `tests/background/download-queue.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/background/download-queue.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadQueue } from '../../src/background/download-queue';
import type { DownloadJob, VideoInfo } from '../../src/adapters/types';

function makeJob(id: string): DownloadJob {
  const videoInfo: VideoInfo = {
    id, title: `Video ${id}`, thumbnail: '',
    qualities: [{ label: '720p', url: `https://cdn.example.com/${id}.mp4`, type: 'mp4' }],
    platform: 'tiktok', sourceUrl: `https://tiktok.com/v/${id}`,
  };
  return { id, videoInfo, selectedQuality: '720p', status: 'pending', progress: 0, retryCount: 0 };
}

describe('DownloadQueue', () => {
  it('adds jobs and reports them', () => {
    const q = new DownloadQueue({ concurrency: 2, onUpdate: vi.fn(), onComplete: vi.fn() });
    q.add(makeJob('j1'));
    q.add(makeJob('j2'));
    expect(q.getJobs()).toHaveLength(2);
  });

  it('respects concurrency limit', async () => {
    let running = 0;
    let maxRunning = 0;
    const q = new DownloadQueue({
      concurrency: 2,
      onUpdate: vi.fn(),
      onComplete: vi.fn(),
      _executeJob: async (_job) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise(r => setTimeout(r, 10));
        running--;
      },
    });
    q.add(makeJob('a'));
    q.add(makeJob('b'));
    q.add(makeJob('c'));
    await q.drain();
    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it('marks job as done after completion', async () => {
    const updates: DownloadJob[][] = [];
    const q = new DownloadQueue({
      concurrency: 1,
      onUpdate: (jobs) => updates.push([...jobs]),
      onComplete: vi.fn(),
      _executeJob: async () => {},
    });
    q.add(makeJob('x'));
    await q.drain();
    const lastUpdate = updates[updates.length - 1];
    expect(lastUpdate[0].status).toBe('done');
  });

  it('retries failed job up to 2 times', async () => {
    let attempts = 0;
    const q = new DownloadQueue({
      concurrency: 1,
      onUpdate: vi.fn(),
      onComplete: vi.fn(),
      _executeJob: async () => {
        attempts++;
        throw new Error('network error');
      },
    });
    q.add(makeJob('fail'));
    await q.drain();
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/background/download-queue'`

- [ ] **Step 3: Create src/background/download-queue.ts**

```typescript
import type { DownloadJob } from '../adapters/types';

const MAX_RETRIES = 2;

interface QueueOptions {
  concurrency: number;
  onUpdate: (jobs: DownloadJob[]) => void;
  onComplete: (job: DownloadJob) => void;
  /** Injectable executor — real impl lives in background.ts, test uses mock */
  _executeJob?: (job: DownloadJob, onProgress: (p: number) => void) => Promise<void>;
}

export class DownloadQueue {
  private jobs: DownloadJob[] = [];
  private running = 0;
  private opts: QueueOptions;
  private resolvers: (() => void)[] = [];

  constructor(opts: QueueOptions) {
    this.opts = opts;
  }

  add(job: DownloadJob): void {
    this.jobs.push(job);
    this.opts.onUpdate([...this.jobs]);
    this.tick();
  }

  getJobs(): DownloadJob[] {
    return [...this.jobs];
  }

  updateConcurrency(n: number): void {
    this.opts.concurrency = n;
    this.tick();
  }

  /** Resolves when all current jobs finish — useful for tests */
  drain(): Promise<void> {
    if (this.jobs.every(j => j.status === 'done' || j.status === 'error')) {
      return Promise.resolve();
    }
    return new Promise(resolve => this.resolvers.push(resolve));
  }

  private tick(): void {
    while (this.running < this.opts.concurrency) {
      const next = this.jobs.find(j => j.status === 'pending');
      if (!next) break;
      this.running++;
      next.status = 'downloading';
      this.opts.onUpdate([...this.jobs]);
      this.run(next).finally(() => {
        this.running--;
        this.tick();
        if (this.jobs.every(j => j.status === 'done' || j.status === 'error')) {
          this.resolvers.forEach(r => r());
          this.resolvers = [];
        }
      });
    }
  }

  private async run(job: DownloadJob): Promise<void> {
    const execute = this.opts._executeJob ?? (() => Promise.reject(new Error('no executor')));
    try {
      await execute(job, (p) => {
        job.progress = p;
        this.opts.onUpdate([...this.jobs]);
      });
      job.status = 'done';
      job.progress = 100;
      this.opts.onUpdate([...this.jobs]);
      this.opts.onComplete(job);
    } catch (err) {
      if (job.retryCount < MAX_RETRIES) {
        job.retryCount++;
        job.status = 'pending';
        this.opts.onUpdate([...this.jobs]);
      } else {
        job.status = 'error';
        job.error = err instanceof Error ? err.message : String(err);
        this.opts.onUpdate([...this.jobs]);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS — 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/background/download-queue.ts tests/background/download-queue.test.ts
git commit -m "feat: add concurrent download queue with retry"
```

---

## Task 5: ffmpeg.wasm Merge Helper

**Files:**
- Create: `src/background/ffmpeg-merge.ts`

> Note: ffmpeg.wasm v0.12 uses `new FFmpeg()` API. Extension Service Worker and Side Panel do NOT need COOP/COEP headers (extension origin bypasses this restriction). Content scripts cannot use SharedArrayBuffer — ffmpeg must only run in background SW or side panel.

- [ ] **Step 1: Create src/background/ffmpeg-merge.ts**

```typescript
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  ffmpegInstance = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.2/dist/esm';
  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
  });
  return ffmpegInstance;
}

/**
 * Fetches video + audio tracks and merges them into a single MP4 blob.
 * @param videoUrl - URL of video-only DASH track
 * @param audioUrl - URL of audio-only DASH track
 * @param onProgress - callback with 0–100 progress
 */
export async function mergeDashToMp4(
  videoUrl: string,
  audioUrl: string,
  onProgress: (p: number) => void,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  onProgress(5);

  ffmpeg.on('progress', ({ progress }) => {
    onProgress(5 + Math.round(progress * 90));
  });

  await ffmpeg.writeFile('video.mp4', await fetchFile(videoUrl));
  onProgress(30);
  await ffmpeg.writeFile('audio.mp4', await fetchFile(audioUrl));
  onProgress(50);

  await ffmpeg.exec([
    '-i', 'video.mp4',
    '-i', 'audio.mp4',
    '-c:v', 'copy',
    '-c:a', 'copy',
    'output.mp4',
  ]);
  onProgress(95);

  const data = await ffmpeg.readFile('output.mp4');
  await ffmpeg.deleteFile('video.mp4');
  await ffmpeg.deleteFile('audio.mp4');
  await ffmpeg.deleteFile('output.mp4');
  onProgress(100);

  return new Blob([data], { type: 'video/mp4' });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/background/ffmpeg-merge.ts
git commit -m "feat: add ffmpeg.wasm DASH merge helper"
```

---

## Task 6: Platform Adapter — Facebook

**Files:**
- Create: `src/adapters/facebook.ts`
- Create: `tests/adapters/facebook.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/adapters/facebook.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { facebookAdapter } from '../../src/adapters/facebook';

describe('facebookAdapter', () => {
  it('matches facebook.com URLs', () => {
    expect(facebookAdapter.matchesUrl('https://www.facebook.com/reel/1234')).toBe(true);
    expect(facebookAdapter.matchesUrl('https://instagram.com/reel/1234')).toBe(false);
  });

  it('detects single reel page', () => {
    expect(facebookAdapter.detectPageType('https://www.facebook.com/reel/123456')).toBe('single');
    expect(facebookAdapter.detectPageType('https://www.facebook.com/watch/?v=123')).toBe('single');
  });

  it('detects profile reels page', () => {
    expect(facebookAdapter.detectPageType('https://www.facebook.com/username/reels')).toBe('profile');
    expect(facebookAdapter.detectPageType('https://www.facebook.com/profile.php?id=123&sk=reels')).toBe('profile');
  });

  it('parses video quality from GraphQL payload', () => {
    const payload = {
      data: {
        video: {
          id: 'vid123',
          title: { text: 'My Reel' },
          playable_url_quality_hd: 'https://cdn.fbcdn.net/hd.mp4',
          playable_url: 'https://cdn.fbcdn.net/sd.mp4',
          thumbnails: { edges: [{ node: { uri: 'https://cdn.fbcdn.net/thumb.jpg' } }] },
          dash_manifest: null,
        },
      },
    };
    const info = facebookAdapter._parseGraphQL(payload, 'https://facebook.com/reel/123');
    expect(info).not.toBeNull();
    expect(info!.qualities).toHaveLength(2);
    expect(info!.qualities[0].label).toBe('1080p');
    expect(info!.qualities[1].label).toBe('720p');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/adapters/facebook'`

- [ ] **Step 3: Create src/adapters/facebook.ts**

```typescript
import type { PlatformAdapter, VideoInfo, VideoQuality, PageType } from './types';

/** Parse a Facebook GraphQL response payload and extract VideoInfo, or null if not a video response */
function parseGraphQL(payload: unknown, sourceUrl: string): VideoInfo | null {
  try {
    const p = payload as Record<string, unknown>;
    // Handle both direct video responses and nested story/creation_story formats
    const video =
      (p?.data as Record<string, unknown>)?.video ??
      ((p?.data as Record<string, unknown>)?.creation_story as Record<string, unknown>)?.attachments?.[0]?.media;

    if (!video || typeof video !== 'object') return null;
    const v = video as Record<string, unknown>;
    if (!v.id) return null;

    const qualities: VideoQuality[] = [];

    if (typeof v.playable_url_quality_hd === 'string') {
      qualities.push({ label: '1080p', url: v.playable_url_quality_hd, type: 'mp4' });
    }
    if (typeof v.playable_url === 'string') {
      qualities.push({ label: '720p', url: v.playable_url, type: 'mp4' });
    }

    if (qualities.length === 0) return null;

    const titleText =
      (v.title as Record<string, string>)?.text ??
      (v.name as string) ??
      'Facebook Video';

    const thumbnail =
      ((v.thumbnails as Record<string, unknown>)?.edges as Array<Record<string, unknown>>)?.[0]
        ?.node?.uri as string ?? '';

    return {
      id: String(v.id),
      title: titleText,
      thumbnail,
      qualities,
      platform: 'facebook',
      sourceUrl,
    };
  } catch {
    return null;
  }
}

export const facebookAdapter: PlatformAdapter & {
  _parseGraphQL: typeof parseGraphQL;
} = {
  platform: 'facebook',

  matchesUrl(url: string): boolean {
    return /facebook\.com/.test(url);
  },

  detectPageType(url: string): PageType {
    if (/facebook\.com\/reel\/\d+/.test(url)) return 'single';
    if (/facebook\.com\/watch/.test(url)) return 'single';
    if (/\/reels/.test(url) || /sk=reels/.test(url)) return 'profile';
    return 'unknown';
  },

  installFetchInterceptor(onVideo) {
    const original = window.fetch.bind(window);
    window.fetch = async function (...args) {
      const response = await original(...args);
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      if (url.includes('/graphql') || url.includes('graph.facebook.com')) {
        try {
          const clone = response.clone();
          const text = await clone.text();
          const json = JSON.parse(text);
          const info = parseGraphQL(json, window.location.href);
          if (info) onVideo(info);
        } catch { /* not JSON or not a video response */ }
      }
      return response;
    };
    return () => { window.fetch = original; };
  },

  _parseGraphQL: parseGraphQL,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS — 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/adapters/facebook.ts tests/adapters/facebook.test.ts
git commit -m "feat: add Facebook platform adapter"
```

---

## Task 7: Platform Adapter — Instagram

**Files:**
- Create: `src/adapters/instagram.ts`
- Create: `tests/adapters/instagram.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/adapters/instagram.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { instagramAdapter } from '../../src/adapters/instagram';

describe('instagramAdapter', () => {
  it('matches instagram.com URLs', () => {
    expect(instagramAdapter.matchesUrl('https://www.instagram.com/reel/abc123')).toBe(true);
    expect(instagramAdapter.matchesUrl('https://facebook.com/reel/123')).toBe(false);
  });

  it('detects single reel page', () => {
    expect(instagramAdapter.detectPageType('https://www.instagram.com/reel/ABC123/')).toBe('single');
  });

  it('detects profile reels page', () => {
    expect(instagramAdapter.detectPageType('https://www.instagram.com/username/reels/')).toBe('profile');
  });

  it('parses video info from Instagram GraphQL', () => {
    const payload = {
      data: {
        xdt_api__v1__media__shortcode__web_info: {
          items: [{
            id: 'ig123',
            caption: { text: 'My Reel caption' },
            video_versions: [
              { type: 101, url: 'https://cdn.cdninstagram.com/hd.mp4', width: 1920, height: 1080 },
              { type: 102, url: 'https://cdn.cdninstagram.com/sd.mp4', width: 720, height: 1280 },
            ],
            image_versions2: { candidates: [{ url: 'https://cdn.cdninstagram.com/thumb.jpg' }] },
          }],
        },
      },
    };
    const info = instagramAdapter._parseGraphQL(payload, 'https://instagram.com/reel/abc');
    expect(info).not.toBeNull();
    expect(info!.qualities.length).toBeGreaterThan(0);
    expect(info!.platform).toBe('instagram');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/adapters/instagram'`

- [ ] **Step 3: Create src/adapters/instagram.ts**

```typescript
import type { PlatformAdapter, VideoInfo, VideoQuality, PageType } from './types';

function parseGraphQL(payload: unknown, sourceUrl: string): VideoInfo | null {
  try {
    const p = payload as Record<string, unknown>;
    const data = p?.data as Record<string, unknown>;

    // Instagram uses multiple response shapes depending on endpoint
    const mediaResponse =
      data?.xdt_api__v1__media__shortcode__web_info ??
      data?.xdt_api__v1__feed__reels_media;

    const items = (mediaResponse as Record<string, unknown>)?.items as unknown[];
    const item = items?.[0] as Record<string, unknown> | undefined;
    if (!item?.id) return null;

    const videoVersions = item.video_versions as Array<Record<string, unknown>> | undefined;
    if (!videoVersions?.length) return null;

    // Instagram video_versions are sorted highest quality first
    const qualities: VideoQuality[] = videoVersions.map((v, i) => ({
      label: i === 0 ? '1080p' : i === 1 ? '720p' : '360p',
      url: v.url as string,
      type: 'mp4',
    }));

    const thumbnail =
      ((item.image_versions2 as Record<string, unknown>)?.candidates as Array<Record<string, unknown>>)?.[0]
        ?.url as string ?? '';

    const title = (item.caption as Record<string, string>)?.text ?? 'Instagram Reel';

    return {
      id: String(item.id),
      title: title.slice(0, 100),
      thumbnail,
      qualities,
      platform: 'instagram',
      sourceUrl,
    };
  } catch {
    return null;
  }
}

export const instagramAdapter: PlatformAdapter & {
  _parseGraphQL: typeof parseGraphQL;
} = {
  platform: 'instagram',

  matchesUrl(url: string): boolean {
    return /instagram\.com/.test(url);
  },

  detectPageType(url: string): PageType {
    if (/instagram\.com\/reel\/[A-Za-z0-9_-]+/.test(url)) return 'single';
    if (/instagram\.com\/[^/]+\/reels/.test(url)) return 'profile';
    return 'unknown';
  },

  installFetchInterceptor(onVideo) {
    const original = window.fetch.bind(window);
    window.fetch = async function (...args) {
      const response = await original(...args);
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      if (url.includes('/graphql') || url.includes('/api/v1/')) {
        try {
          const clone = response.clone();
          const text = await clone.text();
          const json = JSON.parse(text);
          const info = parseGraphQL(json, window.location.href);
          if (info) onVideo(info);
        } catch { /* not JSON or not a video response */ }
      }
      return response;
    };
    return () => { window.fetch = original; };
  },

  _parseGraphQL: parseGraphQL,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/adapters/instagram.ts tests/adapters/instagram.test.ts
git commit -m "feat: add Instagram platform adapter"
```

---

## Task 8: Platform Adapter — TikTok

**Files:**
- Create: `src/adapters/tiktok.ts`
- Create: `tests/adapters/tiktok.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/adapters/tiktok.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { tiktokAdapter } from '../../src/adapters/tiktok';

describe('tiktokAdapter', () => {
  it('matches tiktok.com URLs', () => {
    expect(tiktokAdapter.matchesUrl('https://www.tiktok.com/@user/video/123')).toBe(true);
    expect(tiktokAdapter.matchesUrl('https://instagram.com/reel/abc')).toBe(false);
  });

  it('detects single video page', () => {
    expect(tiktokAdapter.detectPageType('https://www.tiktok.com/@username/video/7123456789')).toBe('single');
  });

  it('detects profile page', () => {
    expect(tiktokAdapter.detectPageType('https://www.tiktok.com/@username')).toBe('profile');
  });

  it('parses video info from TikTok API response', () => {
    const payload = {
      itemInfo: {
        itemStruct: {
          id: 'tt123',
          desc: 'My TikTok',
          video: {
            playAddr: 'https://v19.tiktokcdn.com/video.mp4',
            downloadAddr: 'https://v19.tiktokcdn.com/download.mp4',
            width: 1080,
            height: 1920,
          },
          video2: {
            qualityType: [
              { playAddr: 'https://v19.tiktokcdn.com/720p.mp4', qualityType: 2 },
            ],
          },
          covers: ['https://p16-sign.tiktokcdn.com/thumb.jpg'],
        },
      },
    };
    const info = tiktokAdapter._parseApiResponse(payload, 'https://tiktok.com/@u/video/tt123');
    expect(info).not.toBeNull();
    expect(info!.platform).toBe('tiktok');
    expect(info!.qualities.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/adapters/tiktok'`

- [ ] **Step 3: Create src/adapters/tiktok.ts**

```typescript
import type { PlatformAdapter, VideoInfo, VideoQuality, PageType } from './types';

function parseApiResponse(payload: unknown, sourceUrl: string): VideoInfo | null {
  try {
    const p = payload as Record<string, unknown>;
    const item =
      (p?.itemInfo as Record<string, unknown>)?.itemStruct ??
      (p?.data as Record<string, unknown>);

    if (!item || typeof item !== 'object') return null;
    const v = item as Record<string, unknown>;
    if (!v.id) return null;

    const qualities: VideoQuality[] = [];
    const video = v.video as Record<string, unknown> | undefined;

    if (typeof video?.playAddr === 'string') {
      qualities.push({ label: '1080p', url: video.playAddr, type: 'mp4' });
    }
    if (typeof video?.downloadAddr === 'string' && video.downloadAddr !== video.playAddr) {
      qualities.push({ label: '720p', url: video.downloadAddr as string, type: 'mp4' });
    }

    // Some responses include multiple quality tiers in video2
    const video2 = v.video2 as Record<string, unknown> | undefined;
    const qualityTypes = video2?.qualityType as Array<Record<string, unknown>> | undefined;
    if (qualityTypes?.length) {
      qualityTypes.forEach((q, i) => {
        if (typeof q.playAddr === 'string' && !qualities.find(x => x.url === q.playAddr)) {
          qualities.push({ label: `quality-${i}`, url: q.playAddr, type: 'mp4' });
        }
      });
    }

    if (qualities.length === 0) return null;

    const covers = v.covers as string[] | undefined;
    const thumbnail = covers?.[0] ?? '';

    return {
      id: String(v.id),
      title: (v.desc as string)?.slice(0, 100) ?? 'TikTok Video',
      thumbnail,
      qualities,
      platform: 'tiktok',
      sourceUrl,
    };
  } catch {
    return null;
  }
}

export const tiktokAdapter: PlatformAdapter & {
  _parseApiResponse: typeof parseApiResponse;
} = {
  platform: 'tiktok',

  matchesUrl(url: string): boolean {
    return /tiktok\.com/.test(url);
  },

  detectPageType(url: string): PageType {
    if (/tiktok\.com\/@[^/]+\/video\/\d+/.test(url)) return 'single';
    if (/tiktok\.com\/@[^/]+$/.test(url) || /tiktok\.com\/@[^/]+\/?$/.test(url)) return 'profile';
    return 'unknown';
  },

  installFetchInterceptor(onVideo) {
    const original = window.fetch.bind(window);
    window.fetch = async function (...args) {
      const response = await original(...args);
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      if (url.includes('/api/item/detail') || url.includes('/api/post/item_list')) {
        try {
          const clone = response.clone();
          const text = await clone.text();
          const json = JSON.parse(text);
          const info = parseApiResponse(json, window.location.href);
          if (info) onVideo(info);
        } catch { /* not a video response */ }
      }
      return response;
    };
    return () => { window.fetch = original; };
  },

  _parseApiResponse: parseApiResponse,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/adapters/tiktok.ts tests/adapters/tiktok.test.ts
git commit -m "feat: add TikTok platform adapter"
```

---

## Task 9: Platform Detector

**Files:**
- Create: `src/content/platform-detector.ts`
- Create: `tests/content/platform-detector.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/content/platform-detector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../../src/content/platform-detector';

describe('detectPlatform', () => {
  it('detects facebook single reel', () => {
    const result = detectPlatform('https://www.facebook.com/reel/123456789');
    expect(result?.platform).toBe('facebook');
    expect(result?.pageType).toBe('single');
  });

  it('detects instagram profile reels', () => {
    const result = detectPlatform('https://www.instagram.com/natgeo/reels/');
    expect(result?.platform).toBe('instagram');
    expect(result?.pageType).toBe('profile');
  });

  it('detects tiktok single video', () => {
    const result = detectPlatform('https://www.tiktok.com/@charlidamelio/video/7123456789');
    expect(result?.platform).toBe('tiktok');
    expect(result?.pageType).toBe('single');
  });

  it('returns null for unknown URLs', () => {
    expect(detectPlatform('https://youtube.com/watch?v=abc')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/content/platform-detector'`

- [ ] **Step 3: Create src/content/platform-detector.ts**

```typescript
import type { Platform, PageType } from '../adapters/types';
import { facebookAdapter } from '../adapters/facebook';
import { instagramAdapter } from '../adapters/instagram';
import { tiktokAdapter } from '../adapters/tiktok';

const ADAPTERS = [facebookAdapter, instagramAdapter, tiktokAdapter];

export interface DetectedPlatform {
  platform: Platform;
  pageType: PageType;
}

export function detectPlatform(url: string): DetectedPlatform | null {
  for (const adapter of ADAPTERS) {
    if (adapter.matchesUrl(url)) {
      const pageType = adapter.detectPageType(url);
      return { platform: adapter.platform, pageType };
    }
  }
  return null;
}

export function getAdapter(platform: Platform) {
  return ADAPTERS.find(a => a.platform === platform) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/content/platform-detector.ts tests/content/platform-detector.test.ts
git commit -m "feat: add platform detector"
```

---

## Task 10: Background Service Worker

**Files:**
- Create: `entrypoints/background.ts`
- Create: `src/background/request-interceptor.ts`

- [ ] **Step 1: Create src/background/request-interceptor.ts**

This captures raw CDN video URLs as a fallback when fetch interception misses something (e.g. video preloaded before content script runs):

```typescript
/** Observed CDN video URLs keyed by tab ID */
const tabVideoUrls = new Map<number, Set<string>>();

const CDN_VIDEO_PATTERN = /\.(mp4|m4v)(\?|$)/i;
const DASH_PATTERN = /dash|manifest\.mpd/i;

export function installRequestInterceptor(): void {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const { tabId, url, type } = details;
      if (tabId < 0) return;
      if (type !== 'media' && type !== 'xmlhttprequest' && type !== 'other') return;
      if (!CDN_VIDEO_PATTERN.test(url) && !DASH_PATTERN.test(url)) return;

      if (!tabVideoUrls.has(tabId)) {
        tabVideoUrls.set(tabId, new Set());
      }
      tabVideoUrls.get(tabId)!.add(url);
    },
    {
      urls: [
        '*://*.fbcdn.net/*',
        '*://*.cdninstagram.com/*',
        '*://*.tiktokcdn.com/*',
        '*://*.tiktokv.com/*',
      ],
    },
    [],
  );

  // Clean up when tab closes
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabVideoUrls.delete(tabId);
  });
}

export function getTabVideoUrls(tabId: number): string[] {
  return Array.from(tabVideoUrls.get(tabId) ?? []);
}
```

- [ ] **Step 2: Create entrypoints/background.ts**

```typescript
import { defineBackground } from 'wxt/sandbox';
import { DownloadQueue } from '../src/background/download-queue';
import { addHistoryEntry, getHistory, clearHistory } from '../src/background/history-store';
import { mergeDashToMp4 } from '../src/background/ffmpeg-merge';
import { installRequestInterceptor } from '../src/background/request-interceptor';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../src/shared/storage';
import type { DownloadJob, VideoQuality } from '../src/adapters/types';
import type { AnyMessage, ContentToBackground, SidePanelToBackground } from '../src/shared/messages';

export default defineBackground(() => {
  installRequestInterceptor();

  let settings = { ...DEFAULT_SETTINGS };
  // Load settings on startup
  getSettings().then(s => { settings = s; });

  let queue: DownloadQueue;

  function broadcastQueueUpdate(jobs: DownloadJob[]) {
    chrome.runtime.sendMessage({ type: 'QUEUE_UPDATE', payload: jobs }).catch(() => {});
  }

  async function executeJob(job: DownloadJob, onProgress: (p: number) => void): Promise<void> {
    const quality: VideoQuality | undefined = job.videoInfo.qualities.find(
      q => q.label === job.selectedQuality,
    ) ?? job.videoInfo.qualities[0];

    if (!quality) throw new Error('No quality available');

    if (quality.type === 'dash' && quality.audioUrl) {
      // DASH: merge video + audio
      job.status = 'merging';
      broadcastQueueUpdate(queue.getJobs());
      const blob = await mergeDashToMp4(quality.url, quality.audioUrl, onProgress);
      const blobUrl = URL.createObjectURL(blob);
      await chrome.downloads.download({
        url: blobUrl,
        filename: `${job.videoInfo.platform}_${job.videoInfo.id}.mp4`,
        saveAs: false,
      });
    } else {
      // Direct MP4
      await chrome.downloads.download({
        url: quality.url,
        filename: `${job.videoInfo.platform}_${job.videoInfo.id}.mp4`,
        saveAs: false,
      });
      onProgress(100);
    }
  }

  queue = new DownloadQueue({
    concurrency: settings.concurrency,
    onUpdate: broadcastQueueUpdate,
    onComplete: async (job) => {
      await addHistoryEntry({
        id: job.videoInfo.id,
        title: job.videoInfo.title,
        platform: job.videoInfo.platform,
        sourceUrl: job.videoInfo.sourceUrl,
        downloadedAt: Date.now(),
      });
      const history = await getHistory();
      chrome.runtime.sendMessage({ type: 'HISTORY_UPDATE', payload: history }).catch(() => {});
    },
    _executeJob: executeJob,
  });

  chrome.runtime.onMessage.addListener((message: AnyMessage, _sender, sendResponse) => {
    const msg = message as ContentToBackground & SidePanelToBackground;

    if (msg.type === 'BULK_DOWNLOAD_REQUEST') {
      const { videos, quality } = msg.payload;
      videos.forEach((v, i) => {
        queue.add({
          id: `${v.id}-${Date.now()}-${i}`,
          videoInfo: v,
          selectedQuality: quality,
          status: 'pending',
          progress: 0,
          retryCount: 0,
        });
      });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'GET_QUEUE') {
      sendResponse({ payload: queue.getJobs() });
      return true;
    }

    if (msg.type === 'GET_HISTORY') {
      getHistory().then(h => sendResponse({ payload: h }));
      return true;
    }

    if (msg.type === 'GET_SETTINGS') {
      sendResponse({ payload: settings });
      return true;
    }

    if (msg.type === 'UPDATE_SETTINGS') {
      settings = { ...settings, ...msg.payload };
      saveSettings(settings);
      queue.updateConcurrency(settings.concurrency);
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'CLEAR_HISTORY') {
      clearHistory().then(() => sendResponse({ ok: true }));
      return true;
    }

    if (msg.type === 'CANCEL_JOB') {
      // Mark as error to stop queue processing
      sendResponse({ ok: true });
      return true;
    }
  });

  // Open side panel when extension icon clicked
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
      chrome.sidePanel.open({ tabId: tab.id });
    }
  });
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/background.ts src/background/request-interceptor.ts
git commit -m "feat: add background service worker with download queue wiring"
```

---

## Task 11: Content Script — Fetch Interceptor + Single Reel Button

**Files:**
- Create: `src/content/fetch-interceptor.ts`
- Create: `src/content/ui/single-button.tsx`
- Create: `entrypoints/content/index.ts`

- [ ] **Step 1: Create src/content/fetch-interceptor.ts**

```typescript
import type { VideoInfo } from '../adapters/types';
import { facebookAdapter } from '../adapters/facebook';
import { instagramAdapter } from '../adapters/instagram';
import { tiktokAdapter } from '../adapters/tiktok';
import { getAdapter } from './platform-detector';
import type { Platform } from '../adapters/types';

/** Must run in MAIN world to access window.fetch */
export function installFetchInterceptorForPlatform(
  platform: Platform,
  onVideo: (info: VideoInfo) => void,
): () => void {
  const adapter = getAdapter(platform);
  if (!adapter) return () => {};
  return adapter.installFetchInterceptor(onVideo);
}
```

- [ ] **Step 2: Create src/content/ui/single-button.tsx**

```tsx
import { render, h } from 'preact';
import { useState } from 'preact/hooks';
import type { VideoInfo, VideoQuality } from '../../adapters/types';

interface Props {
  videoInfo: VideoInfo;
  onDownload: (quality: VideoQuality) => void;
}

function SingleDownloadButton({ videoInfo, onDownload }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div class="fixed bottom-4 right-4 z-[999999] font-sans">
      {open && (
        <div class="mb-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden min-w-[160px]">
          <div class="px-3 py-2 text-xs font-semibold text-gray-500 border-b">Select Quality</div>
          {videoInfo.qualities.map(q => (
            <button
              key={q.label}
              class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-600"
              onClick={() => { onDownload(q); setOpen(false); }}
            >
              {q.label} ({q.type.toUpperCase()})
            </button>
          ))}
        </div>
      )}
      <button
        class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
        onClick={() => setOpen(o => !o)}
      >
        ⬇ Download
      </button>
    </div>
  );
}

let mountPoint: HTMLDivElement | null = null;

export function showSingleDownloadButton(
  videoInfo: VideoInfo,
  onDownload: (quality: VideoQuality) => void,
): void {
  if (!mountPoint) {
    mountPoint = document.createElement('div');
    mountPoint.id = 'social-downloader-single-btn';
    document.body.appendChild(mountPoint);
  }
  render(h(SingleDownloadButton, { videoInfo, onDownload }), mountPoint);
}

export function hideSingleDownloadButton(): void {
  if (mountPoint) {
    render(null, mountPoint);
  }
}
```

- [ ] **Step 3: Create entrypoints/content/index.ts (MAIN world entry)**

```typescript
import { defineContentScript } from 'wxt/sandbox';
import { detectPlatform, getAdapter } from '../../src/content/platform-detector';
import { showSingleDownloadButton, hideSingleDownloadButton } from '../../src/content/ui/single-button';
import type { VideoInfo, VideoQuality } from '../../src/adapters/types';

export default defineContentScript({
  matches: [
    '*://*.facebook.com/*',
    '*://*.instagram.com/*',
    '*://*.tiktok.com/*',
  ],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    let currentVideo: VideoInfo | null = null;
    let cleanupInterceptor: (() => void) | null = null;

    function handleVideoFound(info: VideoInfo) {
      currentVideo = info;
      if (detected?.pageType === 'single') {
        showSingleDownloadButton(info, handleDownload);
      }
      // For profile pages, forward to bulk panel via postMessage (isolated world reads it)
      window.postMessage({ type: '__SD_VIDEO_FOUND__', payload: info }, '*');
    }

    function handleDownload(quality: VideoQuality) {
      if (!currentVideo) return;
      window.postMessage({
        type: '__SD_DOWNLOAD__',
        payload: { videoInfo: currentVideo, quality: quality.label },
      }, '*');
    }

    const detected = detectPlatform(window.location.href);
    if (!detected) return;

    const adapter = getAdapter(detected.platform);
    if (!adapter) return;

    cleanupInterceptor = adapter.installFetchInterceptor(handleVideoFound);

    // Re-detect on navigation (SPA)
    const observer = new MutationObserver(() => {
      const newDetected = detectPlatform(window.location.href);
      if (!newDetected || newDetected.pageType !== detected.pageType) {
        hideSingleDownloadButton();
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
  },
});
```

- [ ] **Step 4: Verify dev build works**

```bash
npm run dev
```

Load extension in Chrome, open `https://www.instagram.com/reel/` — should see no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/content/fetch-interceptor.ts src/content/ui/single-button.tsx entrypoints/content/index.ts
git commit -m "feat: add content script with fetch interceptor and single reel download button"
```

---

## Task 12: Content Script — Bulk Panel

**Files:**
- Create: `src/content/ui/bulk-panel.tsx`
- Create: `entrypoints/content-isolated/index.ts` (ISOLATED world — reads postMessage, shows bulk panel UI)

> Note: The bulk panel runs in ISOLATED world (can access `chrome.runtime`). The MAIN world content script (Task 11) sends video data via `window.postMessage`. The ISOLATED world receives it and forwards to the background SW.

- [ ] **Step 1: Create src/content/ui/bulk-panel.tsx**

```tsx
import { render, h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { VideoInfo } from '../../adapters/types';

interface Props {
  initialVideos?: VideoInfo[];
  onDownloadSelected: (videos: VideoInfo[], quality: string) => void;
  onClose: () => void;
}

function BulkPanel({ initialVideos = [], onDownloadSelected, onClose }: Props) {
  const [videos, setVideos] = useState<VideoInfo[]>(initialVideos);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quality, setQuality] = useState('highest');
  const [scanning, setScanning] = useState(true);
  const [scanCount, setScanCount] = useState(0);

  useEffect(() => {
    // Listen for new videos discovered by MAIN world fetch interceptor
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== '__SD_VIDEO_FOUND__') return;
      const info = e.data.payload as VideoInfo;
      setVideos(prev => {
        if (prev.find(v => v.id === info.id)) return prev;
        setScanCount(c => c + 1);
        return [...prev, info];
      });
    };
    window.addEventListener('message', handler);

    // Auto-scroll to trigger lazy loading of more reels
    const scrollInterval = setInterval(() => {
      window.scrollBy(0, window.innerHeight);
    }, 1500);

    // Stop scanning after 30 seconds
    const timeout = setTimeout(() => {
      setScanning(false);
      clearInterval(scrollInterval);
    }, 30_000);

    return () => {
      window.removeEventListener('message', handler);
      clearInterval(scrollInterval);
      clearTimeout(timeout);
    };
  }, []);

  const toggleAll = () => {
    if (selected.size === videos.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(videos.map(v => v.id)));
    }
  };

  const selectedVideos = videos.filter(v => selected.has(v.id));

  // Get unique quality labels across all selected videos
  const availableQualities = ['highest', '1080p', '720p', '360p'];

  return (
    <div class="fixed top-4 right-4 z-[999999] w-80 bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col max-h-[80vh] font-sans text-sm">
      <div class="flex items-center justify-between px-4 py-3 border-b bg-gray-50 rounded-t-xl">
        <span class="font-semibold text-gray-800">
          {scanning ? `Scanning... (${scanCount} found)` : `${videos.length} Reels Found`}
        </span>
        <button class="text-gray-400 hover:text-gray-600 text-lg leading-none" onClick={onClose}>✕</button>
      </div>

      <div class="flex items-center gap-2 px-4 py-2 border-b bg-gray-50">
        <input
          type="checkbox"
          checked={selected.size === videos.length && videos.length > 0}
          onChange={toggleAll}
          id="select-all"
        />
        <label for="select-all" class="text-gray-600 cursor-pointer">Select all</label>
        <select
          class="ml-auto border rounded px-2 py-1 text-xs"
          value={quality}
          onChange={e => setQuality((e.target as HTMLSelectElement).value)}
        >
          {availableQualities.map(q => <option value={q}>{q}</option>)}
        </select>
      </div>

      <div class="overflow-y-auto flex-1 divide-y divide-gray-100">
        {videos.map(v => (
          <div key={v.id} class="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={selected.has(v.id)}
              onChange={() => {
                setSelected(prev => {
                  const next = new Set(prev);
                  next.has(v.id) ? next.delete(v.id) : next.add(v.id);
                  return next;
                });
              }}
            />
            <img src={v.thumbnail} class="w-10 h-10 rounded object-cover bg-gray-200" alt="" />
            <span class="truncate flex-1 text-gray-700">{v.title || v.id}</span>
          </div>
        ))}
        {videos.length === 0 && (
          <div class="px-4 py-8 text-center text-gray-400">
            {scanning ? 'Scrolling to find reels...' : 'No reels found'}
          </div>
        )}
      </div>

      <div class="px-4 py-3 border-t">
        <button
          disabled={selectedVideos.length === 0}
          class="w-full bg-blue-600 disabled:bg-gray-300 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 transition-colors"
          onClick={() => onDownloadSelected(selectedVideos, quality)}
        >
          Download {selectedVideos.length > 0 ? `${selectedVideos.length} videos` : ''}
        </button>
      </div>
    </div>
  );
}

let mountPoint: HTMLDivElement | null = null;

export function showBulkPanel(
  onDownloadSelected: (videos: VideoInfo[], quality: string) => void,
): void {
  if (mountPoint) return; // Already open
  mountPoint = document.createElement('div');
  mountPoint.id = 'social-downloader-bulk-panel';
  document.body.appendChild(mountPoint);
  render(
    h(BulkPanel, {
      onDownloadSelected,
      onClose: () => {
        if (mountPoint) {
          render(null, mountPoint);
          mountPoint.remove();
          mountPoint = null;
        }
      },
    }),
    mountPoint,
  );
}
```

- [ ] **Step 2: Create entrypoints/content-isolated/index.ts**

```typescript
import { defineContentScript } from 'wxt/sandbox';
import { detectPlatform } from '../../src/content/platform-detector';
import { showBulkPanel } from '../../src/content/ui/bulk-panel';
import type { VideoInfo } from '../../src/adapters/types';
import type { ContentToBackground } from '../../src/shared/messages';

export default defineContentScript({
  matches: [
    '*://*.facebook.com/*',
    '*://*.instagram.com/*',
    '*://*.tiktok.com/*',
  ],
  world: 'ISOLATED',
  runAt: 'document_idle',

  main() {
    const detected = detectPlatform(window.location.href);
    if (!detected) return;

    // Show bulk panel on profile pages
    if (detected.pageType === 'profile') {
      showBulkPanel((videos: VideoInfo[], quality: string) => {
        const msg: ContentToBackground = {
          type: 'BULK_DOWNLOAD_REQUEST',
          payload: { videos, quality },
        };
        chrome.runtime.sendMessage(msg);
      });
    }

    // Forward single download requests from MAIN world to background
    window.addEventListener('message', (e) => {
      if (e.data?.type === '__SD_DOWNLOAD__') {
        const { videoInfo, quality } = e.data.payload;
        chrome.runtime.sendMessage({
          type: 'BULK_DOWNLOAD_REQUEST',
          payload: { videos: [videoInfo], quality },
        });
      }
    });
  },
});
```

- [ ] **Step 3: Verify dev build**

```bash
npm run dev
```

Open `https://www.facebook.com/natgeo/reels` — bulk panel should appear on right side. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/content/ui/bulk-panel.tsx entrypoints/content-isolated/index.ts
git commit -m "feat: add bulk download panel for profile reels pages"
```

---

## Task 13: Side Panel UI

**Files:**
- Create: `entrypoints/sidepanel/index.html`
- Create: `entrypoints/sidepanel/main.tsx`
- Create: `src/sidepanel/App.tsx`
- Create: `src/sidepanel/QueueTab.tsx`
- Create: `src/sidepanel/HistoryTab.tsx`
- Create: `src/sidepanel/SettingsTab.tsx`

- [ ] **Step 1: Create entrypoints/sidepanel/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Social Downloader</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create src/sidepanel/QueueTab.tsx**

```tsx
import { h } from 'preact';
import type { DownloadJob } from '../adapters/types';

const STATUS_ICON: Record<string, string> = {
  pending: '⏳',
  downloading: '⬇',
  merging: '⚙',
  done: '✅',
  error: '❌',
};

interface Props { jobs: DownloadJob[] }

export function QueueTab({ jobs }: Props) {
  if (jobs.length === 0) {
    return (
      <div class="flex-1 flex items-center justify-center text-gray-400 text-sm">
        No downloads yet
      </div>
    );
  }
  return (
    <div class="flex-1 overflow-y-auto divide-y divide-gray-100">
      {jobs.map(job => (
        <div key={job.id} class="px-4 py-3">
          <div class="flex items-center gap-2 mb-1">
            <span>{STATUS_ICON[job.status] ?? '?'}</span>
            <span class="flex-1 truncate text-sm text-gray-800">{job.videoInfo.title}</span>
            <span class="text-xs text-gray-400 capitalize">{job.status}</span>
          </div>
          {(job.status === 'downloading' || job.status === 'merging') && (
            <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          )}
          {job.status === 'error' && (
            <p class="text-xs text-red-500 mt-1">{job.error}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create src/sidepanel/HistoryTab.tsx**

```tsx
import { h } from 'preact';
import type { HistoryEntry } from '../adapters/types';

const PLATFORM_EMOJI: Record<string, string> = {
  facebook: '📘', instagram: '📸', tiktok: '🎵',
};

interface Props {
  history: HistoryEntry[];
  onClear: () => void;
}

export function HistoryTab({ history, onClear }: Props) {
  if (history.length === 0) {
    return (
      <div class="flex-1 flex items-center justify-center text-gray-400 text-sm">
        No download history
      </div>
    );
  }
  return (
    <div class="flex flex-col flex-1 overflow-hidden">
      <div class="px-4 py-2 flex justify-end border-b">
        <button
          class="text-xs text-red-500 hover:underline"
          onClick={onClear}
        >
          Clear all
        </button>
      </div>
      <div class="flex-1 overflow-y-auto divide-y divide-gray-100">
        {history.map(entry => (
          <div key={entry.id} class="px-4 py-3">
            <div class="flex items-center gap-2">
              <span>{PLATFORM_EMOJI[entry.platform] ?? '🎬'}</span>
              <span class="flex-1 truncate text-sm text-gray-800">{entry.title}</span>
            </div>
            <div class="text-xs text-gray-400 mt-0.5 ml-6">
              {new Date(entry.downloadedAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create src/sidepanel/SettingsTab.tsx**

```tsx
import { h } from 'preact';
import type { Settings } from '../adapters/types';

interface Props {
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
}

export function SettingsTab({ settings, onChange }: Props) {
  return (
    <div class="flex-1 px-4 py-6 space-y-6">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Parallel Downloads: {settings.concurrency}
        </label>
        <input
          type="range"
          min={1} max={5} step={1}
          value={settings.concurrency}
          onInput={e => onChange({ concurrency: Number((e.target as HTMLInputElement).value) })}
          class="w-full"
        />
        <div class="flex justify-between text-xs text-gray-400 mt-1">
          <span>1 (slow, safe)</span>
          <span>5 (fast, may be blocked)</span>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Default Quality</label>
        <select
          class="w-full border rounded-lg px-3 py-2 text-sm"
          value={settings.defaultQuality}
          onChange={e => onChange({ defaultQuality: (e.target as HTMLSelectElement).value })}
        >
          <option value="highest">Highest available</option>
          <option value="1080p">1080p</option>
          <option value="720p">720p</option>
          <option value="360p">360p</option>
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create src/sidepanel/App.tsx**

```tsx
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { QueueTab } from './QueueTab';
import { HistoryTab } from './HistoryTab';
import { SettingsTab } from './SettingsTab';
import type { DownloadJob, HistoryEntry, Settings } from '../adapters/types';
import { DEFAULT_SETTINGS } from '../shared/storage';

type Tab = 'queue' | 'history' | 'settings';

export function App() {
  const [tab, setTab] = useState<Tab>('queue');
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    // Load initial state
    chrome.runtime.sendMessage({ type: 'GET_QUEUE' }, r => setJobs(r?.payload ?? []));
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, r => setHistory(r?.payload ?? []));
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, r => setSettings(r?.payload ?? DEFAULT_SETTINGS));

    // Subscribe to live updates
    const listener = (msg: { type: string; payload: unknown }) => {
      if (msg.type === 'QUEUE_UPDATE') setJobs(msg.payload as DownloadJob[]);
      if (msg.type === 'HISTORY_UPDATE') setHistory(msg.payload as HistoryEntry[]);
      if (msg.type === 'SETTINGS_UPDATE') setSettings(msg.payload as Settings);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  function handleSettingsChange(partial: Partial<Settings>) {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', payload: partial });
  }

  function handleClearHistory() {
    chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => setHistory([]));
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'queue', label: '⬇ Queue' },
    { key: 'history', label: '📋 History' },
    { key: 'settings', label: '⚙ Settings' },
  ];

  return (
    <div class="flex flex-col h-screen bg-white text-gray-900">
      <div class="flex border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            class={`flex-1 py-3 text-xs font-medium transition-colors ${
              tab === t.key
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'queue' && <QueueTab jobs={jobs} />}
      {tab === 'history' && <HistoryTab history={history} onClear={handleClearHistory} />}
      {tab === 'settings' && <SettingsTab settings={settings} onChange={handleSettingsChange} />}
    </div>
  );
}
```

- [ ] **Step 6: Create entrypoints/sidepanel/main.tsx**

```tsx
import { render, h } from 'preact';
import { App } from '../../src/sidepanel/App';
import '../../src/style.css';

render(h(App, {}), document.getElementById('app')!);
```

- [ ] **Step 7: Build and verify**

```bash
npm run build
```

Expected: Build succeeds in `.output/chrome-mv3/`. Load in Chrome, click extension icon — side panel should open with Queue/History/Settings tabs.

- [ ] **Step 8: Commit**

```bash
git add entrypoints/sidepanel/ src/sidepanel/
git commit -m "feat: add side panel UI with queue, history, and settings tabs"
```

---

## Task 14: Manual Integration Test

This task verifies the full end-to-end flow in Chrome.

- [ ] **Step 1: Build production bundle**

```bash
npm run build
```

Load `.output/chrome-mv3/` as unpacked extension.

- [ ] **Step 2: Test Instagram single reel**

1. Open `https://www.instagram.com/` and navigate to any Reel
2. Verify: Download button appears in bottom-right corner
3. Click Download → select quality → verify `.mp4` file downloads to Downloads folder

- [ ] **Step 3: Test Instagram bulk profile**

1. Open `https://www.instagram.com/<any-public-profile>/reels/`
2. Verify: Bulk panel appears on right side
3. Verify: Thumbnails populate as page scrolls
4. Select 2-3 videos → Download Selected
5. Verify: Side panel Queue tab shows jobs with progress bars
6. Verify: Files appear in Downloads folder

- [ ] **Step 4: Test Facebook reels**

1. Open `https://www.facebook.com/watch/reels/`
2. Play a Reel → verify Download button appears
3. Download and verify MP4

- [ ] **Step 5: Test TikTok**

1. Open `https://www.tiktok.com/@charlidamelio` (any public profile)
2. Verify bulk panel appears
3. Select and download 1 video, verify MP4

- [ ] **Step 6: Test history**

1. After downloads complete, open side panel → History tab
2. Verify downloaded videos appear with timestamps

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: social downloader extension v1.0 complete"
```

---

## Notes for Implementation

1. **GraphQL schema changes**: FB/IG frequently update their GraphQL response shapes. Log raw response JSON during development (`console.log`) to verify field names before hardcoding parsers.

2. **ffmpeg.wasm offline**: The wasm core is loaded from unpkg CDN at runtime. If offline, DASH merging will fail — MP4 direct links still work. For fully offline support, bundle wasm files in `public/` and reference them via `chrome.runtime.getURL()`.

3. **TikTok watermark**: `playAddr` on TikTok may include watermark. `downloadAddr` typically does not. Both are captured — user can choose.

4. **Rate limiting on bulk scroll**: The 1500ms scroll interval is conservative. If FB/IG starts 429-ing, increase to 2500ms.

5. **SPA navigation**: Facebook and Instagram are SPAs. The fetch interceptor is installed once at `document_start` and persists across route changes — no need to re-inject.
