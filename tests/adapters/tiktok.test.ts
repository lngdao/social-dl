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
            width: 1080, height: 1920,
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
