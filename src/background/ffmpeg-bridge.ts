import { ensureOffscreenDocument } from './offscreen-manager';
import { OffscreenMsg } from '../shared/messages';

export async function mergeDashAndDownload(
  videoUrl: string,
  audioUrl: string,
  filename: string,
  onProgress: (p: number) => void,
): Promise<void> {
  await ensureOffscreenDocument();

  const jobId = `dash_${Date.now()}`;
  onProgress(10);

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

      if (message.type === OffscreenMsg.MERGE_DASH_PROGRESS) {
        const p = Math.round(message.payload.progress * 100);
        onProgress(Math.min(90, 10 + p * 0.8));
      } else if (message.type === OffscreenMsg.MERGE_DASH_DONE) {
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

    // Pass URLs directly — offscreen document has same host_permissions as the extension
    // This avoids massive ArrayBuffer serialization over chrome.runtime.sendMessage
    chrome.runtime.sendMessage({
      type: OffscreenMsg.MERGE_DASH,
      payload: { jobId, videoUrl, audioUrl },
    });
  });
}
