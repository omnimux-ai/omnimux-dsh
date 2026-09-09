import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const result = await build({
  entryPoints: [fileURLToPath(new URL('src/client/index.js', root))],
  bundle: true, format: 'cjs', target: 'es2022',
  loader: { '.css': 'text', '.js': 'jsx', '.jsx': 'jsx' },
  external: ['react', 'react-dom', 'react-dom/*', '@deepseek-ai/*'], write: false,
})
const code = `window.__ModuleLoader__.load({id: 'omnimux-studio', factory: (require) => {\nvar module = {exports: {}}; var exports = module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;\n}});\n`
await mkdir(new URL('lib/', root), { recursive: true })
await writeFile(new URL('lib/client.js', root), code)
console.log(`Built omnimux-studio client (${Buffer.byteLength(code)} bytes)`)
