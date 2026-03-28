import type { PlatformAdapter, VideoInfo, VideoQuality, PageType } from './types';
import { installInterceptors } from './interceptor-utils';

function parseVideoNode(node: Record<string, unknown>, sourceUrl: string): VideoInfo | null {
  try {
    let v: Record<string, unknown> | undefined;

    // Direct video node (from deep search)
    if (node.video && typeof node.video === 'object' && node.id) {
      v = node;
    }

    // Wrapped in itemInfo.itemStruct
    if (!v) {
      const itemInfo = node.itemInfo as Record<string, unknown> | undefined;
      v = itemInfo?.itemStruct as Record<string, unknown> | undefined;
    }

    if (!v) {
      const data = node.data as Record<string, unknown> | undefined;
      if (data?.id && data?.video) v = data;
    }

    if (!v?.id) return null;

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
    const videoCover = (v.video as Record<string, unknown>)?.cover as string | undefined;
    const thumbnail = covers?.[0] ?? videoCover ?? '';

    return {
      id: String(v.id),
      title: (v.desc as string)?.slice(0, 100) ?? 'TikTok Video',
      thumbnail, qualities, platform: 'tiktok', sourceUrl,
    };
  } catch { return null; }
}

export const tiktokAdapter: PlatformAdapter & { _parseApiResponse: typeof parseVideoNode } = {
  platform: 'tiktok',
  matchesUrl: (url) => /tiktok\.com/.test(url),
  detectPageType(url: string): PageType {
    if (/tiktok\.com\/@[^/]+\/video\/\d+/.test(url)) return 'single';
    if (/tiktok\.com\/@[^/]+\/?$/.test(url)) return 'profile';
    return 'unknown';
  },
  installFetchInterceptor(onVideo) {
    return installInterceptors({
      urlPatterns: ['/api/item/detail', '/api/post/item_list', '/api/recommend', '/node/share/video'],
      parseVideoNode,
      platformName: 'TikTok',
    }, onVideo);
  },
  _parseApiResponse: parseVideoNode,
};
