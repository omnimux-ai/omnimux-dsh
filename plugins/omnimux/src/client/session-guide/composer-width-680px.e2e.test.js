import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(join(here, 'styles.js'), 'utf8')

test('e2e: 新会话欢迎页顶部输入框、工作区行与吸底态严格收敛为 680px 紧凑黄金宽度', () => {
  // 1. 顶部输入框卡片
  const start = styles.indexOf('[data-omnimux-starter-host] [data-composer-card] {')
  const end = styles.indexOf('/* 素材导轨贴合输入框内壁', start)
  assert.ok(start > 0 && end > start, '必须存在 [data-omnimux-starter-host] [data-composer-card] 样式声明')
  const cardRule = styles.slice(start, end)

  // 严禁出现 952px 或 780px
  assert.equal(cardRule.includes('952px'), false, '红线：新会话欢迎页输入框严禁为 952px')
  assert.equal(cardRule.includes('780px'), false, '红线：新会话欢迎页输入框严禁为 780px')

  // 必须声明 680px 紧凑上限
  assert.ok(
    cardRule.includes('max-width:min(680px, calc(100% - 24px))!important;') ||
    cardRule.includes('max-width: min(680px, calc(100% - 24px))!important;'),
    '输入框卡片必须声明 max-width: min(680px, calc(100% - 24px))'
  )

  // 2. 工作区选择行
  const wsStart = styles.indexOf('[data-omnimux-starter-host] [class*="heroWorkspaceRow"] {')
  const wsEnd = styles.indexOf('}', wsStart)
  assert.ok(wsStart > 0 && wsEnd > wsStart, '必须存在 heroWorkspaceRow 样式声明')
  const wsRule = styles.slice(wsStart, wsEnd + 1)
  assert.ok(
    wsRule.includes('max-width:min(680px, calc(100% - 24px))!important;') ||
    wsRule.includes('max-width: min(680px, calc(100% - 24px))!important;'),
    '工作区选择行必须与输入框严格对齐 680px 上限'
  )

  // 3. 吸底状态卡片
  const dockStart = styles.indexOf('[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-card] {')
  const dockEnd = styles.indexOf('/* 工作区行留在 Hero', dockStart)
  assert.ok(dockStart > 0 && dockEnd > dockStart, '必须存在吸底卡片样式声明')
  const dockRule = styles.slice(dockStart, dockEnd)
  assert.ok(
    dockRule.includes('max-width:min(680px, calc(100% - 24px))!important;') ||
    dockRule.includes('max-width: min(680px, calc(100% - 24px))!important;'),
    '吸底状态输入框卡片必须声明 max-width: min(680px, calc(100% - 24px)) 保持完全同宽'
  )

  // 4. JSDOM 运行时计算样式验证
  const dom = new JSDOM(`<!doctype html><head><style>${cardRule}\n${wsRule}\n${dockRule}</style></head><body>
    <div data-omnimux-starter-host>
      <div class="heroWorkspaceRow"></div>
      <div data-composer-card></div>
    </div>
    <div data-omnimux-starter-host data-omnimux-dock-open>
      <div data-composer-card class="docked-card"></div>
    </div>
  </body>`)

  const card = dom.window.document.querySelector('[data-composer-card]')
  const wsRow = dom.window.document.querySelector('.heroWorkspaceRow')
  const dockedCard = dom.window.document.querySelector('.docked-card')

  assert.equal(dom.window.getComputedStyle(card).maxWidth, 'min(680px, 100% - 24px)')
  assert.equal(dom.window.getComputedStyle(wsRow).maxWidth, 'min(680px, 100% - 24px)')
  assert.equal(dom.window.getComputedStyle(dockedCard).maxWidth, 'min(680px, 100% - 24px)')

  dom.window.close()
})
