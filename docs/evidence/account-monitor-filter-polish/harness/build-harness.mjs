/**
 * Build the #3164 acceptance page: the real `InspirationStage` (account
 * monitoring) plus its own injected stylesheet, bundled with the repo's react
 * and the repo's `ui-kit-shim` in place of `dsh-ui-kit` — the production kit
 * bundles @deepseek-ai/dsh-client-ui-primitives with CSS modules esbuild cannot
 * follow, and the repo's own render tests make the same substitution.
 *
 *   node docs/evidence/account-monitor-pool-bar-trim/harness/build-harness.mjs
 *
 * Output: harness-bundle.js next to index.html. Serve this directory statically
 * and open index.html.
 */
import { build } from 'esbuild'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..', '..', '..', '..')
const SHIM = resolve(ROOT, 'plugins/omnimux-inspiration/src/client/test-fixtures/ui-kit-shim.mjs')

await build({
  absWorkingDir: ROOT,
  entryPoints: [resolve(here, 'harness-entry.jsx')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  outfile: resolve(here, 'harness-bundle.js'),
  logLevel: 'warning',
  alias: {
    'dsh-ui-kit': SHIM,
  },
})
