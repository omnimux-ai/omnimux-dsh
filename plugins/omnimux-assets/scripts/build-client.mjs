import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = join(root, 'lib', 'client.js')

// `CLOUD_ASSETS_BASE_URL` is a build input, not a runtime one: the browser has
// no process.env, so the value is inlined here. Setting it to a gateway base URL
// (or to `local`) pins the cloud tab to that source; leaving it unset keeps the
// production gateway with the adaptive local fallback, and
// `window.__OMNIMUX_CLOUD_ASSETS_BASE_URL__` still overrides both at runtime.
// See src/client/cloud-source.js.
const cloudAssetsBaseUrl = process.env.CLOUD_ASSETS_BASE_URL
const define = typeof cloudAssetsBaseUrl === 'string'
  ? { __CLOUD_ASSETS_BASE_URL__: JSON.stringify(cloudAssetsBaseUrl) }
  : {}

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.js'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  write: false,
  logLevel: 'info',
  define,
  external: [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
})

const code = result.outputFiles[0]?.text
if (!code) throw new Error('esbuild produced no output')

const wrapped = `window.__ModuleLoader__.load({
  id: "omnimux-assets",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  }
});
`

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, wrapped)
console.log(`wrote ${outFile} (${wrapped.length} bytes)`)
