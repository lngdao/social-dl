import type { VideoInfo } from './types';

const DEBUG = true;

function log(...args: unknown[]) {
  if (DEBUG) console.log('[SD]', ...args);
}

/**
 * Try to parse a response body that may be:
 * - A single JSON object
 * - Multi-line JSON (Facebook style: each line is a separate JSON object)
 */
export function parseResponseText(text: string): unknown[] {
  const results: unknown[] = [];

  // Try single JSON first
  try {
    results.push(JSON.parse(text));
    return results;
  } catch {
    // Not single JSON — try multi-line
  }

  // Facebook often returns multiple JSON objects separated by newlines
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;
    try {
      results.push(JSON.parse(trimmed));
    } catch {
      // skip non-JSON lines
    }
  }

  return results;
}

/**
 * Find all keys matching video-related patterns in an object tree.
 * Used for debugging to understand response structure.
 */
export function findVideoRelatedKeys(obj: unknown, path = '', results: string[] = [], depth = 0): string[] {
  if (depth > 8 || !obj || typeof obj !== 'object') return results;

  const o = obj as Record<string, unknown>;
  const VIDEO_KEY_PATTERNS = /video|playable|play_addr|mp4|dash|stream|media|reel|representation|delivery|base_url|url/i;

  for (const [key, value] of Object.entries(o)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (VIDEO_KEY_PATTERNS.test(key)) {
      const valType = Array.isArray(value) ? `array[${value.length}]` : typeof value;
      const preview = typeof value === 'string' ? value.slice(0, 120) : valType;
      results.push(`${currentPath} = ${preview}`);
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      findVideoRelatedKeys(value, currentPath, results, depth + 1);
    }
    if (Array.isArray(value) && value.length > 0 && value.length < 20) {
      findVideoRelatedKeys(value[0], `${currentPath}[0]`, results, depth + 1);
    }
  }
  return results;
}

/**
 * Debug: dump specific Facebook paths to find actual video URLs.
 */
export function dumpFacebookPaths(obj: unknown): void {
  const o = obj as Record<string, unknown>;

  // Path 1: extensions.all_video_dash_prefetch_representations
  const ext = o?.extensions as Record<string, unknown>;
  const dashReps = ext?.all_video_dash_prefetch_representations as unknown[];
  if (dashReps?.length) {
    const first = dashReps[0] as Record<string, unknown>;
    log('[FB-DEBUG] DASH representation[0] keys:', Object.keys(first));
    log('[FB-DEBUG] DASH representation[0]:', JSON.stringify(first).slice(0, 500));
  }

  // Path 2: data.attachments[0].media
  const data = o?.data as Record<string, unknown>;
  const attachments = data?.attachments as unknown[];
  if (attachments?.length) {
    const media = (attachments[0] as Record<string, unknown>)?.media as Record<string, unknown>;
    if (media) {
      log('[FB-DEBUG] media keys:', Object.keys(media));
      const video = media?.video as Record<string, unknown>;
      if (video) {
        log('[FB-DEBUG] media.video keys:', Object.keys(video));
        const dr = video?.delivery_response as Record<string, unknown>;
        if (dr) {
          log('[FB-DEBUG] delivery_response keys:', Object.keys(dr));
          log('[FB-DEBUG] delivery_response:', JSON.stringify(dr).slice(0, 1000));
        }
      }
    }
  }

  // Path 3: data.video
  const dataVideo = data?.video as Record<string, unknown>;
  if (dataVideo) {
    log('[FB-DEBUG] data.video keys:', Object.keys(dataVideo));
    // Check for playable URLs at various depths
    for (const key of Object.keys(dataVideo)) {
      const val = dataVideo[key];
      if (typeof val === 'string' && (val.includes('fbcdn') || val.includes('.mp4'))) {
        log('[FB-DEBUG] data.video.' + key + ' =', val.slice(0, 200));
      }
    }
  }

  // Path 4: node.video (for when we have a media/attachment node)
  const nodeVideo = o?.video as Record<string, unknown>;
  if (nodeVideo && nodeVideo !== dataVideo) {
    log('[FB-DEBUG] node.video keys:', Object.keys(nodeVideo));
  }
}

/**
 * Deep search an object tree for keys that indicate video content.
 * Facebook nests video data deeply with varying structures.
 */
export function deepFindVideos(obj: unknown, results: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (depth > 15 || !obj || typeof obj !== 'object') return results;

  const o = obj as Record<string, unknown>;

  // Check if this object looks like a video node
  const hasVideoUrl = typeof o.playable_url === 'string' || typeof o.playable_url_quality_hd === 'string';
  const hasBrowserUrl = typeof o.browser_native_hd_url === 'string' || typeof o.browser_native_sd_url === 'string';
  const hasVideoVersions = Array.isArray(o.video_versions);
  const hasPlayAddr = typeof (o.video as Record<string, unknown>)?.playAddr === 'string';

  if (hasVideoUrl || hasBrowserUrl || hasVideoVersions || hasPlayAddr) {
    results.push(o);
  }

  // Recurse into arrays and objects
  if (Array.isArray(obj)) {
    for (const item of obj) {
      deepFindVideos(item, results, depth + 1);
    }
  } else {
    for (const value of Object.values(o)) {
      if (value && typeof value === 'object') {
        deepFindVideos(value, results, depth + 1);
      }
    }
  }

  return results;
}

interface InterceptorConfig {
  /** URL patterns to intercept */
  urlPatterns: string[];
  /** Parse a found video node into VideoInfo (single result) */
  parseVideoNode: (node: Record<string, unknown>, sourceUrl: string) => VideoInfo | null;
  /** Optional: parse ALL videos from a single response (returns multiple) */
  parseAllFromResponse?: (node: Record<string, unknown>, sourceUrl: string) => VideoInfo[];
  /** Platform name for logging */
  platformName: string;
}

/**
 * Installs both fetch and XHR interceptors.
 * Handles multi-line JSON and deep video search.
 */
export function installInterceptors(
  config: InterceptorConfig,
  onVideo: (info: VideoInfo) => void,
): () => void {
  const seenIds = new Set<string>();

  function processResponseText(text: string, requestUrl: string) {
    const jsonObjects = parseResponseText(text);
    log(`[${config.platformName}] Intercepted ${requestUrl.slice(0, 80)}... — ${jsonObjects.length} JSON object(s)`);

    for (const json of jsonObjects) {
      // Reduce debug noise — only log when no videos found
      // (debug helpers still available: findVideoRelatedKeys, dumpFacebookPaths)

      // If multi-video parser is available, use it first
      if (config.parseAllFromResponse) {
        const allVideos = config.parseAllFromResponse(json as Record<string, unknown>, window.location.href);
        let newCount = 0;
        for (const info of allVideos) {
          if (!seenIds.has(info.id)) {
            seenIds.add(info.id);
            newCount++;
            onVideo(info);
          }
        }
        if (newCount > 0) {
          log(`[${config.platformName}] Found ${newCount} new video(s) from response (total seen: ${seenIds.size})`);
          continue;
        }
      }

      // Fallback: single-video parser on root
      const directResult = config.parseVideoNode(json as Record<string, unknown>, window.location.href);
      if (directResult && !seenIds.has(directResult.id)) {
        seenIds.add(directResult.id);
        log(`[${config.platformName}] Found video (direct):`, directResult.id, directResult.title);
        onVideo(directResult);
        continue;
      }

      // Deep search for video nodes
      const videoNodes = deepFindVideos(json);
      for (const node of videoNodes) {
        const info = config.parseVideoNode(node, window.location.href);
        if (info && !seenIds.has(info.id)) {
          seenIds.add(info.id);
          log(`[${config.platformName}] Found video (deep):`, info.id, info.title);
          onVideo(info);
        }
      }
    }
  }

  function matchesUrl(url: string): boolean {
    return config.urlPatterns.some(pattern => url.includes(pattern));
  }

  // Intercept fetch
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const response = await originalFetch(...args);
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
    if (matchesUrl(url)) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        processResponseText(text, url);
      } catch { /* ignore */ }
    }
    return response;
  };

  // Intercept XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    (this as XMLHttpRequest & { _sdUrl?: string })._sdUrl = String(url);
    return (originalXHROpen as Function).call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args: unknown[]) {
    const xhr = this as XMLHttpRequest & { _sdUrl?: string };
    if (xhr._sdUrl && matchesUrl(xhr._sdUrl)) {
      xhr.addEventListener('load', function () {
        try {
          processResponseText(xhr.responseText, xhr._sdUrl!);
        } catch { /* ignore */ }
      });
    }
    return (originalXHRSend as Function).call(this, ...args);
  };

  return () => {
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalXHROpen;
    XMLHttpRequest.prototype.send = originalXHRSend;
  };
}
