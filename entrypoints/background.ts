import { defineBackground } from 'wxt/utils/define-background';
import { DownloadQueue } from '../src/background/download-queue';
import { addHistoryEntry, getHistory, clearHistory } from '../src/background/history-store';
import { mergeDashToMp4 } from '../src/background/ffmpeg-merge';
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
    if (!quality) throw new Error('No quality available');

    if (quality.type === 'dash' && quality.audioUrl) {
      job.status = 'merging';
      broadcastQueueUpdate(queue.getJobs());
      const blob = await mergeDashToMp4(quality.url, quality.audioUrl, onProgress);
      const blobUrl = URL.createObjectURL(blob);
      await chrome.downloads.download({
        url: blobUrl,
        filename: `${job.videoInfo.platform}_${job.videoInfo.id}.mp4`,
        saveAs: false,
      });
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } else {
      await chrome.downloads.download({
        url: quality.url,
        filename: `${job.videoInfo.platform}_${job.videoInfo.id}.mp4`,
        saveAs: false,
      });
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
