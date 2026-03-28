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
      '*://*.fbcdn.net/*',
      '*://*.cdninstagram.com/*',
      '*://*.tiktokcdn.com/*',
    ],
    side_panel: { default_path: 'sidepanel.html' },
  },
});
