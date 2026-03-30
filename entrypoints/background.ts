import { defineBackground } from 'wxt/utils/define-background';
import { DownloadQueue } from '../src/background/download-queue';
import { addHistoryEntry, getHistory, clearHistory } from '../src/background/history-store';
import { installRequestInterceptor } from '../src/background/request-interceptor';
import { downloadViaCobalt } from '../src/background/cobalt-downloader';
import { mergeDashAndDownload } from '../src/background/ffmpeg-bridge';
import { mergeWithMp4box } from '../src/background/mp4box-merge';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../src/shared/storage';
import type { DownloadJob, VideoQuality } from '../src/adapters/types';
import type { AnyMessage } from '../src/shared/messages';

export default defineBackground(() => {
  installRequestInterceptor();

  let settings = { ...DEFAULT_SETTINGS };
  getSettings().then(s => { settings = s; });

  let queue: DownloadQueue;

  function broadcastQueueUpdate(jobs: DownloadJob[]) {
    chrome.runtime.sendMessage({ type: 'QUEUE_UPDATE', payload: jobs }).catch(() => {});
  }

  async function executeJob(job: DownloadJob, onProgress: (p: number) => void): Promise<void> {
    const quality: VideoQuality | undefined = job.selectedQuality === 'highest'
      ? job.videoInfo.qualities[0]
      : job.videoInfo.qualities.find(q => q.label === job.selectedQuality) ?? job.videoInfo.qualities[0];

    console.log('[SD-BG] executeJob:', job.id, 'quality:', quality?.label, 'type:', quality?.type, 'merge:', settings.mergeMethod);

    if (!quality) throw new Error('No quality available');

    const sourceUrl = job.videoInfo.sourceUrl;
    const filename = `${job.videoInfo.platform}_${job.videoInfo.id}`;

    // Strategy: if we have a sourceUrl (reel page URL), try Cobalt first (handles DASH merge server-side).
    if (sourceUrl && (sourceUrl.includes('/reel/') || sourceUrl.includes('/video/'))) {
      try {
        console.log('[SD-BG] Trying Cobalt for:', sourceUrl);
        await downloadViaCobalt(sourceUrl, filename, onProgress, settings.cobaltInstance, settings.cobaltApiKey);
        return;
      } catch (err) {
        console.warn('[SD-BG] Cobalt failed, falling back:', err);
      }
    }

    // DASH: merge video + audio based on settings.mergeMethod
    if (quality.type === 'dash' && quality.audioUrl) {
      if (settings.mergeMethod === 'direct') {
        console.log('[SD-BG] Direct mode: skipping merge, downloading video-only');
      } else if (settings.mergeMethod === 'ffmpeg') {
        try {
          console.log('[SD-BG] FFmpeg merge, video:', quality.url.slice(0, 80));
          job.status = 'merging';
          broadcastQueueUpdate(queue.getJobs());
          await mergeDashAndDownload(quality.url, quality.audioUrl, filename, onProgress);
          return;
        } catch (err) {
          console.warn('[SD-BG] FFmpeg merge failed, falling back to video-only:', err);
        }
      } else {
        // mp4box (default)
        try {
          console.log('[SD-BG] MP4Box merge, video:', quality.url.slice(0, 80));
          job.status = 'merging';
          broadcastQueueUpdate(queue.getJobs());
          await mergeWithMp4box(quality.url, quality.audioUrl, filename, onProgress);
          return;
        } catch (err) {
          console.warn('[SD-BG] MP4Box merge failed, falling back to video-only:', err);
        }
      }
    }

    // Final fallback: direct CDN download (video-only for DASH)
    console.log('[SD-BG] Direct download (video-only):', quality.url.slice(0, 100));
    try {
      await chrome.downloads.download({
        url: quality.url,
        filename: `${filename}.mp4`,
        saveAs: false,
      });
      onProgress(100);
    } catch (err) {
      console.error('[SD-BG] Download failed:', err);
      throw err;
    }
  }

  queue = new DownloadQueue({
    concurrency: settings.concurrency,
    onUpdate: broadcastQueueUpdate,
    onComplete: async (job) => {
      await addHistoryEntry({
        id: job.videoInfo.id,
        title: job.videoInfo.title,
        platform: job.videoInfo.platform,
        sourceUrl: job.videoInfo.sourceUrl,
        downloadedAt: Date.now(),
      });
      const history = await getHistory();
      chrome.runtime.sendMessage({ type: 'HISTORY_UPDATE', payload: history }).catch(() => {});
    },
    _executeJob: executeJob,
  });

  chrome.runtime.onMessage.addListener((message: AnyMessage, _sender, sendResponse) => {
    const msg = message as any;

    // Relay offscreen logs to SW console
    if (msg.type === 'OFFSCREEN_LOG') {
      console.log('[SD-Offscreen]', msg.payload);
      return false;
    }

    // Side panel requests scan activation on current tab
    if (msg.type === 'REQUEST_SCAN') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'ACTIVATE_SCAN' }).catch(() => {});
        }
      });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'BULK_DOWNLOAD_REQUEST') {
      const { videos, quality } = msg.payload;
      console.log('[SD-BG] BULK_DOWNLOAD_REQUEST received:', videos.length, 'videos, quality:', quality);
      videos.forEach((v: any, i: number) => {
        queue.add({
          id: `${v.id}-${Date.now()}-${i}`,
          videoInfo: v,
          selectedQuality: quality,
          status: 'pending',
          progress: 0,
          retryCount: 0,
        });
      });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'GET_QUEUE') { sendResponse({ payload: queue.getJobs() }); return true; }
    if (msg.type === 'GET_HISTORY') { getHistory().then(h => sendResponse({ payload: h })); return true; }
    if (msg.type === 'GET_SETTINGS') { sendResponse({ payload: settings }); return true; }

    if (msg.type === 'UPDATE_SETTINGS') {
      settings = { ...settings, ...msg.payload };
      saveSettings(settings);
      queue.updateConcurrency(settings.concurrency);
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'CLEAR_HISTORY') {
      clearHistory().then(() => sendResponse({ ok: true }));
      return true;
    }

    if (msg.type === 'CANCEL_JOB') { sendResponse({ ok: true }); return true; }
  });

  // Open side panel when extension icon is clicked
  chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});
