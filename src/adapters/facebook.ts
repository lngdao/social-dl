import type { PlatformAdapter, VideoInfo, VideoQuality, PageType } from './types';
import { installInterceptors } from './interceptor-utils';

function parseVideoNode(node: Record<string, unknown>, sourceUrl: string): VideoInfo | null {
  try {
    // Try to find video data - Facebook uses many different shapes
    let v = node;

    // If this is a wrapper with data.video, unwrap
    if (v.data && typeof v.data === 'object') {
      const data = v.data as Record<string, unknown>;
      if (data.video && typeof data.video === 'object') {
        v = data.video as Record<string, unknown>;
      }
    }

    const qualities: VideoQuality[] = [];

    // Standard Facebook video fields
    if (typeof v.playable_url_quality_hd === 'string') {
      qualities.push({ label: '1080p', url: v.playable_url_quality_hd, type: 'mp4' });
    }
    if (typeof v.playable_url === 'string') {
      qualities.push({ label: '720p', url: v.playable_url, type: 'mp4' });
    }
    // browser_native_hd_url / browser_native_sd_url (another common pattern)
    if (typeof v.browser_native_hd_url === 'string') {
      qualities.push({ label: '1080p', url: v.browser_native_hd_url, type: 'mp4' });
    }
    if (typeof v.browser_native_sd_url === 'string') {
      qualities.push({ label: '720p', url: v.browser_native_sd_url, type: 'mp4' });
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const uniqueQualities = qualities.filter(q => {
      if (seen.has(q.url)) return false;
      seen.add(q.url);
      return true;
    });

    if (uniqueQualities.length === 0) return null;

    // Try multiple ID fields
    const id = String(v.id ?? v.videoId ?? v.video_id ?? '');
    if (!id) return null;

    const titleText =
      (v.title as Record<string, string>)?.text ??
      (v.name as string) ??
      (v.message as Record<string, string>)?.text ??
      'Facebook Video';

    const thumbnail =
      ((v.thumbnails as Record<string, unknown>)?.edges as Array<Record<string, unknown>>)?.[0]?.node?.uri as string ??
      ((v.preferred_thumbnail as Record<string, unknown>)?.image as Record<string, unknown>)?.uri as string ??
      (v.thumbnailImage as Record<string, unknown>)?.uri as string ??
      '';

    return { id, title: titleText.slice(0, 100), thumbnail, qualities: uniqueQualities, platform: 'facebook', sourceUrl };
  } catch { return null; }
}

export const facebookAdapter: PlatformAdapter & { _parseGraphQL: typeof parseVideoNode } = {
  platform: 'facebook',
  matchesUrl: (url) => /facebook\.com/.test(url),
  detectPageType(url: string): PageType {
    if (/facebook\.com\/reel\/\d+/.test(url)) return 'single';
    if (/facebook\.com\/watch/.test(url)) return 'single';
    if (/\/reels/.test(url) || /sk=reels/.test(url)) return 'profile';
    return 'unknown';
  },
  installFetchInterceptor(onVideo) {
    return installInterceptors({
      urlPatterns: ['/graphql', 'graph.facebook.com', '/api/graphql'],
      parseVideoNode,
      platformName: 'Facebook',
    }, onVideo);
  },
  _parseGraphQL: parseVideoNode,
};
