import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(join(here, 'styles.js'), 'utf8')

function mountInsideCard() {
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
  const dom = mountInsideCard()
  const card = dom.window.document.querySelector('[data-composer-card]')
  const dock = card.querySelector('.omx-attachment-dock')
  const view = dom.window.getComputedStyle(dock)
  assert.equal(view.position, 'static')
  assert.equal(card.contains(dock), true)
  dom.window.close()
})

test('e2e: 未吸底时，素材条贴合卡片内壁靠左对齐，消除居中外边距', () => {
  const start = styles.indexOf('[data-omnimux-starter-host] .omx-attachment-dock')
  const end = styles.indexOf('[data-omnimux-starter-host] [class*="heroWorkspaceRow"]')
  assert.ok(start > 0 && end > start)
  const dom = new JSDOM('<!doctype html><head><style>'+styles.slice(start, end)+'</style></head><body><div data-omnimux-starter-host><div class="omx-attachment-dock"></div></div></body>')
  const view = dom.window.getComputedStyle(dom.window.document.querySelector('.omx-attachment-dock'))
  assert.equal(view.maxWidth, '100%')
  assert.ok(view.margin === '0px' || view.margin === '0' || view.marginInline === '0px' || view.marginInline === '0')
  assert.notEqual(view.marginInline, 'auto')
  assert.notEqual(view.marginLeft, 'auto')
  assert.notEqual(view.marginRight, 'auto')
  dom.window.close()
})
