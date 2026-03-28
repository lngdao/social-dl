import { FFmpeg } from '@ffmpeg/ffmpeg';
import { OffscreenMsg } from '../../src/shared/messages';

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  console.log('[SD-Offscreen] Loading ffmpeg.wasm...');
  ffmpegInstance = new FFmpeg();
  await ffmpegInstance.load({
    coreURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.js'),
    wasmURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.wasm'),
    workerURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.worker.js'),
  });
  console.log('[SD-Offscreen] ffmpeg.wasm loaded');
  return ffmpegInstance;
}

let queue: Promise<void> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue = queue.then(() => job().then(resolve, reject));
  });
}

function toSW(msg: object) {
  chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
}

async function mergeDash(jobId: string, videoUrl: string, audioUrl: string): Promise<string> {
  const ffmpeg = await getFFmpeg();

  toSW({ type: OffscreenMsg.MERGE_DASH_PROGRESS, payload: { jobId, progress: 0.1 } });
  console.log('[SD-Offscreen] Fetching video...', videoUrl.slice(0, 80));
  const videoResp = await fetch(videoUrl);
  if (!videoResp.ok) throw new Error(`Video fetch failed: ${videoResp.status}`);
  const videoData = new Uint8Array(await videoResp.arrayBuffer());
  console.log('[SD-Offscreen] Video fetched:', videoData.length, 'bytes');
  await ffmpeg.writeFile('video.mp4', videoData);

  toSW({ type: OffscreenMsg.MERGE_DASH_PROGRESS, payload: { jobId, progress: 0.3 } });
  console.log('[SD-Offscreen] Fetching audio...', audioUrl.slice(0, 80));
  const audioResp = await fetch(audioUrl);
  if (!audioResp.ok) throw new Error(`Audio fetch failed: ${audioResp.status}`);
  const audioData = new Uint8Array(await audioResp.arrayBuffer());
  console.log('[SD-Offscreen] Audio fetched:', audioData.length, 'bytes');
  await ffmpeg.writeFile('audio.mp4', audioData);

  toSW({ type: OffscreenMsg.MERGE_DASH_PROGRESS, payload: { jobId, progress: 0.5 } });
  console.log('[SD-Offscreen] Merging...');
  await ffmpeg.exec([
    '-y', '-i', 'video.mp4', '-i', 'audio.mp4',
    '-c:v', 'copy', '-c:a', 'copy',
    '-shortest', '-movflags', '+faststart',
    'output.mp4',
  ]);

  toSW({ type: OffscreenMsg.MERGE_DASH_PROGRESS, payload: { jobId, progress: 0.9 } });
  const data = await ffmpeg.readFile('output.mp4');
  await Promise.allSettled([
    ffmpeg.deleteFile('video.mp4'),
    ffmpeg.deleteFile('audio.mp4'),
    ffmpeg.deleteFile('output.mp4'),
  ]);

  console.log('[SD-Offscreen] Merge complete');
  return URL.createObjectURL(new Blob([data as BlobPart], { type: 'video/mp4' }));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === OffscreenMsg.MERGE_DASH) {
    const { jobId, videoUrl, audioUrl } = message.payload;
    console.log('[SD-Offscreen] MERGE_DASH received:', jobId);
    sendResponse({ acknowledged: true });
    enqueue(() => mergeDash(jobId, videoUrl, audioUrl))
      .then(blobUrl => toSW({ type: OffscreenMsg.MERGE_DASH_DONE, payload: { jobId, blobUrl } }))
      .catch(err => {
        console.error('[SD-Offscreen] Merge failed:', err);
        try { ffmpegInstance?.terminate(); } catch { /* ignore */ }
        ffmpegInstance = null;
        toSW({ type: OffscreenMsg.MERGE_DASH_ERROR, payload: { jobId, error: err?.message ?? String(err) } });
      });
    return true;
  }

  if (message.type === OffscreenMsg.REVOKE_BLOB_URL) {
    URL.revokeObjectURL(message.payload.blobUrl);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
