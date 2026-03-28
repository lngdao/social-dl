import { ensureOffscreenDocument } from './offscreen-manager';
import { OffscreenMsg } from '../shared/messages';

export async function mergeDashAndDownload(
  videoUrl: string,
  audioUrl: string,
  filename: string,
  onProgress: (p: number) => void,
): Promise<void> {
  // Fetch in service worker — has host_permissions for fbcdn.net / cdninstagram.com etc.
  console.log('[SD-BG] Fetching video track...');
  onProgress(10);
  const videoData = await fetch(videoUrl).then(r => r.arrayBuffer());
  onProgress(30);
  console.log('[SD-BG] Fetching audio track...');
  const audioData = await fetch(audioUrl).then(r => r.arrayBuffer());
  onProgress(50);

  await ensureOffscreenDocument();

  const jobId = `dash_${Date.now()}`;

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error('FFmpeg merge timed out'));
    }, 5 * 60 * 1000);

    const listener = (message: any) => {
      if (message.payload?.jobId !== jobId) return;

      if (message.type === OffscreenMsg.MERGE_DASH_DONE) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        onProgress(90);
        chrome.downloads.download(
          { url: message.payload.blobUrl, filename: `${filename}.mp4`, saveAs: false },
          () => {
            chrome.runtime.sendMessage({
              type: OffscreenMsg.REVOKE_BLOB_URL,
              payload: { blobUrl: message.payload.blobUrl },
            });
            onProgress(100);
            resolve();
          },
        );
      } else if (message.type === OffscreenMsg.MERGE_DASH_ERROR) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error(message.payload.error));
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    // ArrayBuffers cannot be transferred over sendMessage — convert to plain arrays
    chrome.runtime.sendMessage({
      type: OffscreenMsg.MERGE_DASH,
      payload: {
        jobId,
        videoData: Array.from(new Uint8Array(videoData)),
        audioData: Array.from(new Uint8Array(audioData)),
      },
    });
  });
}
