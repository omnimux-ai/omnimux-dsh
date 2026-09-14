import assert from 'node:assert/strict'
import { after, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'

const here = fileURLToPath(new URL('.', import.meta.url))
const cache = join(here, '.esbuild-cache', 'doc-render')
mkdirSync(cache, { recursive: true })
after(() => rmSync(cache, { recursive: true, force: true }))
const result = await build({
  entryPoints: [join(here, 'InspirationPreviewModal.jsx')],
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', write: false,
  external: ['react', 'react/jsx-runtime'],
  alias: { 'dsh-ui-kit': join(here, 'test-fixtures/ui-kit-shim.mjs') },
})
const bundle = join(cache, 'preview.mjs')
writeFileSync(bundle, result.outputFiles[0].text)
const { InspirationPreviewModal } = await import(bundle)

it('renders table records as visible vertical fields without table delimiters or folds', () => {
  const raw = '| 时间 | 画面 |\n| --- | --- |\n| 0–3 秒 | 左\\|右 `a|b` |\n| 3–6 秒 | 特写。 |'
  const markup = renderToStaticMarkup(React.createElement(InspirationPreviewModal, {
    row: { id: 'doc', analysis: { sections: [{ title: '分镜', analysis: raw }] } },
    t: (key) => key,
    onClose() {},
  }))
  const dom = new JSDOM(markup)
  try {
    const records = dom.window.document.querySelectorAll('.omnimux-inspiration-doc-record')
    assert.equal(records.length, 2)
    assert.deepEqual([...records[0].querySelectorAll('.omnimux-inspiration-doc-label')].map((node) => node.textContent), ['时间:', '画面:'])
    assert.deepEqual([...records[0].querySelectorAll('.omnimux-inspiration-doc-desc')].map((node) => node.textContent), ['0–3 秒', '左|右 `a|b`'])
    const analysis = dom.window.document.querySelector('.omnimux-inspiration-doc-analysis')
    assert.doesNotMatch(analysis.textContent, /---/)
    assert.equal(analysis.querySelectorAll('table, details, [hidden]').length, 0)
  } finally {
    dom.window.close()
  }
})
