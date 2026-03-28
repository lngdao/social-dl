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
 * Parse a single DASH prefetch item into a VideoInfo.
 * Prefers H264 (avc1) over VP9 for macOS/QuickTime compatibility.
 */
function parseSingleDash(item: DashPrefetch, sourceUrl: string, shareableUrl?: string): VideoInfo | null {
  if (!item.video_id || !item.representations?.length) return null;

  // Separate video and audio by representation_id suffix
  const videoReps = item.representations.filter(r =>
    r.representation_id?.endsWith('v') && r.base_url
  );
  const audioReps = item.representations.filter(r =>
    r.representation_id?.endsWith('a') && r.base_url
  );

  if (videoReps.length === 0) return null;

  // Prefer H264 (avc1) over VP9 (vp09) for compatibility
  const h264Reps = videoReps.filter(r => r.codecs?.startsWith('avc1'));
  const preferredReps = h264Reps.length > 0 ? h264Reps : videoReps;

  // Sort by bandwidth descending (highest quality first)
  preferredReps.sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));

  const bestAudio = audioReps.find(r => r.codecs?.startsWith('mp4a'))?.base_url ?? audioReps[0]?.base_url;

  const qualities: VideoQuality[] = preferredReps.map((rep, i) => {
    const height = rep.height;
    const label = height ? `${height}p` : (i === 0 ? 'HD' : `SD`);
    return {
      label,
      url: rep.base_url!,
      type: bestAudio ? 'dash' as const : 'mp4' as const,
      audioUrl: bestAudio,
    };
  });

  // Add a direct MP4 option (highest quality, no audio — but works without ffmpeg)
  qualities.unshift({
    label: 'Best (video only)',
    url: preferredReps[0].base_url!,
    type: 'mp4',
  });

  return {
    id: item.video_id,
    title: 'Facebook Reel',
    thumbnail: '',
    qualities,
    platform: 'facebook',
    sourceUrl: shareableUrl ?? sourceUrl,
  };
}

/**
 * Parse ALL videos from a Facebook GraphQL response.
 * Returns multiple VideoInfo items (not just one).
 */
function parseAllVideos(node: Record<string, unknown>, sourceUrl: string): VideoInfo[] {
  const results: VideoInfo[] = [];

  try {
    const ext = node.extensions as Record<string, unknown> | undefined;
    const dashPrefetch = ext?.all_video_dash_prefetch_representations as DashPrefetch[] | undefined;
    const data = node.data as Record<string, unknown> | undefined;

    // Build a map of video_id → shareable_url from the data
    const urlMap = new Map<string, string>();

    // From data.attachments[0].media
    const attachments = data?.attachments as Array<Record<string, unknown>> | undefined;
    if (attachments?.[0]) {
      const media = attachments[0].media as Record<string, unknown> | undefined;
      if (media?.id && media?.shareable_url) {
        urlMap.set(String(media.id), media.shareable_url as string);
      }
    }

    // From data.url
    if (data?.url) {
      const reelMatch = (data.url as string).match(/\/reel\/(\d+)/);
      if (reelMatch) urlMap.set(reelMatch[1], data.url as string);
    }

    // From profile edges: data.node.aggregated_fb_shorts.edges
    const nodeData = data?.node as Record<string, unknown> | undefined;
    const edges = (nodeData?.aggregated_fb_shorts as Record<string, unknown>)?.edges as Array<Record<string, unknown>> | undefined;
    if (edges) {
      for (const edge of edges) {
        const reelNode = (edge.profile_reel_node as Record<string, unknown>)?.node as Record<string, unknown> | undefined;
        if (!reelNode) continue;

        const reelAttachments = reelNode.attachments as Array<Record<string, unknown>> | undefined;
        if (reelAttachments?.[0]) {
          const media = reelAttachments[0].media as Record<string, unknown> | undefined;
          if (media?.id && media?.shareable_url) {
            urlMap.set(String(media.id), media.shareable_url as string);
          }
        }
      }
    }

    // Parse each DASH prefetch item
    if (dashPrefetch) {
      for (const item of dashPrefetch) {
        const shareableUrl = item.video_id ? urlMap.get(item.video_id) : undefined;
        const info = parseSingleDash(item, sourceUrl, shareableUrl);
        if (info) results.push(info);
      }
    }
  } catch { /* ignore parse errors */ }

  return results;
}

// For backwards compatibility with the adapter interface (returns single VideoInfo)
function parseVideoNode(node: Record<string, unknown>, sourceUrl: string): VideoInfo | null {
  const all = parseAllVideos(node, sourceUrl);
  return all[0] ?? null;
}

export const facebookAdapter: PlatformAdapter & {
  _parseGraphQL: typeof parseVideoNode;
  _parseAllVideos: typeof parseAllVideos;
} = {
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
      // Use multi-video parser to emit ALL videos per response
      parseAllFromResponse: parseAllVideos,
    }, onVideo);
  },
  _parseGraphQL: parseVideoNode,
  _parseAllVideos: parseAllVideos,
};
