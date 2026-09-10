import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const outDir = join(root, 'lib')
const outFile = join(outDir, 'client.js')

let esbuild
try {
  esbuild = await import('esbuild')
} catch {
  const rootRepo = resolve(here, '../../../node_modules/esbuild')
  esbuild = await import(rootRepo)
}

mkdirSync(outDir, { recursive: true })

const result = await esbuild.build({
  entryPoints: [join(root, 'src/client/index.js')],
  bundle: true,
  format: 'cjs',
  target: 'es2022',
  external: ['react', 'react-dom', '@deepseek-ai/*'],
  write: false,
})

const code = result.outputFiles[0].text

const wrapped = `window.__ModuleLoader__.load({
  id: "omnimux-video-preview",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  }
});
`

writeFileSync(outFile, wrapped, 'utf8')
console.log(`wrote ${outFile} (${Buffer.byteLength(wrapped)} bytes)`)
