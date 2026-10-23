/**
 * E2E: 新会话探索区单一滚动归属（Issue 3628）
 *
 * 覆盖关键用户旅程：卡片超过一屏的探索网格视图下，用户只应看到一个纵向滚动条
 * （官方会话滚动底座 [data-conversation-scroll]），网格容器不得自开滚动条吃掉滚轮。
 *
 * 素材取自真实实现：真实样式表（plugins/omnimux/src/client/session-guide/styles.js）的真实规则
 * + 真实组件源码里的三个网格视图分支容器；断言落在 jsdom 计算样式与源码契约上。
 *
 * 边界说明：本文件是**样式/结构契约级**回归门（jsdom 无真实布局，证明不了真实滚轮与滚动条像素）；
 * 真实浏览器验收证据在同任务的 sealed 运行 `.workbuddy/evidence/contract/3628/<runId>/`
 * （见 docs/evidence/new-session-single-scroll/report.md），两者互补、不可互相替代。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(join(here, '../../../omnimux/src/client/session-guide/styles.js'), 'utf8')
const exploreSource = readFileSync(join(here, './templates/ExploreTemplatesSection.jsx'), 'utf8')

function ruleOf(selector) {
  const start = styles.indexOf(selector + ' {')
  assert.ok(start > 0, `必须存在样式声明：${selector}`)
  const end = styles.indexOf('}', start)
  assert.ok(end > start, `样式声明必须闭合：${selector}`)
  return styles.slice(start, end + 1)
}

test('e2e: 新会话探索区单一滚动归属 —— 网格容器不再自开滚动条，滚动归官方会话底座', () => {
  const baseRule = ruleOf('.omnimux-explore-grid-view-wrap')
  const flowRule = ruleOf('.omnimux-explore-grid-view-wrap.omnimux-explore-grid-view-flow')

  // 当前契约：修饰类必须显式解除历史视口上限与内部滚动。
  assert.match(flowRule, /max-height:\s*none/, 'flow 修饰类必须声明 max-height: none')
  assert.match(flowRule, /overflow-y:\s*visible/, 'flow 修饰类必须声明 overflow-y: visible')

  // 真实宿主结构：官方会话滚动底座 → 探索区 → 网格容器（组件按 JSX 渲染历史类 + 修饰类）。
  const dom = new JSDOM(`<!doctype html><head><style>${baseRule}\n${flowRule}</style></head><body>
    <div class="scrollBody" data-conversation-scroll="">
      <div data-omnimux-starter-host="">
        <div class="omnimux-explore-grid-view-wrap omnimux-explore-grid-view-flow" id="explore-grid"></div>
      </div>
    </div>
  </body>`)

  const grid = dom.window.document.getElementById('explore-grid')
  const computed = dom.window.getComputedStyle(grid)

  // 计算样式断言：网格容器不是滚动容器，也不再设视口上限。
  assert.equal(computed.overflowY, 'visible', '网格容器计算 overflow-y 必须为 visible，不得成为滚动容器')
  assert.equal(computed.maxHeight, 'none', '网格容器计算 max-height 必须为 none，不得设视口上限')

  // 组件契约：三个网格视图分支（精选子分类 / Skills / 外部库）都必须带修饰类。
  const wrappers = exploreSource.match(/className="omnimux-explore-grid-view-wrap[^"]*"/g) || []
  assert.equal(wrappers.length, 3, '探索区必须存在三个网格视图分支容器')
  for (const wrapper of wrappers) {
    assert.match(wrapper, /omnimux-explore-grid-view-flow/, `每个网格容器都必须带 flow 修饰类：${wrapper}`)
  }

  dom.window.close()

  // 吸底态（[data-omnimux-dock-open]）是历史网格视口上限变体所在的状态：该变体特异性高于
  // 修饰类（0,3,0 > 0,2,0），一旦被重新引入就会让双滚动条在吸底态回归而其他断言仍为绿。
  assert.doesNotMatch(
    styles,
    /\[data-omnimux-dock-open\][^{]*\.omnimux-explore-grid-view-wrap\s*\{[^}]*max-height/i,
    '吸底态严禁重新引入网格容器视口上限（会让双滚动条在吸底态回归）',
  )

  const docked = new JSDOM(`<!doctype html><head><style>${baseRule}\n${flowRule}</style></head><body>
    <div data-omnimux-starter-host="" data-omnimux-dock-open="">
      <div class="omnimux-explore-grid-view-wrap omnimux-explore-grid-view-flow" id="docked-grid"></div>
    </div>
  </body>`)
  const dockedComputed = docked.window.getComputedStyle(docked.window.document.getElementById('docked-grid'))
  assert.equal(dockedComputed.overflowY, 'visible', '吸底态下网格容器仍不得成为滚动容器')
  assert.equal(dockedComputed.maxHeight, 'none', '吸底态下网格容器仍不得设视口上限')
  docked.window.close()
})
