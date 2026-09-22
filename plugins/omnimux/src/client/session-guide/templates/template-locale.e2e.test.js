import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { renderToStaticMarkup } = require('react-dom/server')
const React = require('react')

const output = await build({
  entryPoints: [new URL('./TemplateCardItem.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom'],
})
const compiled = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  require,
  compiled,
  compiled.exports,
)
const { TemplateCardItem } = compiled.exports

const comic = {
  id: 'comic',
  title: '美式漫画广告',
  titleEn: 'American Comic Style Ad',
  prompt: 'Bring your product to life in a 2D American comic style.',
  promptZh: '用「美式漫画广告」做一条竖屏短视频。',
  thumbnailUrl: 'https://example.com/comic.webp',
}

test('端到端：同一张营销模板在中文和英文页面上显示对应文案', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'template-locale-'))
  const server = spawn(process.execPath, ['-e', `
    const http = require('node:http')
    const fs = require('node:fs')
    const path = require('node:path')
    const root = ${JSON.stringify(dir)}
    const server = http.createServer((req, res) => {
      const file = path.join(root, req.url === '/' ? 'zh.html' : req.url)
      fs.readFile(file, (error, body) => {
        if (error) { res.writeHead(404); res.end('missing'); return }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(body)
      })
    })
    server.listen(0, '127.0.0.1', () => {
      process.stdout.write(String(server.address().port) + '\\n')
    })
  `], { stdio: ['ignore', 'pipe', 'inherit'] })
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server silent')), 5000)
      server.stdout.once('data', (chunk) => {
        clearTimeout(timer)
        resolve(String(chunk).trim())
      })
    })
    for (const locale of ['zh', 'en']) {
      const html = `<!doctype html><html lang="${locale}"><body>${renderToStaticMarkup(
        React.createElement(TemplateCardItem, { template: comic, locale }),
      )}</body></html>`
      writeFileSync(path.join(dir, `${locale}.html`), html)
      const response = await fetch(`http://127.0.0.1:${port}/${locale}.html`)
      assert.equal(response.status, 200)
      const text = await response.text()
      if (locale === 'zh') {
        assert.match(text, /美式漫画广告/)
        assert.match(text, /用「美式漫画广告」做一条竖屏短视频/)
        assert.doesNotMatch(text, /American Comic Style Ad/)
      } else {
        assert.match(text, /American Comic Style Ad/)
        assert.match(text, /Bring your product to life/)
        assert.match(text, />Recreate</)
      }
    }
  } finally {
    server.kill()
    await rm(dir, { recursive: true, force: true })
  }
})
