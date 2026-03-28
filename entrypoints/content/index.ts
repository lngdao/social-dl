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

    const observer = new MutationObserver(() => {
      const newDetected = detectPlatform(window.location.href);
      if (!newDetected || newDetected.pageType !== detected.pageType) {
        hideSingleDownloadButton();
      }
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: false });
    else document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: false });
    });
  },
});
