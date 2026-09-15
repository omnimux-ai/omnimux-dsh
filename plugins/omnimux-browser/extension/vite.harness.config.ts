import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vite'

/**
 * Static acceptance harness for the conversation media gallery.
 *
 * Builds `tests/harness/index.html` + `frame.html` — the real panel component
 * against fixed fixtures — into a plain static directory that any file server
 * can host (`python3 -m http.server`). It is not part of the extension bundle
 * and copies no manifest: only the two pages plus `public/`.
 *
 *   pnpm exec vite build --config vite.harness.config.ts
 */
const harnessRoot = resolve(import.meta.dirname, 'tests/harness')

export default defineConfig({
  root: harnessRoot,
  base: './',
  publicDir: resolve(harnessRoot, 'public'),
  plugins: [react(), tsconfigPaths({ projects: [resolve(import.meta.dirname, 'tsconfig.json')] })],
  build: {
    outDir: resolve(harnessRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(harnessRoot, 'index.html'),
        frame: resolve(harnessRoot, 'frame.html'),
        security: resolve(harnessRoot, 'security.html'),
      },
    },
  },
})
