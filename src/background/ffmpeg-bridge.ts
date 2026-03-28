import { ensureOffscreenDocument } from './offscreen-manager';
import { OffscreenMsg } from '../shared/messages';

export async function mergeDashAndDownload(
  videoUrl: string,
  audioUrl: string,
  filename: string,
  onProgress: (p: number) => void,
): Promise<void> {
  console.log('[SD-Bridge] Creating offscreen document...');
  try {
    await ensureOffscreenDocument();
    console.log('[SD-Bridge] Offscreen document ready');
  } catch (err) {
    console.error('[SD-Bridge] Failed to create offscreen document:', err);
    throw err;
  }

  const jobId = `dash_${Date.now()}`;
  onProgress(10);

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      chrome.runtime.onMessage.removeListener(listener);
      console.error('[SD-Bridge] FFmpeg merge timed out for job:', jobId);
      reject(new Error('FFmpeg merge timed out'));
    }, 5 * 60 * 1000);

    const listener = (message: any, sender: any, sendResponse: any) => {
      if (message.payload?.jobId !== jobId) return;

      console.log('[SD-Bridge] Received message:', message.type, 'for job:', jobId);

      if (message.type === OffscreenMsg.MERGE_DASH_PROGRESS) {
        const p = Math.round(message.payload.progress * 100);
        onProgress(Math.min(90, 10 + p * 0.8));
      } else if (message.type === OffscreenMsg.MERGE_DASH_DONE) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        onProgress(90);
        console.log('[SD-Bridge] Merge done, downloading blob:', message.payload.blobUrl?.slice(0, 50));
        chrome.downloads.download(
          { url: message.payload.blobUrl, filename: `${filename}.mp4`, saveAs: false },
          (downloadId) => {
            console.log('[SD-Bridge] Download started, id:', downloadId);
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
        console.error('[SD-Bridge] Merge error:', message.payload.error);
        reject(new Error(message.payload.error));
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    console.log('[SD-Bridge] Sending MERGE_DASH to offscreen, job:', jobId);
    chrome.runtime.sendMessage(
      {
        type: OffscreenMsg.MERGE_DASH,
        payload: { jobId, videoUrl, audioUrl },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[SD-Bridge] sendMessage error:', chrome.runtime.lastError.message);
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);
            reject(new Error(`sendMessage failed: ${chrome.runtime.lastError.message}`));
          }
        } else {
          console.log('[SD-Bridge] Offscreen acknowledged:', response);
        }
      },
    );
  });
}
