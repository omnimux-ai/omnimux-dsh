import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(join(here, 'styles.js'), 'utf8')

function dockRules() {
  const start = styles.indexOf('[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-card]')
  const end = styles.indexOf('/* 工作区行留在 Hero')
  assert.ok(start > 0 && end > start)
  return styles.slice(start, end)
}

function mount(withThumb) {
  const dom = new JSDOM(`<!doctype html><head><style>${dockRules()}
    .omnimux-trending-undock { position:fixed; height:26px; bottom:calc(var(--omnimux-dock-bottom, 20px) + var(--omnimux-dock-card-height, 168px) + 8px); }
  </style></head><body>
    <div data-omnimux-starter-host data-omnimux-dock-open>
      ${withThumb ? '<div class="omx-attachment-dock"><div class="thumb"></div></div>' : ''}
      <button class="omnimux-trending-undock" type="button">收起输入框</button>
      <div data-composer-card></div>
    </div>
  </body>`)
  return dom
}

test('e2e: 吸底且有素材时，卡槽固定到输入框上方，收起按钮再上移', () => {
  const dom = mount(true)
  const view = dom.window.getComputedStyle(dom.window.document.querySelector('.omx-attachment-dock'))
  const undock = dom.window.getComputedStyle(dom.window.document.querySelector('.omnimux-trending-undock'))
  assert.equal(view.position, 'fixed')
  assert.equal(view.bottom, 'calc(var(--omnimux-dock-bottom, 20px) + var(--omnimux-dock-card-height, 168px) + 8px)')
  assert.equal(view.left, 'var(--omnimux-dock-left, 0px)')
  assert.equal(view.width, 'var(--omnimux-dock-width, 100%)')
  assert.equal(undock.bottom, 'calc(var(--omnimux-dock-bottom, 20px) + var(--omnimux-dock-card-height, 168px) + 76px)')
  dom.window.close()
})

test('e2e: 没有素材时不渲染卡槽，收起按钮留在输入框上方', () => {
  const dom = mount(false)
  assert.equal(dom.window.document.querySelector('.omx-attachment-dock'), null)
  const undock = dom.window.getComputedStyle(dom.window.document.querySelector('.omnimux-trending-undock'))
  assert.equal(undock.bottom, 'calc(var(--omnimux-dock-bottom, 20px) + var(--omnimux-dock-card-height, 168px) + 8px)')
  dom.window.close()
})
