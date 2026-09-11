import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = join(root, 'lib', 'client.js')

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.js'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  write: false,
  logLevel: 'info',
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
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
})

const code = result.outputFiles[0]?.text
if (!code) throw new Error('esbuild produced no output')

const wrapped = `window.__ModuleLoader__.load({
  id: "omnimux",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    if (typeof window !== "undefined") window.__dshClientRequire__ = require;
${code}
    return module.exports;
  }
});
`

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, wrapped)
console.log(`wrote ${outFile} (${wrapped.length} bytes)`)
