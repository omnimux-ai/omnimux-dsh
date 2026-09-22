import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  resolveTemplateCopy,
  resolveTemplateLocale,
} from './template-locale.js'

const comic = {
  title: '美式漫画广告',
  titleEn: 'American Comic Style Ad',
  prompt: 'Bring your product to life in a 2D American comic style.',
  promptZh: '用「美式漫画广告」做一条竖屏短视频。',
}

test('语言读取：翻译函数优先，缺失时用页面语言，再不行用中文', () => {
  assert.equal(resolveTemplateLocale('zh', (key) => (key === 'locale' ? 'en' : key)), 'en')
  assert.equal(resolveTemplateLocale('zh', (key) => key), 'zh')
  assert.equal(resolveTemplateLocale(undefined, null), 'zh')
})

test('文案取值：中文取中文，英文取英文，缺一则回退', () => {
  assert.deepEqual(resolveTemplateCopy(comic, 'zh'), {
    title: '美式漫画广告',
    prompt: comic.promptZh,
  })
  assert.deepEqual(resolveTemplateCopy(comic, 'en-US'), {
    title: 'American Comic Style Ad',
    prompt: comic.prompt,
  })
  assert.equal(resolveTemplateCopy({ titleEn: 'Only English', prompt: 'English prompt' }, 'zh').title, 'Only English')
  assert.equal(resolveTemplateCopy({ title: '只有中文', promptZh: '中文提示' }, 'en').prompt, '中文提示')
})

const cardBuild = await build({
  entryPoints: [new URL('./TemplateCardItem.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom'],
})
const cardModule = { exports: {} }
new Function('require', 'module', 'exports', cardBuild.outputFiles[0].text)(
  createRequire(import.meta.url),
  cardModule,
  cardModule.exports,
)
const { TemplateCardItem } = cardModule.exports

test('卡片：中文显示中文名和中文提示词，英文显示英文', () => {
  const zh = renderToStaticMarkup(React.createElement(TemplateCardItem, {
    template: { ...comic, id: 'comic', thumbnailUrl: 'https://example.com/a.webp' },
    locale: 'zh',
  }))
  assert.match(zh, /美式漫画广告/)
  assert.match(zh, /用「美式漫画广告」做一条竖屏短视频/)
  assert.doesNotMatch(zh, /American Comic Style Ad/)

  const en = renderToStaticMarkup(React.createElement(TemplateCardItem, {
    template: { ...comic, id: 'comic', thumbnailUrl: 'https://example.com/a.webp' },
    locale: 'en',
  }))
  assert.match(en, /American Comic Style Ad/)
  assert.match(en, /Bring your product to life/)
  assert.match(en, />Recreate</)
})
