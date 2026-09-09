import { mkdir, writeFile, cp, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const contract = resolve(root, '../../packages/form-contract')
const result = await build({
  absWorkingDir: root, entryPoints: ['src/client/index.jsx'], bundle: true,
  format: 'cjs', platform: 'browser', jsx: 'automatic', write: false,
  alias: { '@omnimux/form-contract': `${contract}/src/index.ts` },
  define: { 'process.env.NODE_ENV': '"production"' },
  external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-locale'],
})
await mkdir(resolve(root, 'lib'), { recursive: true })
await writeFile(resolve(root, 'lib/client.js'), `window.__ModuleLoader__.load({id:"omnimux-forms",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});`)
// Only the installed copy is served. Definitions and validation are bundled above.
try { await access(`${contract}/examples`); await cp(`${contract}/examples`, `${root}/assets/examples`, { recursive: true }) }
catch (error) { if (error.code !== 'ENOENT') throw error }
