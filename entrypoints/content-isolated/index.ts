import { defineContentScript } from 'wxt/utils/define-content-script';
import { detectPlatform } from '../../src/content/platform-detector';
import { showBulkPanel } from '../../src/content/ui/bulk-panel';
import type { VideoInfo } from '../../src/adapters/types';

export default defineContentScript({
  matches: ['*://*.facebook.com/*', '*://*.instagram.com/*', '*://*.tiktok.com/*'],
  world: 'ISOLATED',
  runAt: 'document_idle',

  main() {
    const detected = detectPlatform(window.location.href);
    if (!detected) return;

    if (detected.pageType === 'profile') {
      showBulkPanel((videos: VideoInfo[], quality: string) => {
        chrome.runtime.sendMessage({
          type: 'BULK_DOWNLOAD_REQUEST',
          payload: { videos, quality },
        });
      });
    }

    window.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type !== '__SD_DOWNLOAD__') return;
      const { videoInfo, quality } = e.data.payload as { videoInfo: VideoInfo; quality: string };
      chrome.runtime.sendMessage({
        type: 'BULK_DOWNLOAD_REQUEST',
        payload: { videos: [videoInfo], quality },
      });
    });
  },
});
