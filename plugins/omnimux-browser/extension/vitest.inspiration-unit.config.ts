import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

/** Deterministic module/DOM units only; real browser acceptance uses the QA runner. */
export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] })],
  test: { include: ['src/**/*.test.ts'], environment: 'jsdom', setupFiles: ['tests/setup.ts'] },
})
