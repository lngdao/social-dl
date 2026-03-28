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
      return { platform: adapter.platform, pageType: adapter.detectPageType(url) };
    }
  }
  return null;
}

export function getAdapter(platform: Platform) {
  return ADAPTERS.find(a => a.platform === platform) ?? null;
}
