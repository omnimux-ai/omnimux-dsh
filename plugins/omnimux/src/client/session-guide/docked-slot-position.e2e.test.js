import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(join(here, 'styles.js'), 'utf8')

function mount() {
  const start = styles.indexOf('[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-card]')
  const end = styles.indexOf('/* 工作区行留在 Hero')
  assert.ok(start > 0 && end > start)
  const rules = styles.slice(start, end)
  return new JSDOM(`<!doctype html><head><style>${rules}</style></head><body>
    <div data-omnimux-starter-host data-omnimux-dock-open>
      <div data-composer-card>
        <div class="omx-attachment-dock"><div class="thumb"></div></div>
      </div>
    </div>
  </body>`)
}

test('e2e: 吸底时缩略图留在输入框卡片里面，不再被单独固定到框外', () => {
  const dom = mount()
  const card = dom.window.document.querySelector('[data-composer-card]')
  const dock = card.querySelector('.omx-attachment-dock')
  const view = dom.window.getComputedStyle(dock)
  assert.equal(view.position, 'static')
  assert.equal(card.contains(dock), true)
  dom.window.close()
})
