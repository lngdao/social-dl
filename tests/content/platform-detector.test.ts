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
