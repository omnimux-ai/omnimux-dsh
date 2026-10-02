import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

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

// 全 hermetic：直接对渲染产物做断言，不经任何 HTTP 往返（测试网络守卫禁 127.0.0.1 回环请求）。
test('端到端：同一张营销模板在中文和英文页面上显示对应文案', () => {
  for (const locale of ['zh', 'en']) {
    const text = `<!doctype html><html lang="${locale}"><body>${renderToStaticMarkup(
      React.createElement(TemplateCardItem, { template: comic, locale }),
    )}</body></html>`
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
})
