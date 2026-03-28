import { defineBackground } from 'wxt/utils/define-background';
import { DownloadQueue } from '../src/background/download-queue';
import { addHistoryEntry, getHistory, clearHistory } from '../src/background/history-store';
// NOTE: ffmpeg.wasm cannot run in MV3 service worker (no Worker constructor).
// DASH merge is not supported yet — only direct MP4 downloads work.
import { installRequestInterceptor } from '../src/background/request-interceptor';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../src/shared/storage';
import type { DownloadJob, VideoQuality } from '../src/adapters/types';
import type { AnyMessage, ContentToBackground, SidePanelToBackground } from '../src/shared/messages';

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

    console.log('[SD-BG] executeJob:', job.id, 'quality:', quality?.label, 'type:', quality?.type, 'url:', quality?.url?.slice(0, 80));

    if (!quality) throw new Error('No quality available');

    if (quality.type === 'dash' && quality.audioUrl) {
      // DASH merge not supported in MV3 service worker — download video-only track
      console.log('[SD-BG] DASH detected, falling back to video-only download:', quality.url.slice(0, 120));
      try {
        const downloadId = await chrome.downloads.download({
          url: quality.url,
          filename: `${job.videoInfo.platform}_${job.videoInfo.id}.mp4`,
          saveAs: false,
        });
        console.log('[SD-BG] Download started (video-only), id:', downloadId);
      } catch (err) {
        console.error('[SD-BG] Download failed:', err);
        throw err;
      }
      onProgress(100);
    } else {
      console.log('[SD-BG] Direct MP4 download:', quality.url.slice(0, 120));
      try {
        const downloadId = await chrome.downloads.download({
          url: quality.url,
          filename: `${job.videoInfo.platform}_${job.videoInfo.id}.mp4`,
          saveAs: false,
        });
        console.log('[SD-BG] Download started, id:', downloadId);
      } catch (err) {
        console.error('[SD-BG] Download failed:', err);
        throw err;
      }
      onProgress(100);
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
    const msg = message as ContentToBackground & SidePanelToBackground;

    if (msg.type === 'BULK_DOWNLOAD_REQUEST') {
      const { videos, quality } = msg.payload;
      console.log('[SD-BG] BULK_DOWNLOAD_REQUEST received:', videos.length, 'videos, quality:', quality);
      videos.forEach((v, i) => {
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

  chrome.action.onClicked.addListener((tab) => {
    if (tab.id) chrome.sidePanel.open({ tabId: tab.id });
  });
});
