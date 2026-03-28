import { FFmpeg } from '@ffmpeg/ffmpeg';
import { OffscreenMsg } from '../../src/shared/messages';

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  ffmpegInstance = new FFmpeg();
  await ffmpegInstance.load({
    coreURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.js'),
    wasmURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.wasm'),
    workerURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.worker.js'),
  });
  return ffmpegInstance;
}

let queue: Promise<void> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue = queue.then(() => job().then(resolve, reject));
  });
}

async function mergeDash(jobId: string, videoArray: number[], audioArray: number[]): Promise<string> {
  const ffmpeg = await getFFmpeg();
  const videoData = new Uint8Array(videoArray);
  const audioData = new Uint8Array(audioArray);
  await ffmpeg.writeFile('video.mp4', videoData);
  await ffmpeg.writeFile('audio.mp4', audioData);
  await ffmpeg.exec([
    '-y', '-i', 'video.mp4', '-i', 'audio.mp4',
    '-c:v', 'copy', '-c:a', 'copy',
    '-shortest', '-movflags', '+faststart',
    'output.mp4',
  ]);
  const data = await ffmpeg.readFile('output.mp4');
  await Promise.allSettled([
    ffmpeg.deleteFile('video.mp4'),
    ffmpeg.deleteFile('audio.mp4'),
    ffmpeg.deleteFile('output.mp4'),
  ]);
  return URL.createObjectURL(new Blob([data as BlobPart], { type: 'video/mp4' }));
}

function toSW(msg: object) {
  chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === OffscreenMsg.MERGE_DASH) {
    const { jobId, videoData, audioData } = message.payload;
    sendResponse({ acknowledged: true });
    enqueue(() => mergeDash(jobId, videoData, audioData))
      .then(blobUrl => toSW({ type: OffscreenMsg.MERGE_DASH_DONE, payload: { jobId, blobUrl } }))
      .catch(err => {
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
