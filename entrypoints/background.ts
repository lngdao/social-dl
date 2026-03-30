import { defineBackground } from 'wxt/utils/define-background';
import { zipSync } from 'fflate';
import { DownloadQueue } from '../src/background/download-queue';
import { addHistoryEntry, getHistory, clearHistory } from '../src/background/history-store';
import { installRequestInterceptor } from '../src/background/request-interceptor';
import { downloadViaCobalt } from '../src/background/cobalt-downloader';
import { mergeDashAndDownload } from '../src/background/ffmpeg-bridge';
import { mergeWithMp4box, mergeToBlob } from '../src/background/mp4box-merge';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../src/shared/storage';
import type { DownloadJob, VideoInfo, VideoQuality } from '../src/adapters/types';
import type { AnyMessage } from '../src/shared/messages';

export default defineBackground(() => {
  installRequestInterceptor();

  let settings = { ...DEFAULT_SETTINGS };
  getSettings().then(s => { settings = s; });

  let queue: DownloadQueue;

  function broadcastQueueUpdate(jobs: DownloadJob[]) {
    chrome.runtime.sendMessage({ type: 'QUEUE_UPDATE', payload: jobs }).catch(() => {});
  }

  function pickQuality(job: DownloadJob): VideoQuality {
    const quality = job.selectedQuality === 'highest'
      ? job.videoInfo.qualities[0]
      : job.videoInfo.qualities.find(q => q.label === job.selectedQuality) ?? job.videoInfo.qualities[0];
    if (!quality) throw new Error('No quality available');
    return quality;
  }

  /**
   * Prepare a video as raw bytes (Uint8Array) without triggering a download.
   * Used for ZIP batching when downloading multiple videos.
   * Has fallback: try merge → fall back to video-only on failure.
   */
  async function prepareVideoBlob(
    videoInfo: VideoInfo,
    quality: VideoQuality,
    onProgress: (p: number) => void,
  ): Promise<Uint8Array> {
    // If audio merge is needed and enabled, try mp4box merge
    if (quality.type === 'dash' && quality.audioUrl && settings.includeAudio && settings.mergeMethod === 'mp4box') {
      try {
        console.log('[SD-BG] MP4Box merge to blob for:', videoInfo.id);
        return await mergeToBlob(quality.url, quality.audioUrl, onProgress);
      } catch (err) {
        console.warn('[SD-BG] MP4Box merge failed for', videoInfo.id, '— falling back to video-only:', err);
      }
    }

    // Fallback: direct fetch of the video URL (video-only)
    console.log('[SD-BG] Fetching video-only blob for:', videoInfo.id);
    onProgress(10);
    const resp = await fetch(quality.url);
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
    onProgress(80);
    const buffer = await resp.arrayBuffer();
    onProgress(100);
    return new Uint8Array(buffer);
  }

  async function executeJob(job: DownloadJob, onProgress: (p: number) => void): Promise<void> {
    const quality = pickQuality(job);

    console.log('[SD-BG] executeJob:', job.id, 'quality:', quality.label, 'type:', quality.type, 'merge:', settings.mergeMethod, 'audio:', settings.includeAudio);

    const sourceUrl = job.videoInfo.sourceUrl;
    const filename = `${job.videoInfo.platform}_${job.videoInfo.id}`;

    // Strategy: if we have a sourceUrl, try Cobalt first (server-side DASH merge).
    if (sourceUrl && settings.includeAudio && (sourceUrl.includes('/reel/') || sourceUrl.includes('/video/'))) {
      try {
        console.log('[SD-BG] Trying Cobalt for:', sourceUrl);
        await downloadViaCobalt(sourceUrl, filename, onProgress, settings.cobaltInstance, settings.cobaltApiKey);
        return;
      } catch (err) {
        console.warn('[SD-BG] Cobalt failed, falling back:', err);
      }
    }

    // DASH: merge video + audio based on settings
    if (quality.type === 'dash' && quality.audioUrl && settings.includeAudio) {
      if (settings.mergeMethod === 'ffmpeg') {
        try {
          console.log('[SD-BG] FFmpeg merge, video:', quality.url.slice(0, 80));
          job.status = 'merging';
          broadcastQueueUpdate(queue.getJobs());
          await mergeDashAndDownload(quality.url, quality.audioUrl, filename, onProgress);
          return;
        } catch (err) {
          console.warn('[SD-BG] FFmpeg merge failed, falling back to video-only:', err);
        }
      } else if (settings.mergeMethod === 'mp4box') {
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
      // mergeMethod === 'direct' or merge failed → fall through to video-only
    }

    // Final fallback: direct CDN download (video-only)
    console.log('[SD-BG] Direct download (video-only):', quality.url.slice(0, 100));
    await chrome.downloads.download({ url: quality.url, filename: `${filename}.mp4`, saveAs: false });
    onProgress(100);
  }

  /**
   * Bulk download: process all videos, collect blobs, zip, download once.
   */
  async function executeBulkAsZip(videos: VideoInfo[], qualityLabel: string): Promise<void> {
    console.log(`[SD-BG] Bulk ZIP: ${videos.length} videos`);

    const files: Record<string, Uint8Array> = {};
    let completed = 0;

    for (const video of videos) {
      const quality = qualityLabel === 'highest'
        ? video.qualities[0]
        : video.qualities.find(q => q.label === qualityLabel) ?? video.qualities[0];

      if (!quality) {
        console.warn('[SD-BG] No quality for:', video.id);
        continue;
      }

      const filename = `${video.platform}_${video.id}.mp4`;
      try {
        const data = await prepareVideoBlob(video, quality, () => {});
        files[filename] = data;
        completed++;
        console.log(`[SD-BG] Bulk ZIP: ${completed}/${videos.length} ready`);

        // Add to history
        await addHistoryEntry({
          id: video.id,
          title: video.title,
          platform: video.platform,
          sourceUrl: video.sourceUrl,
          downloadedAt: Date.now(),
          fileSizeBytes: data.byteLength,
        });
      } catch (err) {
        console.error(`[SD-BG] Failed to prepare ${video.id}:`, err);
      }
    }

    if (Object.keys(files).length === 0) {
      throw new Error('No videos could be prepared');
    }

    // ZIP all files
    console.log(`[SD-BG] Zipping ${Object.keys(files).length} files...`);
    const zipped = zipSync(files);
    console.log(`[SD-BG] ZIP size: ${(zipped.byteLength / 1024 / 1024).toFixed(1)} MB`);

    const blob = new Blob([zipped], { type: 'application/zip' });
    const blobUrl = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    await chrome.downloads.download({
      url: blobUrl,
      filename: `social-download-${timestamp}.zip`,
      saveAs: false,
    });

    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);

    // Broadcast history update
    const history = await getHistory();
    chrome.runtime.sendMessage({ type: 'HISTORY_UPDATE', payload: history }).catch(() => {});
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

      if (videos.length > 1) {
        // Multiple videos → ZIP batch (no queue, process directly)
        executeBulkAsZip(videos, quality)
          .then(() => console.log('[SD-BG] Bulk ZIP download complete'))
          .catch(err => console.error('[SD-BG] Bulk ZIP failed:', err));
        sendResponse({ ok: true });
      } else {
        // Single video → normal queue
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
      }
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
