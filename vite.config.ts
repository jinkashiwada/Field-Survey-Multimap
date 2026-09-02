import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  plugins: [react()],
});
