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

interface VideoMeta {
  shareableUrl?: string;
  thumbnail?: string;
  title?: string;
}

function log(...args: unknown[]) {
  console.log('[SD]', ...args);
}

/**
 * Extract thumbnail URL from a media node.
 * Facebook stores thumbnails in various fields.
 */
function extractThumbnail(media: Record<string, unknown>): string {
  // Try preferred_thumbnail.image.uri
  const pt = media.preferred_thumbnail as Record<string, unknown> | undefined;
  if (pt) {
    const img = pt.image as Record<string, unknown> | undefined;
    if (typeof img?.uri === 'string') return img.uri;
  }
  // Try thumbnailImage.uri
  const ti = media.thumbnailImage as Record<string, unknown> | undefined;
  if (typeof ti?.uri === 'string') return ti.uri;
  // Try photo_image.uri (common in reels)
  const pi = media.photo_image as Record<string, unknown> | undefined;
  if (typeof pi?.uri === 'string') return pi.uri;
  // Try full_width_image
  const fw = media.full_width_image as Record<string, unknown> | undefined;
  if (typeof fw?.uri === 'string') return fw.uri;
  return '';
}

/**
 * Parse a single DASH prefetch item into a VideoInfo.
 * Prefers H264 (avc1) over VP9 for macOS/QuickTime compatibility.
 */
function parseSingleDash(item: DashPrefetch, sourceUrl: string, meta?: VideoMeta): VideoInfo | null {
  if (!item.video_id || !item.representations?.length) return null;

  const videoReps = item.representations.filter(r =>
    r.representation_id?.endsWith('v') && r.base_url
  );
  const audioReps = item.representations.filter(r =>
    r.representation_id?.endsWith('a') && r.base_url
  );

  if (videoReps.length === 0) return null;

  // Log codecs available for debugging
  const codecs = videoReps.map(r => `${r.codecs ?? 'unknown'}@${r.bandwidth ?? '?'}bps`);
  log(`[Facebook] Video ${item.video_id}: codecs available:`, codecs.join(', '));

  // Prefer H264 (avc1) over VP9 (vp09) for macOS/QuickTime compatibility
  const h264Reps = videoReps.filter(r => r.codecs?.startsWith('avc1'));
  const preferredReps = h264Reps.length > 0 ? h264Reps : videoReps;

  // Sort by bandwidth descending
  preferredReps.sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));

  // Find best compatible audio
  const bestAudio = audioReps.find(r => r.codecs?.startsWith('mp4a'))?.base_url ?? audioReps[0]?.base_url;

  const qualities: VideoQuality[] = [];

  // First option: best video + audio (DASH, needs merge)
  if (bestAudio) {
    qualities.push({
      label: preferredReps[0].height ? `${preferredReps[0].height}p + audio` : 'HD + audio',
      url: preferredReps[0].base_url!,
      type: 'dash',
      audioUrl: bestAudio,
    });
  }

  // Second option: video-only (direct MP4, always works)
  for (const rep of preferredReps) {
    const height = rep.height;
    const label = height ? `${height}p (no audio)` : 'Video only';
    qualities.push({
      label,
      url: rep.base_url!,
      type: 'mp4',
    });
  }

  return {
    id: item.video_id,
    title: meta?.title ?? 'Facebook Reel',
    thumbnail: meta?.thumbnail ?? '',
    qualities,
    platform: 'facebook',
    sourceUrl: meta?.shareableUrl ?? sourceUrl,
  };
}

/**
 * Parse ALL videos from a Facebook GraphQL response.
 */
function parseAllVideos(node: Record<string, unknown>, sourceUrl: string): VideoInfo[] {
  const results: VideoInfo[] = [];

  try {
    const ext = node.extensions as Record<string, unknown> | undefined;
    const dashPrefetch = ext?.all_video_dash_prefetch_representations as DashPrefetch[] | undefined;
    const data = node.data as Record<string, unknown> | undefined;

    // Build maps of video_id → metadata
    const metaMap = new Map<string, VideoMeta>();

    // From data.attachments[0].media
    const attachments = data?.attachments as Array<Record<string, unknown>> | undefined;
    if (attachments?.[0]) {
      const media = attachments[0].media as Record<string, unknown> | undefined;
      if (media?.id) {
        metaMap.set(String(media.id), {
          shareableUrl: media.shareable_url as string | undefined,
          thumbnail: extractThumbnail(media),
        });
      }
    }

    // From data.url → extract reel ID
    if (data?.url) {
      const reelMatch = (data.url as string).match(/\/reel\/(\d+)/);
      if (reelMatch && !metaMap.has(reelMatch[1])) {
        metaMap.set(reelMatch[1], { shareableUrl: data.url as string });
      }
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
          if (media?.id) {
            metaMap.set(String(media.id), {
              shareableUrl: media.shareable_url as string | undefined,
              thumbnail: extractThumbnail(media),
              title: (reelNode as Record<string, unknown>)?.message?.text as string | undefined,
            });
          }
        }
      }
    }

    // Parse each DASH prefetch item
    if (dashPrefetch) {
      for (const item of dashPrefetch) {
        const meta = item.video_id ? metaMap.get(item.video_id) : undefined;
        const info = parseSingleDash(item, sourceUrl, meta);
        if (info) results.push(info);
      }
    }
  } catch { /* ignore */ }

  return results;
}

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
      parseAllFromResponse: parseAllVideos,
    }, onVideo);
  },
  _parseGraphQL: parseVideoNode,
  _parseAllVideos: parseAllVideos,
};
