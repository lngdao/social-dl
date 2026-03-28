const OFFSCREEN_URL = 'offscreen.html';

async function hasOffscreenDocument(): Promise<boolean> {
  try {
    const contexts = await (chrome.runtime as any).getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    });
    console.log('[SD-Offscreen-Mgr] getContexts result:', contexts.length, 'documents');
    return contexts.length > 0;
  } catch (err) {
    console.error('[SD-Offscreen-Mgr] getContexts failed:', err);
    return false;
  }
}

export async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    console.log('[SD-Offscreen-Mgr] Offscreen document already exists');
    return;
  }

  console.log('[SD-Offscreen-Mgr] Creating offscreen document:', chrome.runtime.getURL(OFFSCREEN_URL));
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Run ffmpeg.wasm to merge DASH video+audio into MP4',
    });
    console.log('[SD-Offscreen-Mgr] Offscreen document created, waiting for init...');
    // Give the document time to initialize its message listener
    await new Promise(r => setTimeout(r, 500));
    console.log('[SD-Offscreen-Mgr] Offscreen document ready');
  } catch (err) {
    console.error('[SD-Offscreen-Mgr] createDocument failed:', err);
    throw err;
  }
}
