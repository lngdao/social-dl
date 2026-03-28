import { defineContentScript } from 'wxt/utils/define-content-script';
import { detectPlatform, getAdapter } from '../../src/content/platform-detector';
import { showSingleDownloadButton, hideSingleDownloadButton } from '../../src/content/ui/single-button';
import type { VideoInfo, VideoQuality } from '../../src/adapters/types';

export default defineContentScript({
  matches: ['*://*.facebook.com/*', '*://*.instagram.com/*', '*://*.tiktok.com/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    let currentVideo: VideoInfo | null = null;

    function handleVideoFound(info: VideoInfo) {
      currentVideo = info;
      if (detected?.pageType === 'single') {
        showSingleDownloadButton(info, handleDownload);
      }
      window.postMessage({ type: '__SD_VIDEO_FOUND__', payload: info }, '*');
    }

    function handleDownload(quality: VideoQuality) {
      if (!currentVideo) return;
      window.postMessage({
        type: '__SD_DOWNLOAD__',
        payload: { videoInfo: currentVideo, quality: quality.label },
      }, '*');
    }

    const detected = detectPlatform(window.location.href);
    if (!detected) return;

    const adapter = getAdapter(detected.platform);
    if (!adapter) return;

    adapter.installFetchInterceptor(handleVideoFound);

    // Detect SPA navigation
    let lastUrl = window.location.href;
    function checkNavigation() {
      if (window.location.href === lastUrl) return;
      lastUrl = window.location.href;
      const newDetected = detectPlatform(window.location.href);
      if (!newDetected || newDetected.pageType !== 'single') {
        hideSingleDownloadButton();
      }
    }

    // Monkey-patch pushState/replaceState for SPA navigation
    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);
    history.pushState = function (...args) {
      origPushState(...args);
      checkNavigation();
    };
    history.replaceState = function (...args) {
      origReplaceState(...args);
      checkNavigation();
    };
    window.addEventListener('popstate', checkNavigation);
  },
});
