import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  extensionApi: 'chrome',
  vite: () => ({
    plugins: [preact(), tailwindcss()],
  }),
  manifest: {
    name: 'Social Downloader',
    version: '1.0.0',
    permissions: ['webRequest', 'storage', 'sidePanel', 'downloads'],
    host_permissions: [
      '*://*.facebook.com/*',
      '*://*.instagram.com/*',
      '*://*.tiktok.com/*',
      '*://*.tiktokv.com/*',
      '*://*.fbcdn.net/*',
      '*://*.cdninstagram.com/*',
      '*://*.tiktokcdn.com/*',
    ],
    // NOTE: ffmpeg is currently loaded from unpkg.com CDN (wasm-unsafe-eval required for wasm).
    // TODO: Bundle the wasm files locally to remove the CDN dependency.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://unpkg.com;",
    },
    side_panel: { default_path: 'sidepanel.html' },
  },
});
