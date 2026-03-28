import type { PlatformAdapter, VideoInfo, VideoQuality, PageType } from './types';
import { installInterceptors } from './interceptor-utils';

function parseVideoNode(node: Record<string, unknown>, sourceUrl: string): VideoInfo | null {
  try {
    // Instagram wraps media in various ways
    let item: Record<string, unknown> | undefined;

    // Direct item (from deep search)
    if (node.video_versions) {
      item = node;
    }

    // Wrapped in xdt_api response
    if (!item) {
      const data = node.data as Record<string, unknown> | undefined;
      if (data) {
        // Try all known response shapes
        const media =
          data.xdt_api__v1__media__shortcode__web_info ??
          data.xdt_api__v1__feed__reels_media ??
          data.xdt_shortcode_media ??
          data.shortcode_media;

        const items = (media as Record<string, unknown>)?.items as unknown[] | undefined;
        item = items?.[0] as Record<string, unknown> | undefined;

        // Some responses put the media directly
        if (!item && (media as Record<string, unknown>)?.video_versions) {
          item = media as Record<string, unknown>;
        }
      }
    }

    if (!item) return null;

    const videoVersions = item.video_versions as Array<Record<string, unknown>> | undefined;
    if (!videoVersions?.length) return null;

    const id = String(item.id ?? item.pk ?? item.media_id ?? '');
    if (!id) return null;

    const qualities: VideoQuality[] = videoVersions.map((v, i) => ({
      label: v.height ? `${v.height}p` : (i === 0 ? '1080p' : i === 1 ? '720p' : '360p'),
      url: v.url as string,
      type: 'mp4' as const,
    }));

    const thumbnail =
      ((item.image_versions2 as Record<string, unknown>)?.candidates as Array<Record<string, unknown>>)?.[0]?.url as string ??
      (item.display_url as string) ??
      '';

    const title =
      (item.caption as Record<string, string>)?.text ??
      (item.accessibility_caption as string) ??
      'Instagram Reel';

    return { id, title: title.slice(0, 100), thumbnail, qualities, platform: 'instagram', sourceUrl };
  } catch { return null; }
}

export const instagramAdapter: PlatformAdapter & { _parseGraphQL: typeof parseVideoNode } = {
  platform: 'instagram',
  matchesUrl: (url) => /instagram\.com/.test(url),
  detectPageType(url: string): PageType {
    if (/instagram\.com\/reel\/[A-Za-z0-9_-]+/.test(url)) return 'single';
    if (/instagram\.com\/[^/]+\/reels/.test(url)) return 'profile';
    return 'unknown';
  },
  installFetchInterceptor(onVideo) {
    return installInterceptors({
      urlPatterns: ['/graphql', '/api/v1/', '/query', 'instagram.com/graphql'],
      parseVideoNode,
      platformName: 'Instagram',
    }, onVideo);
  },
  _parseGraphQL: parseVideoNode,
};
