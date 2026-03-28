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
