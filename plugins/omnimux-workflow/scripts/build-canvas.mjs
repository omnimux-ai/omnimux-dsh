/**
 * Build the canvas island bundle: src/canvas/index.tsx -> lib/canvas.js.
 *
 * React 19.2.8 + react-dom are BUNDLED IN (not external) — this is the
 * React-island strategy (plan §2.2 α): the island owns its own React
 * runtime and never exchanges elements/refs/context with the host React 18
 * tree. Format: IIFE with global `__omnimuxWorkflowCanvas`, lazy-loaded by
 * CanvasBridge via GET /omnimux-workflow/canvas.js.
 *
 * `--harness`（dev-only entry，W1 T1.3）：额外把
 * src/canvas/harness/harness.tsx 打到 dist-harness/canvas-harness.js
 * （非压缩 + inline sourcemap），由 scripts/canvas-harness.mjs 伺服。
 * 生产构建不带此 flag，harness 代码不进 lib/。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(root, '../..')
const outFile = join(root, 'lib', 'canvas.js')
const withHarness = process.argv.includes('--harness')

const shared = {
  absWorkingDir: root,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  write: false,
  logLevel: 'info',
  legalComments: 'none',
  nodePaths: [
    join(root, 'node_modules'),
    join(repoRoot, 'node_modules/.pnpm/node_modules'),
    join(repoRoot, 'node_modules'),
  ],
  loader: {
    '.css': 'text',
  },
}

const result = await esbuild.build({
  ...shared,
  entryPoints: ['src/canvas/index.tsx'],
  globalName: '__omnimuxWorkflowCanvas',
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})

const code = result.outputFiles[0]?.text
if (!code) throw new Error('esbuild produced no output')

// `--harness` is a visual-acceptance watcher. It MUST NOT rewrite the
// production island at lib/canvas.js, or a concurrent L3 sync will drift
// the moment any src/canvas file changes.
if (!withHarness) {
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, code)
  console.log(`wrote ${outFile} (${code.length} bytes)`)
} else {
  console.log(`skipped ${outFile} (--harness does not write production bundle)`)
}

if (withHarness) {
  const harnessOut = join(root, 'dist-harness', 'canvas-harness.js')
  const harnessResult = await esbuild.build({
    ...shared,
    entryPoints: ['src/canvas/harness/harness.tsx'],
    minify: false,
    sourcemap: 'inline',
    define: {
      'process.env.NODE_ENV': '"development"',
    },
  })
  const harnessCode = harnessResult.outputFiles[0]?.text
  if (!harnessCode) throw new Error('esbuild produced no harness output')
  mkdirSync(dirname(harnessOut), { recursive: true })
  writeFileSync(harnessOut, harnessCode)
  console.log(`wrote ${harnessOut} (${harnessCode.length} bytes)`)
}
