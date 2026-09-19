/**
 * @file 客户端打包 —— esbuild 自包含 bundle。
 * 依赖解析向上逐级查找（主仓与工作树均可），不落开发机绝对路径。
 */

import { existsSync } from 'node:fs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = join(root, 'lib', 'client.js')

/** 向上查找某个相对路径真实存在的祖先位置（工作树向上两级即主仓）。 */
function findUp(rel) {
  let dir = root
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, rel)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

let esbuild
try {
  esbuild = await import('esbuild')
} catch {
  const fallback = findUp(join('node_modules', 'esbuild', 'lib', 'main.js'))
  if (!fallback) throw new Error('esbuild not found; run pnpm install at repo root')
  esbuild = await import(fallback)
}

const uiKit = findUp(join('personal', 'dsh-ui-kit', 'lib', 'index.js'))
  ?? findUp(join('node_modules', 'dsh-ui-kit', 'lib', 'index.js'))
if (!uiKit) throw new Error('dsh-ui-kit not found; expected at <repo>/../personal/dsh-ui-kit')

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.js'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  write: false,
  logLevel: 'info',
  alias: { 'dsh-ui-kit': uiKit },
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
  id: "omnimux-social-harvest",
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
