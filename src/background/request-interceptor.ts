const tabVideoUrls = new Map<number, Set<string>>();

const CDN_VIDEO_PATTERN = /\.(mp4|m4v)(\?|$)/i;
const DASH_PATTERN = /dash|manifest\.mpd/i;

export function installRequestInterceptor(): void {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const { tabId, url, type } = details;
      if (tabId < 0) return;
      if (type !== 'media' && type !== 'xmlhttprequest' && type !== 'other') return;
      if (!CDN_VIDEO_PATTERN.test(url) && !DASH_PATTERN.test(url)) return;
      if (!tabVideoUrls.has(tabId)) tabVideoUrls.set(tabId, new Set());
      tabVideoUrls.get(tabId)!.add(url);
    },
    { urls: ['*://*.fbcdn.net/*', '*://*.cdninstagram.com/*', '*://*.tiktokcdn.com/*', '*://*.tiktokv.com/*'] },
    [],
  );
  chrome.tabs.onRemoved.addListener((tabId) => { tabVideoUrls.delete(tabId); });
}

export function getTabVideoUrls(tabId: number): string[] {
  return Array.from(tabVideoUrls.get(tabId) ?? []);
}
