import type { Config } from 'tailwindcss';

export default {
  content: [
    './entrypoints/**/*.{html,ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
} satisfies Config;
