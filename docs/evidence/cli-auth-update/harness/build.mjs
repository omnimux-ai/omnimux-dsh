/**
 * Bundles the harness entry together with the REAL plugin client source.
 * Run: node build.mjs   (from this directory)
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
// WT root: harness -> cli-auth-update -> evidence -> docs -> WT
const wt = join(here, '..', '..', '..', '..')

const result = await esbuild.build({
  absWorkingDir: here,
  entryPoints: [join(here, 'entry.jsx')],
  outdir: join(here, 'dist'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  // CSS Modules used by @deepseek-ai/dsh-client-ui-primitives / dsh-ui-kit.
  // katex's stylesheet pulls webfonts that this panel never renders: drop them.
  loader: {
    '.css': 'local-css',
    '.woff': 'empty',
    '.woff2': 'empty',
    '.ttf': 'empty',
    '.eot': 'empty',
  },
  // react lives at the WT root; dsh-ui-kit is a plugin-local file: dependency
  nodePaths: [join(wt, 'node_modules'), join(wt, 'plugins', 'omnimux', 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
  metafile: true,
})

console.log('build ok:', Object.keys(result.metafile.outputs).join(', '))
