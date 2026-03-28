import type { PlatformAdapter, VideoInfo, VideoQuality, PageType } from './types';

function parseGraphQL(payload: unknown, sourceUrl: string): VideoInfo | null {
  try {
    const p = payload as Record<string, unknown>;
    const data = p?.data as Record<string, unknown>;
    const mediaResponse = data?.xdt_api__v1__media__shortcode__web_info ?? data?.xdt_api__v1__feed__reels_media;
    const items = (mediaResponse as Record<string, unknown>)?.items as unknown[];
    const item = items?.[0] as Record<string, unknown> | undefined;
    if (!item?.id) return null;

    const videoVersions = item.video_versions as Array<Record<string, unknown>> | undefined;
    if (!videoVersions?.length) return null;

    const qualities: VideoQuality[] = videoVersions.map((v, i) => ({
      label: i === 0 ? '1080p' : i === 1 ? '720p' : '360p',
      url: v.url as string,
      type: 'mp4' as const,
    }));

    const thumbnail = ((item.image_versions2 as Record<string, unknown>)?.candidates as Array<Record<string, unknown>>)?.[0]?.url as string ?? '';
    const title = (item.caption as Record<string, string>)?.text ?? 'Instagram Reel';

    return { id: String(item.id), title: title.slice(0, 100), thumbnail, qualities, platform: 'instagram', sourceUrl };
  } catch { return null; }
}

export const instagramAdapter: PlatformAdapter & { _parseGraphQL: typeof parseGraphQL } = {
  platform: 'instagram',
  matchesUrl: (url) => /instagram\.com/.test(url),
  detectPageType(url: string): PageType {
    if (/instagram\.com\/reel\/[A-Za-z0-9_-]+/.test(url)) return 'single';
    if (/instagram\.com\/[^/]+\/reels/.test(url)) return 'profile';
    return 'unknown';
  },
  installFetchInterceptor(onVideo) {
    const original = window.fetch.bind(window);
    window.fetch = async function (...args) {
      const response = await original(...args);
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      if (url.includes('/graphql') || url.includes('/api/v1/')) {
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
