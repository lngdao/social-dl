import type { PlatformAdapter, VideoInfo, VideoQuality, PageType } from './types';

function parseApiResponse(payload: unknown, sourceUrl: string): VideoInfo | null {
  try {
    const p = payload as Record<string, unknown>;
    const item = (p?.itemInfo as Record<string, unknown>)?.itemStruct ?? (p?.data as Record<string, unknown>);
    if (!item || typeof item !== 'object') return null;
    const v = item as Record<string, unknown>;
    if (!v.id) return null;

    const qualities: VideoQuality[] = [];
    const video = v.video as Record<string, unknown> | undefined;
    if (typeof video?.playAddr === 'string') {
      qualities.push({ label: '1080p', url: video.playAddr, type: 'mp4' });
    }
    if (typeof video?.downloadAddr === 'string' && video.downloadAddr !== video.playAddr) {
      qualities.push({ label: '720p', url: video.downloadAddr as string, type: 'mp4' });
    }
    if (qualities.length === 0) return null;

    const covers = v.covers as string[] | undefined;
    const thumbnail = covers?.[0] ?? '';

    return { id: String(v.id), title: (v.desc as string)?.slice(0, 100) ?? 'TikTok Video', thumbnail, qualities, platform: 'tiktok', sourceUrl };
  } catch { return null; }
}

export const tiktokAdapter: PlatformAdapter & { _parseApiResponse: typeof parseApiResponse } = {
  platform: 'tiktok',
  matchesUrl: (url) => /tiktok\.com/.test(url),
  detectPageType(url: string): PageType {
    if (/tiktok\.com\/@[^/]+\/video\/\d+/.test(url)) return 'single';
    if (/tiktok\.com\/@[^/]+\/?$/.test(url)) return 'profile';
    return 'unknown';
  },
  installFetchInterceptor(onVideo) {
    const original = window.fetch.bind(window);
    window.fetch = async function (...args) {
      const response = await original(...args);
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      if (url.includes('/api/item/detail') || url.includes('/api/post/item_list')) {
        try {
          const clone = response.clone();
          const text = await clone.text();
          const json = JSON.parse(text);
          const info = parseApiResponse(json, window.location.href);
          if (info) onVideo(info);
        } catch { /* not a video response */ }
      }
      return response;
    };
    return () => { window.fetch = original; };
  },
  _parseApiResponse: parseApiResponse,
};
