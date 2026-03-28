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

  it('parses DASH representations from real Facebook response structure', () => {
    const payload = {
      data: {
        attachments: [{
          media: {
            __typename: 'Video',
            id: '921974297205353',
            shareable_url: 'https://www.facebook.com/reel/921974297205353',
          },
        }],
        url: 'https://www.facebook.com/reel/921974297205353/',
      },
      extensions: {
        all_video_dash_prefetch_representations: [{
          video_id: '921974297205353',
          representations: [
            { representation_id: '1204630948513938v', mime_type: 'video/mp4', codecs: 'vp09.00.21.08.00.01.01.01.00', base_url: 'https://scontent.fbcdn.net/video-hd.mp4', bandwidth: 2000000, height: 1080 },
            { representation_id: '1204630948513939v', mime_type: 'video/mp4', codecs: 'vp09.00.21.08.00.01.01.01.00', base_url: 'https://scontent.fbcdn.net/video-sd.mp4', bandwidth: 800000, height: 720 },
            { representation_id: '1204630948513940a', mime_type: 'audio/mp4', codecs: 'mp4a.40.2', base_url: 'https://scontent.fbcdn.net/audio.mp4', bandwidth: 128000 },
          ],
          nextgendash: true,
        }],
      },
    };

    const info = facebookAdapter._parseGraphQL(payload, 'https://facebook.com/reel/921974297205353');
    expect(info).not.toBeNull();
    expect(info!.id).toBe('921974297205353');
    expect(info!.qualities.length).toBeGreaterThanOrEqual(2);
    // First quality should be "Best (video only)" — direct MP4
    expect(info!.qualities[0].label).toBe('Best (video only)');
    expect(info!.qualities[0].type).toBe('mp4');
    expect(info!.qualities[0].url).toContain('video-hd.mp4');
    // Second should be 1080p with audio URL (DASH)
    expect(info!.qualities[1].label).toBe('1080p');
    expect(info!.qualities[1].type).toBe('dash');
    expect(info!.qualities[1].audioUrl).toContain('audio.mp4');
  });
});
