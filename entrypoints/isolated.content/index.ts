import { defineContentScript } from 'wxt/utils/define-content-script';
import { detectPlatform } from '../../src/content/platform-detector';
import { showBulkPanel } from '../../src/content/ui/bulk-panel';
import type { VideoInfo } from '../../src/adapters/types';

export default defineContentScript({
  matches: ['*://*.facebook.com/*', '*://*.instagram.com/*', '*://*.tiktok.com/*'],
  world: 'ISOLATED',
  runAt: 'document_idle',

  main() {
    let scanActivated = false;

    function onDownloadSelected(videos: VideoInfo[], quality: string) {
      console.log('[SD] Sending BULK_DOWNLOAD_REQUEST:', videos.length, 'videos, quality:', quality);
      chrome.runtime.sendMessage({
        type: 'BULK_DOWNLOAD_REQUEST',
        payload: { videos, quality },
      }, (response) => {
        console.log('[SD] Background response:', response, chrome.runtime.lastError);
      });
    }

    function activateScan() {
      // Always forward to MAIN world (idempotent there)
      if (!scanActivated) {
        scanActivated = true;
        window.postMessage({ type: '__SD_ACTIVATE_SCAN__' }, '*');
      }
    }

    function togglePanel() {
      const detected = detectPlatform(window.location.href);
      if (!detected) return;

      // Activate scan interceptors if not already done
      activateScan();

      // Toggle the bulk panel (showBulkPanel toggles if already open)
      if (detected.pageType === 'profile') {
        showBulkPanel(onDownloadSelected);
      }
    }

    // Listen for ACTIVATE_SCAN from background (triggered when side panel opens or user clicks)
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'ACTIVATE_SCAN') {
        togglePanel();
        sendResponse({ ok: true });
      }
      return false;
    });

    // Listen for download requests from MAIN world
    window.addEventListener('message', (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== '__SD_DOWNLOAD__') return;
      const { videoInfo, quality } = e.data.payload as { videoInfo: VideoInfo; quality: string };
      chrome.runtime.sendMessage({
        type: 'BULK_DOWNLOAD_REQUEST',
        payload: { videos: [videoInfo], quality },
      });
    });
  },
});
