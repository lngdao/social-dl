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
 * Deep search an object tree for keys that indicate video content.
 * Facebook nests video data deeply with varying structures.
 */
export function deepFindVideos(obj: unknown, results: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (depth > 15 || !obj || typeof obj !== 'object') return results;

  const o = obj as Record<string, unknown>;

  // Check if this object looks like a video node
  const hasVideoUrl = typeof o.playable_url === 'string' || typeof o.playable_url_quality_hd === 'string';
  const hasVideoVersions = Array.isArray(o.video_versions);
  const hasPlayAddr = typeof (o.video as Record<string, unknown>)?.playAddr === 'string';

  if (hasVideoUrl || hasVideoVersions || hasPlayAddr) {
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
  /** Parse a found video node into VideoInfo */
  parseVideoNode: (node: Record<string, unknown>, sourceUrl: string) => VideoInfo | null;
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
      // First try the platform-specific parser on the root
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
