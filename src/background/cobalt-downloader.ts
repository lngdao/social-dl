/**
 * Download video via Cobalt API.
 * Cobalt handles DASH merge server-side — returns single merged MP4 URL.
 *
 * Uses community instances by default. Can be configured to use self-hosted.
 * List of instances: https://instances.cobalt.best/
 */

const DEFAULT_INSTANCE = 'https://api.cobalt.tools';

interface CobaltResponse {
  status: 'tunnel' | 'redirect' | 'picker' | 'local-processing' | 'error';
  url?: string;
  filename?: string;
  error?: { code: string };
  picker?: Array<{ type: string; url: string; thumb?: string }>;
}

export async function downloadViaCobalt(
  mediaUrl: string,
  filename: string,
  onProgress: (p: number) => void,
  instanceUrl?: string,
): Promise<void> {
  const instance = instanceUrl ?? DEFAULT_INSTANCE;
  onProgress(10);
  console.log('[SD-Cobalt] Requesting:', mediaUrl, 'from', instance);

  const response = await fetch(`${instance}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      url: mediaUrl,
      videoQuality: '1080',
      downloadMode: 'auto',
      filenameStyle: 'pretty',
    }),
  });

  if (!response.ok) {
    throw new Error(`Cobalt request failed: ${response.status} ${response.statusText}`);
  }

  const data: CobaltResponse = await response.json();
  console.log('[SD-Cobalt] Response:', data.status, data.filename ?? '');
  onProgress(50);

  if (data.status === 'error') {
    throw new Error(`Cobalt error: ${data.error?.code ?? 'unknown'}`);
  }

  if (data.status === 'tunnel' || data.status === 'redirect') {
    if (!data.url) throw new Error('No download URL in response');
    const downloadId = await chrome.downloads.download({
      url: data.url,
      filename: data.filename ?? `${filename}.mp4`,
      saveAs: false,
    });
    console.log('[SD-Cobalt] Download started, id:', downloadId);
    onProgress(100);
    return;
  }

  if (data.status === 'picker' && data.picker?.length) {
    // Download first video item from picker (carousel)
    const videoItem = data.picker.find(p => p.type === 'video') ?? data.picker[0];
    if (!videoItem?.url) throw new Error('No video in picker response');
    await chrome.downloads.download({
      url: videoItem.url,
      filename: `${filename}.mp4`,
      saveAs: false,
    });
    onProgress(100);
    return;
  }

  throw new Error(`Unexpected Cobalt response status: ${data.status}`);
}
