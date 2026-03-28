import { describe, it, expect } from 'vitest';
import type { VideoInfo, DownloadJob } from '../../src/adapters/types';

describe('types', () => {
  it('VideoInfo has required fields', () => {
    const info: VideoInfo = {
      id: 'test-id', title: 'Test Video', thumbnail: 'https://example.com/thumb.jpg',
      qualities: [{ label: '1080p', url: 'https://cdn.example.com/video.mp4', type: 'mp4' }],
      platform: 'facebook', sourceUrl: 'https://facebook.com/reel/123',
    };
    expect(info.id).toBe('test-id');
    expect(info.qualities[0].type).toBe('mp4');
  });

  it('DownloadJob starts as pending', () => {
    const job: DownloadJob = {
      id: 'job-1',
      videoInfo: { id: 'v1', title: 'V', thumbnail: '', qualities: [], platform: 'instagram', sourceUrl: '' },
      selectedQuality: '1080p', status: 'pending', progress: 0, retryCount: 0,
    };
    expect(job.status).toBe('pending');
  });
});
