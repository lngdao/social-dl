import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  extensionApi: 'chrome',
  vite: () => ({
    plugins: [preact(), tailwindcss()],
  }),
  manifest: {
    name: 'Social-DL',
    version: '2026.405.1',
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
      '*://*.canine.tools/*',
      '*://*.meowing.de/*',
      '*://*.imput.net/*',
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    web_accessible_resources: [
      {
        resources: ['ffmpeg/ffmpeg-core.js', 'ffmpeg/ffmpeg-core.wasm'],
        matches: ['<all_urls>'],
        use_dynamic_url: false,
      },
    ],
    action: { default_title: 'Social Downloader' },
    side_panel: { default_path: 'sidepanel.html' },
  },
});
