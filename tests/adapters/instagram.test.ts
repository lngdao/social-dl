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
