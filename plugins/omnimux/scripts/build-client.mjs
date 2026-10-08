import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = join(root, 'lib', 'client.js')
const metaFile = join(root, 'lib', 'client.metafile.json')

// Host loads src directly; its rule facades must resolve only this packaged bundle.
const coreRoot = join(root, '..', '..', 'packages', 'generation-capabilities')
const coreSources = ['package.json', 'src/assets.js', 'src/codes.js', 'src/index.js', 'src/units.js', 'types/index.d.ts']
const sourceHash = createHash('sha256')
for (const file of coreSources) {
  sourceHash.update(file).update('\0').update(readFileSync(join(coreRoot, file))).update('\0')
}
const coreResult = await esbuild.build({
  absWorkingDir: coreRoot,
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  write: false,
  metafile: true,
  logLevel: 'info',
  banner: { js: `// Generated from @omnimux/generation-capabilities; source-sha256: ${sourceHash.digest('hex')}` },
})
if (Object.values(coreResult.metafile.outputs).some((output) => output.imports.length > 0)) {
  throw new Error('generation core bundle contains external runtime imports')
}
const coreCode = coreResult.outputFiles[0]?.text
if (!coreCode) throw new Error('esbuild produced no generation core output')
const coreFile = join(root, 'lib', 'generation-core.js')
mkdirSync(dirname(coreFile), { recursive: true })
writeFileSync(coreFile, coreCode)
console.log(`wrote ${coreFile} (${Buffer.byteLength(coreCode, 'utf8')} bytes)`)

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.js'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  write: false,
  logLevel: 'info',
  metafile: true,
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
if (result.metafile) {
  writeFileSync(metaFile, JSON.stringify(result.metafile))
}
const wrappedBytes = Buffer.byteLength(wrapped, 'utf8')
console.log(`wrote ${outFile} (${wrappedBytes} bytes)`)
