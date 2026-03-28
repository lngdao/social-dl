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
