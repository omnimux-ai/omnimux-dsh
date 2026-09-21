import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import http from 'node:http'

export async function startFixture() {
  const root = resolve(import.meta.dirname, '../..')
  const require = createRequire(resolve(root, 'plugins/omnimux/package.json'))
  const kit = process.env.UI_AUDIT_KIT
  const pluginRequire = createRequire(resolve(root, 'plugins/omnimux-inspiration/package.json'))
  const kitEntry = kit ? resolve(kit, 'lib/index.js') : pluginRequire.resolve('dsh-ui-kit')
  const kitRequire = createRequire(kitEntry)
  const { build } = require('esbuild')
  const output = await build({
    absWorkingDir: root,
    entryPoints: [resolve(import.meta.dirname, 'inspiration-shot-copy.fixture.jsx')],
    bundle: true,
    write: false,
    outdir: resolve(root, 'tmp/shot-copy-e2e-build'),
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    alias: {
      'dsh-ui-kit': kitEntry,
      react: require.resolve('react'),
      'react-dom': require.resolve('react-dom'),
      'react-dom/client': require.resolve('react-dom/client'),
      'react/jsx-runtime': require.resolve('react/jsx-runtime'),
      '@deepseek-ai/dsh-client-ui-primitives': kitRequire.resolve('@deepseek-ai/dsh-client-ui-primitives'),
    },
    loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
    logLevel: 'silent',
  })
  const js = output.outputFiles.find((file) => file.path.endsWith('.js')).text
  const css = output.outputFiles.find((file) => file.path.endsWith('.css'))?.text || ''
  const hash = (value) => createHash('sha256').update(value).digest('hex')
  const identity = {
    root,
    pid: process.pid,
    bundle: hash(js),
    files: Object.fromEntries(['InspirationPreviewModal.jsx', 'styles.js', 'locales.js'].map((path) => [
      path,
      hash(readFileSync(resolve(root, 'plugins/omnimux-inspiration/src/client', path))),
    ])),
  }
  const html = `<!doctype html><html lang="zh-CN">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{color-scheme:dark;--dsw-alias-bg-base:#111;--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#aaa;}
body{margin:0;background:#111;color:#eee;font-family:sans-serif}${css}</style>
<div id="root"></div><script src="/bundle.js"></script></html>`
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/bundle.js' ? 'text/javascript' : 'text/html')
    response.end(request.url === '/bundle.js' ? js : html)
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${server.address().port}/`
  return {
    url,
    identity,
    close: async () => {
      server.closeAllConnections()
      await new Promise((done) => server.close(done))
    },
  }
}
