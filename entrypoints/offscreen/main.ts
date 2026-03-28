import { FFmpeg } from '@ffmpeg/ffmpeg';
import { OffscreenMsg } from '../../src/shared/messages';

// Relay ALL errors/logs to service worker since we can't inspect offscreen console
function toSW(msg: object) {
  chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
}

function logToSW(...args: unknown[]) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  toSW({ type: 'OFFSCREEN_LOG', payload: msg });
}

// Catch all unhandled errors and relay to SW
self.addEventListener('error', (e) => {
  logToSW('[SD-Offscreen] GLOBAL ERROR:', e.message, e.filename, e.lineno);
});
self.addEventListener('unhandledrejection', (e) => {
  logToSW('[SD-Offscreen] UNHANDLED REJECTION:', String(e.reason));
});

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  logToSW('Loading ffmpeg.wasm...');
  ffmpegInstance = new FFmpeg();

  const coreURL = chrome.runtime.getURL('ffmpeg/ffmpeg-core.js');
  const wasmURL = chrome.runtime.getURL('ffmpeg/ffmpeg-core.wasm');
  logToSW('Core URLs:', coreURL.slice(0, 60), wasmURL.slice(0, 60));

  // Use single-threaded core (no workerURL) — multi-threaded hangs in offscreen documents
  await ffmpegInstance.load({ coreURL, wasmURL });
  logToSW('ffmpeg.wasm loaded successfully');
  return ffmpegInstance;
}

let queue: Promise<void> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue = queue.then(() => job().then(resolve, reject));
  });
}

async function mergeDash(jobId: string, videoUrl: string, audioUrl: string): Promise<string> {
  logToSW('Starting merge for job:', jobId);

  const ffmpeg = await getFFmpeg();

  toSW({ type: OffscreenMsg.MERGE_DASH_PROGRESS, payload: { jobId, progress: 0.1 } });
  logToSW('Fetching video...', videoUrl.slice(0, 80));
  const videoResp = await fetch(videoUrl);
  if (!videoResp.ok) throw new Error(`Video fetch failed: ${videoResp.status} ${videoResp.statusText}`);
  const videoData = new Uint8Array(await videoResp.arrayBuffer());
  logToSW('Video fetched:', videoData.length, 'bytes');
  await ffmpeg.writeFile('video.mp4', videoData);

  toSW({ type: OffscreenMsg.MERGE_DASH_PROGRESS, payload: { jobId, progress: 0.3 } });
  logToSW('Fetching audio...', audioUrl.slice(0, 80));
  const audioResp = await fetch(audioUrl);
  if (!audioResp.ok) throw new Error(`Audio fetch failed: ${audioResp.status} ${audioResp.statusText}`);
  const audioData = new Uint8Array(await audioResp.arrayBuffer());
  logToSW('Audio fetched:', audioData.length, 'bytes');
  await ffmpeg.writeFile('audio.mp4', audioData);

  toSW({ type: OffscreenMsg.MERGE_DASH_PROGRESS, payload: { jobId, progress: 0.5 } });
  logToSW('Running ffmpeg merge...');
  await ffmpeg.exec([
    '-y', '-i', 'video.mp4', '-i', 'audio.mp4',
    '-c:v', 'copy', '-c:a', 'copy',
    '-shortest', '-movflags', '+faststart',
    'output.mp4',
  ]);

  toSW({ type: OffscreenMsg.MERGE_DASH_PROGRESS, payload: { jobId, progress: 0.9 } });
  logToSW('Reading output...');
  const data = await ffmpeg.readFile('output.mp4');
  await Promise.allSettled([
    ffmpeg.deleteFile('video.mp4'),
    ffmpeg.deleteFile('audio.mp4'),
    ffmpeg.deleteFile('output.mp4'),
  ]);

  const blobUrl = URL.createObjectURL(new Blob([data as BlobPart], { type: 'video/mp4' }));
  logToSW('Merge complete, blob:', blobUrl.slice(0, 50));
  return blobUrl;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === OffscreenMsg.MERGE_DASH) {
    const { jobId, videoUrl, audioUrl } = message.payload;
    logToSW('MERGE_DASH received, job:', jobId);
    sendResponse({ acknowledged: true });
    enqueue(() => mergeDash(jobId, videoUrl, audioUrl))
      .then(blobUrl => {
        logToSW('Sending MERGE_DASH_DONE');
        toSW({ type: OffscreenMsg.MERGE_DASH_DONE, payload: { jobId, blobUrl } });
      })
      .catch(err => {
        logToSW('MERGE FAILED:', err?.message ?? String(err));
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

logToSW('Offscreen document initialized');
