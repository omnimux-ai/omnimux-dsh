import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TEMPLATE_CATEGORIES, SHELVES_CONFIG } from './templates-data.js'

// 使用 esbuild 即时编译 ExploreTemplatesSection.jsx
const output = await build({
  entryPoints: [new URL('./ExploreTemplatesSection.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom'],
})

const compiledModule = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  compiledModule,
  compiledModule.exports
)
const { ExploreTemplatesSection } = compiledModule.exports

test('探索模板核心板块：初始静态标记渲染', () => {
  let appliedPayload = null
  const html = renderToStaticMarkup(
    React.createElement(ExploreTemplatesSection, {
      onApplyTemplate: (payload) => {
        appliedPayload = payload
      },
    })
  )

  // 1. 验证 7 大分类胶囊均已渲染
  assert.ok(html.includes('omnimux-explore-pills-row'), '必须渲染分类胶囊栏')
  for (const cat of TEMPLATE_CATEGORIES) {
    assert.ok(html.includes(cat.nameZh), `胶囊栏必须包含 [${cat.nameZh}]`)
  }
  assert.ok(html.includes('NEW'), '软件应用分类必须带有 NEW 徽标')

  // 2. 验证默认全部状态下渲染多行货架
  assert.ok(html.includes('omnimux-explore-shelves-view'), '默认必须渲染多行货架容器')
  for (const shelf of SHELVES_CONFIG) {
    assert.ok(html.includes(shelf.titleZh), `必须包含货架行 [${shelf.titleZh}]`)
  }

  // 3. 验证卡片与按钮
  assert.ok(html.includes('查看全部 (View all)'), '每个货架行必须包含查看全部按钮')
  assert.ok(html.includes('一键复刻'), '卡片上必须包含一键复刻按钮')
})
