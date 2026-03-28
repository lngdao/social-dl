import type { PlatformAdapter, VideoInfo, VideoQuality, PageType } from './types';

function parseGraphQL(payload: unknown, sourceUrl: string): VideoInfo | null {
  try {
    const p = payload as Record<string, unknown>;
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

    const titleText = (v.title as Record<string, string>)?.text ?? (v.name as string) ?? 'Facebook Video';
    const thumbnail = ((v.thumbnails as Record<string, unknown>)?.edges as Array<Record<string, unknown>>)?.[0]?.node?.uri as string ?? '';

    return { id: String(v.id), title: titleText, thumbnail, qualities, platform: 'facebook', sourceUrl };
  } catch { return null; }
}

export const facebookAdapter: PlatformAdapter & { _parseGraphQL: typeof parseGraphQL } = {
  platform: 'facebook',
  matchesUrl: (url) => /facebook\.com/.test(url),
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
        } catch { /* not JSON */ }
      }
      return response;
    };
    return () => { window.fetch = original; };
  },
  _parseGraphQL: parseGraphQL,
};
