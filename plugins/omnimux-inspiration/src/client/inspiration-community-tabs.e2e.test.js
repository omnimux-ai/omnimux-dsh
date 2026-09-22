import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { zh } from './locales.js'

const section = readFileSync(new URL('./InspirationSection.jsx', import.meta.url), 'utf8')
const feed = readFileSync(new URL('./use-inspiration-feed.js', import.meta.url), 'utf8')

test('灵感社区打开时默认停在爆款趋势，栏目只有三项', () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  const bar = dom.window.document.createElement('div')
  const items = [
    { id: 'public', label: zh['tab.public'] },
    { id: 'local', label: zh['tab.local'] },
    { id: 'rivals', label: zh['tab.rivals'] },
  ]
  for (const item of items) {
    const button = dom.window.document.createElement('button')
    button.dataset.tab = item.id
    button.textContent = item.label
    button.setAttribute('aria-pressed', item.id === 'public' ? 'true' : 'false')
    bar.append(button)
  }
  dom.window.document.body.append(bar)

  const labels = [...bar.querySelectorAll('[data-tab]')].map((node) => node.textContent)
  assert.deepEqual(labels, ['爆款趋势', '灵感库', '账号监控'])
  assert.equal(bar.querySelector('[data-tab="public"]').getAttribute('aria-pressed'), 'true')
  assert.equal(bar.querySelector('[data-tab="all"]'), null)
  assert.match(section, /id: 'public'[\s\S]*id: 'local'[\s\S]*id: 'rivals'/)
  assert.doesNotMatch(section, /id: 'all'/)
  assert.match(feed, /useState\('public'\)/)
})
