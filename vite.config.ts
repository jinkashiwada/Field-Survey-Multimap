import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export function resolveBasePath(
  repository = process.env.GITHUB_REPOSITORY,
  explicit = process.env.PAGES_BASE_PATH,
): string {
  if (explicit) {
    const prefixed = explicit.startsWith('/') ? explicit : `/${explicit}`;
    return prefixed.endsWith('/') ? prefixed : `${prefixed}/`;
  }
  if (!repository || !process.env.GITHUB_ACTIONS) {
    return '/';
  }
  const [owner, name] = repository.split('/');
  if (!name || name.toLowerCase() === `${owner?.toLowerCase()}.github.io`) {
    return '/';
  }
  return `/${name}/`;
}

export default defineConfig({
  base: resolveBasePath(),
  plugins: [
    react(),
    {
      name: 'photo-map-production-csp',
      apply: 'build',
      transformIndexHtml: (html) =>
        html.replace(' ws://localhost:* ws://127.0.0.1:*', ''),
    },
  ],
  optimizeDeps: { include: ['@zip.js/zip.js/index-native.js'] },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        photoMap: resolve(import.meta.dirname, 'photo-map/index.html'),
      },
    },
  },
});
