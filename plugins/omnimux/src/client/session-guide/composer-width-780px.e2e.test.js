import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(join(here, 'styles.js'), 'utf8')

test('e2e: 新会话欢迎页顶部输入框与工作区行严格恢复 780px 舒适打字黄金宽度 (防拉平空旷死区)', () => {
  // 提取 [data-omnimux-starter-host] [data-composer-card] 样式段落
  const start = styles.indexOf('[data-omnimux-starter-host] [data-composer-card] {')
  const end = styles.indexOf('/* 素材导轨贴合输入框内壁', start)
  assert.ok(start > 0 && end > start, '必须存在 [data-omnimux-starter-host] [data-composer-card] 样式声明')
  const cardRule = styles.slice(start, end)

  // 1. 红线检查：严禁写死 952px 原生拉宽
  assert.equal(cardRule.includes('952px'), false, '红线：新会话欢迎页输入框严禁拉宽至 952px')

  // 2. 白名单检查：必须对齐 780px 黄金打字宽度
  assert.ok(
    cardRule.includes('max-width:min(780px, calc(100% - 24px))!important;') ||
    cardRule.includes('max-width: min(780px, calc(100% - 24px))!important;'),
    '输入框卡片必须声明 max-width: min(780px, calc(100% - 24px))'
  )

  // 3. 提取工作区选择行样式
  const wsStart = styles.indexOf('[data-omnimux-starter-host] [class*="heroWorkspaceRow"] {')
  const wsEnd = styles.indexOf('}', wsStart)
  assert.ok(wsStart > 0 && wsEnd > wsStart, '必须存在 heroWorkspaceRow 样式声明')
  const wsRule = styles.slice(wsStart, wsEnd + 1)
  assert.ok(
    wsRule.includes('max-width:min(780px, calc(100% - 24px))!important;') ||
    wsRule.includes('max-width: min(780px, calc(100% - 24px))!important;'),
    '工作区选择行必须与输入框严格对齐 780px 上限'
  )

  // 4. JSDOM 运行时计算样式验证
  const dom = new JSDOM(`<!doctype html><head><style>${cardRule}\n${wsRule}</style></head><body>
    <div data-omnimux-starter-host>
      <div class="heroWorkspaceRow"></div>
      <div data-composer-card></div>
    </div>
  </body>`)

  const card = dom.window.document.querySelector('[data-composer-card]')
  const wsRow = dom.window.document.querySelector('.heroWorkspaceRow')

  assert.equal(dom.window.getComputedStyle(card).maxWidth, 'min(780px, 100% - 24px)')
  assert.equal(dom.window.getComputedStyle(wsRow).maxWidth, 'min(780px, 100% - 24px)')
  assert.equal(dom.window.getComputedStyle(card).marginInline, 'auto')
  assert.equal(dom.window.getComputedStyle(wsRow).marginInline, 'auto')

  dom.window.close()
})
