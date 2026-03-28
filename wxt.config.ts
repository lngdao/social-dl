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
    permissions: ['webRequest', 'storage', 'sidePanel', 'downloads', 'offscreen'],
    host_permissions: [
      '*://*.facebook.com/*',
      '*://*.instagram.com/*',
      '*://*.tiktok.com/*',
      '*://*.tiktokv.com/*',
      '*://*.fbcdn.net/*',
      '*://*.cdninstagram.com/*',
      '*://*.tiktokcdn.com/*',
      '*://api.cobalt.tools/*',
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    web_accessible_resources: [
      {
        resources: ['ffmpeg/ffmpeg-core.js', 'ffmpeg/ffmpeg-core.wasm', 'ffmpeg/ffmpeg-core.worker.js'],
        matches: ['<all_urls>'],
        use_dynamic_url: false,
      },
    ],
    action: { default_title: 'Social Downloader' },
    side_panel: { default_path: 'sidepanel.html' },
  },
});
