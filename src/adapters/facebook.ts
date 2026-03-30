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
  const pt = media.preferred_thumbnail as Record<string, unknown> | undefined;
  if (pt) {
    const img = pt.image as Record<string, unknown> | undefined;
    if (typeof img?.uri === 'string') return img.uri;
  }
  const ti = media.thumbnailImage as Record<string, unknown> | undefined;
  if (typeof ti?.uri === 'string') return ti.uri;
  const pi = media.photo_image as Record<string, unknown> | undefined;
  if (typeof pi?.uri === 'string') return pi.uri;
  const fw = media.full_width_image as Record<string, unknown> | undefined;
  if (typeof fw?.uri === 'string') return fw.uri;
  return '';
}

/**
 * Parse a single DASH prefetch item into a VideoInfo.
 * Sort by resolution (height) then bandwidth — codec-agnostic.
 */
function parseSingleDash(item: DashPrefetch, sourceUrl: string, meta?: VideoMeta): VideoInfo | null {
  if (!item.video_id || !item.representations?.length) return null;

  const videoReps = item.representations.filter(r =>
    r.representation_id?.endsWith('v') && r.base_url
  );
  const audioReps = item.representations.filter(r =>
    r.representation_id?.endsWith('a') && r.base_url
  );

  if (videoReps.length === 0) {
    log(`[Facebook] Video ${item.video_id}: no video reps found (${item.representations.length} total reps)`);
    return null;
  }

  // Sort by height DESC, then bandwidth DESC — codec-agnostic
  videoReps.sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bandwidth ?? 0) - (a.bandwidth ?? 0));

  // Find best audio (prefer mp4a, fallback to any)
  const bestAudio = audioReps.find(r => r.codecs?.startsWith('mp4a'))?.base_url ?? audioReps[0]?.base_url;

  const qualities: VideoQuality[] = [];

  // First option: best video + audio (DASH, needs merge)
  if (bestAudio) {
    qualities.push({
      label: videoReps[0].height ? `${videoReps[0].height}p + audio` : 'HD + audio',
      url: videoReps[0].base_url!,
      type: 'dash',
      audioUrl: bestAudio,
    });
  }

  // Additional quality options: video-only at each resolution
  for (const rep of videoReps) {
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

    // Parse each DASH prefetch item — allow videos without metadata (fix E)
    if (dashPrefetch) {
      for (const item of dashPrefetch) {
        const meta = item.video_id ? metaMap.get(item.video_id) : undefined;
        const info = parseSingleDash(item, sourceUrl, meta);
        if (info) results.push(info);
      }
    }
  } catch (err) {
    // Fix D: log errors instead of silently swallowing
    log('[Facebook] parseAllVideos error:', err instanceof Error ? err.message : String(err));
  }

  return results;
}

/**
 * Parse SSR (Server-Side Rendered) script tags for the initial batch of videos.
 * Facebook embeds the first ~10 reels in <script type="application/json"> tags
 * using ScheduledServerJS format. These are NOT fetched via XHR/fetch.
 */
export function parseSSRScripts(): VideoInfo[] {
  const results: VideoInfo[] = [];
  const seenIds = new Set<string>();

  try {
    const scripts = document.querySelectorAll('script[type="application/json"]');
    log(`[Facebook] Scanning ${scripts.length} SSR script tags...`);

    for (const script of scripts) {
      const text = script.textContent;
      if (!text || text.length < 100) continue;

      // Try to find DASH representations in the SSR data
      // Facebook's ScheduledServerJS wraps data in require/define calls
      // The actual JSON data may be nested inside arrays
      try {
        const json = JSON.parse(text);
        const videos = findDashInObject(json, seenIds);
        for (const v of videos) {
          results.push(v);
        }
      } catch {
        // Not valid JSON or not relevant — skip
      }
    }
  } catch (err) {
    log('[Facebook] SSR parse error:', err instanceof Error ? err.message : String(err));
  }

  log(`[Facebook] SSR: found ${results.length} video(s)`);
  return results;
}

/**
 * Recursively search an object for DASH prefetch data in SSR.
 * First pass: collect all metadata (video_id → thumbnail/title/url).
 * Second pass: find DASH items and match with collected metadata.
 */
function findDashInObject(
  obj: unknown,
  seenIds: Set<string>,
): VideoInfo[] {
  // First: collect metadata from the entire SSR tree
  const metaMap = new Map<string, VideoMeta>();
  collectSSRMetadata(obj, metaMap, 0);
  log(`[Facebook] SSR metadata collected: ${metaMap.size} entries`);

  // Second: find DASH prefetch items and match
  const dashItems: DashPrefetch[] = [];
  collectDashItems(obj, dashItems, 0);
  log(`[Facebook] SSR DASH items found: ${dashItems.length}`);

  const results: VideoInfo[] = [];
  for (const item of dashItems) {
    if (!item.video_id || seenIds.has(item.video_id)) continue;
    const meta = metaMap.get(item.video_id);
    const info = parseSingleDash(item, window.location.href, meta);
    if (info) {
      seenIds.add(info.id);
      results.push(info);
    }
  }

  return results;
}

/** Collect video metadata from SSR data tree */
function collectSSRMetadata(obj: unknown, map: Map<string, VideoMeta>, depth: number): void {
  if (depth > 25 || !obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) collectSSRMetadata(item, map, depth + 1);
    return;
  }

  const o = obj as Record<string, unknown>;

  // Check if this looks like a media node with id + thumbnail
  if (typeof o.id === 'string' && o.id.match(/^\d+$/)) {
    const thumb = extractThumbnail(o);
    const url = o.shareable_url as string | undefined;
    if (thumb || url) {
      const existing = map.get(o.id);
      map.set(o.id, {
        thumbnail: thumb || existing?.thumbnail || '',
        shareableUrl: url || existing?.shareableUrl,
        title: existing?.title,
      });
    }
  }

  // Check for message.text (reel title)
  if (o.message && typeof (o.message as Record<string, unknown>).text === 'string') {
    // Look for an attachment with media.id nearby
    const attachments = o.attachments as Array<Record<string, unknown>> | undefined;
    if (attachments?.[0]) {
      const media = attachments[0].media as Record<string, unknown> | undefined;
      if (media?.id) {
        const id = String(media.id);
        const existing = map.get(id);
        map.set(id, {
          thumbnail: extractThumbnail(media) || existing?.thumbnail || '',
          shareableUrl: (media.shareable_url as string) || existing?.shareableUrl,
          title: (o.message as Record<string, unknown>).text as string,
        });
      }
    }
  }

  // Recurse
  for (const value of Object.values(o)) {
    if (value && typeof value === 'object') {
      collectSSRMetadata(value, map, depth + 1);
    }
  }
}

/** Collect all DASH prefetch items from SSR data tree */
function collectDashItems(obj: unknown, items: DashPrefetch[], depth: number): void {
  if (depth > 25 || !obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    // Check if this array looks like all_video_dash_prefetch_representations
    if (obj.length > 0 && obj[0] && typeof obj[0] === 'object' && 'video_id' in obj[0] && 'representations' in obj[0]) {
      for (const item of obj) items.push(item as DashPrefetch);
      return;
    }
    for (const item of obj) collectDashItems(item, items, depth + 1);
    return;
  }

  const o = obj as Record<string, unknown>;

  // Check extensions.all_video_dash_prefetch_representations
  const ext = o.extensions as Record<string, unknown> | undefined;
  const dashReps = ext?.all_video_dash_prefetch_representations;
  if (Array.isArray(dashReps) && dashReps.length > 0) {
    for (const item of dashReps) items.push(item as DashPrefetch);
    return;
  }

  // Standalone DASH item
  if (typeof o.video_id === 'string' && Array.isArray(o.representations)) {
    items.push(o as unknown as DashPrefetch);
    return;
  }

  for (const value of Object.values(o)) {
    if (value && typeof value === 'object') {
      collectDashItems(value, items, depth + 1);
    }
  }
}

function parseVideoNode(node: Record<string, unknown>, sourceUrl: string): VideoInfo | null {
  const all = parseAllVideos(node, sourceUrl);
  return all[0] ?? null;
}

export const facebookAdapter: PlatformAdapter & {
  _parseGraphQL: typeof parseVideoNode;
  _parseAllVideos: typeof parseAllVideos;
  parseSSRScripts: typeof parseSSRScripts;
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
  parseSSRScripts,
};
