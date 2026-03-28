import type { PlatformAdapter, VideoInfo, VideoQuality, PageType } from './types';
import { installInterceptors } from './interceptor-utils';

interface DashRepresentation {
  representation_id?: string;
  mime_type?: string;
  codecs?: string;
  base_url?: string;
  bandwidth?: number;
  width?: number;
  height?: number;
}

interface DashPrefetch {
  video_id?: string;
  representations?: DashRepresentation[];
  nextgendash?: boolean;
}

/**
 * Parse Facebook's DASH prefetch representations to extract video URLs.
 * Facebook serves all reels via DASH with separate video/audio tracks.
 * Each representation has a `base_url` that is a direct CDN MP4 URL.
 */
function parseDashRepresentations(dashItems: DashPrefetch[], sourceUrl: string, metadata?: { id?: string; title?: string; thumbnail?: string; shareableUrl?: string }): VideoInfo[] {
  const results: VideoInfo[] = [];

  for (const item of dashItems) {
    if (!item.video_id || !item.representations?.length) continue;

    // Separate video and audio representations by ID suffix (v=video, a=audio)
    const videoReps = item.representations.filter(r =>
      r.representation_id?.endsWith('v') && r.base_url
    );
    const audioReps = item.representations.filter(r =>
      r.representation_id?.endsWith('a') && r.base_url
    );

    if (videoReps.length === 0) continue;

    // Sort by bandwidth (highest first) if available, otherwise by order
    videoReps.sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));

    const qualities: VideoQuality[] = videoReps.map((rep, i) => {
      const height = rep.height;
      const label = height ? `${height}p` : (i === 0 ? 'HD' : `quality-${i}`);
      const bestAudio = audioReps[0]?.base_url;

      return {
        label,
        url: rep.base_url!,
        type: bestAudio ? 'dash' as const : 'mp4' as const,
        audioUrl: bestAudio,
      };
    });

    // Also add a "best video only" option (no audio merge needed — many players handle video-only fine)
    if (videoReps[0]?.base_url) {
      qualities.unshift({
        label: 'Best (video only)',
        url: videoReps[0].base_url,
        type: 'mp4',
      });
    }

    results.push({
      id: item.video_id,
      title: metadata?.title ?? 'Facebook Reel',
      thumbnail: metadata?.thumbnail ?? '',
      qualities,
      platform: 'facebook',
      sourceUrl: metadata?.shareableUrl ?? sourceUrl,
    });
  }

  return results;
}

function parseVideoNode(node: Record<string, unknown>, sourceUrl: string): VideoInfo | null {
  try {
    const ext = node.extensions as Record<string, unknown> | undefined;
    const dashPrefetch = ext?.all_video_dash_prefetch_representations as DashPrefetch[] | undefined;

    // Extract metadata from data.attachments[0].media or data.node.aggregated_fb_shorts
    const data = node.data as Record<string, unknown> | undefined;
    let mediaId: string | undefined;
    let shareableUrl: string | undefined;

    // Try data.attachments[0].media
    const attachments = data?.attachments as Array<Record<string, unknown>> | undefined;
    if (attachments?.[0]) {
      const media = attachments[0].media as Record<string, unknown> | undefined;
      if (media) {
        mediaId = media.id as string | undefined;
        shareableUrl = media.shareable_url as string | undefined;
      }
    }

    // Try data.url
    if (!shareableUrl) {
      shareableUrl = data?.url as string | undefined;
    }

    if (dashPrefetch?.length) {
      const videos = parseDashRepresentations(dashPrefetch, sourceUrl, {
        id: mediaId,
        shareableUrl,
      });
      if (videos.length > 0) return videos[0];
    }

    // Fallback: try profile reels list (aggregated_fb_shorts)
    const nodeData = data?.node as Record<string, unknown> | undefined;
    const edges = (nodeData?.aggregated_fb_shorts as Record<string, unknown>)?.edges as Array<Record<string, unknown>> | undefined;
    if (edges?.length && dashPrefetch?.length) {
      // Profile response — return first video, rest will be caught on subsequent calls
      const videos = parseDashRepresentations(dashPrefetch, sourceUrl);
      if (videos.length > 0) return videos[0];
    }

    return null;
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
