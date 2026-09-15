import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { PRODUCT_STAGE_CHROME } from '../../src/client/conversation-box.js'

const here = dirname(fileURLToPath(import.meta.url))
const CLIENT_DIR = join(here, '..', '..', 'src', 'client')

/**
 * 从模块源码里取出模板字符串常量。右侧栏样式表没有导出，端到端断言需要真实文本。
 * @param {string} file
 * @param {string} marker
 * @returns {string}
 */
function grabTemplate(file, marker) {
  const source = readFileSync(join(CLIENT_DIR, file), 'utf8')
  const at = source.indexOf(marker)
  assert.ok(at >= 0, `${marker} not found in ${file}`)
  const start = source.indexOf('`', at) + 1
  const end = source.indexOf('`', start)
  return source.slice(start, end)
}

const RIGHTBAR_CHROME = grabTemplate('sidebar-toggle-topbar.js', 'RIGHTBAR_CHROME_STYLES =')

/**
 * 把样式表拆成 `{ selector, body }` 列表。
 * 不依赖 JSDOM 的层叠实现：它既会把 `@media` 包成嵌套规则，也会在遇到它不认识的
 * 语法时整条丢弃，而这里要断言的正是「哪条规则会作用到目标元素上」。
 * @param {string} css
 * @returns {Array<{ selector: string, body: string }>}
 */
function parseRules(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  let depth = 0
  let start = 0
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]
    if (ch === '{') {
      if (depth === 0) {
        const selector = stripped.slice(start, i).trim()
        const end = stripped.indexOf('}', i)
        assert.ok(end > i, `unbalanced braces after selector: ${selector.slice(0, 60)}`)
        rules.push({ selector, body: stripped.slice(i + 1, end) })
      }
      depth++
    } else if (ch === '}') {
      depth--
      start = i + 1
    }
  }
  return rules
}

/**
 * 找出会作用到 `selector` 元素、且声明了 `property` 的规则。
 * 复合选择器按逗号拆开逐条匹配；不匹配的选择器（例如 `html[...]` 前缀在本夹具里
 * 不成立）会被如实排除。
 * @param {string} css
 * @param {string} html
 * @param {string} selector
 * @param {string} property
 * @returns {Array<{ selector: string, value: string, priority: string }>}
 */
function matchingDeclarations(css, html, selector, property) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    url: 'http://127.0.0.1:45120/',
  })
  const element = dom.window.document.querySelector(selector)
  assert.ok(element, `fixture is missing ${selector}`)
  const hits = []
  for (const rule of parseRules(css)) {
    const declaration = rule.body
      .split(';')
      .map((line) => line.trim())
      .find((line) => line.split(':')[0]?.trim() === property)
    if (!declaration) continue
    const raw = declaration.slice(declaration.indexOf(':') + 1).trim()
    const priority = /!important$/.test(raw) ? 'important' : ''
    const value = raw.replace(/!important$/, '').trim()
    for (const part of rule.selector.split(',')) {
      const candidate = part.trim()
      let matches = false
      try {
        matches = element.matches(candidate)
      } catch {
        matches = false
      }
      if (matches) hits.push({ selector: candidate, value, priority })
    }
  }
  return hits
}

const SPLIT_HTML = `
  <div class="dshDesktopFrame" data-dragging="true">
    <aside class="dshDesktopSidebarSurface"></aside>
    <main class="dshDesktopConversationSurface"></main>
    <aside class="dshDesktopRightbarSurface" data-rightbar-col>
      <div class="Ng7Ira_panel" data-sidebar-right-panel="push" data-sidebar-right-open="true"></div>
    </aside>
  </div>`

const FULLSCREEN_HTML = `
  <div class="dshDesktopFrame">
    <aside class="dshDesktopSidebarSurface"></aside>
    <main class="dshDesktopConversationSurface"></main>
    <aside class="dshDesktopRightbarSurface" data-rightbar-col>
      <div class="Ng7Ira_panel" data-sidebar-right-panel="fullscreen" data-sidebar-right-open="true"></div>
    </aside>
  </div>`

const SPLIT_PANEL = '.dshDesktopRightbarSurface [data-sidebar-right-panel="push"][data-sidebar-right-open]'
const FULLSCREEN_PANEL = '.dshDesktopRightbarSurface [data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]'
const CONVERSATION_SURFACE = '.dshDesktopFrame .dshDesktopConversationSurface'

test('e2e: 分栏态右侧面板留在外壳原生三列网格，不被插件改成视口右锚的 fixed 元素', () => {
  const position = matchingDeclarations(RIGHTBAR_CHROME, SPLIT_HTML, SPLIT_PANEL, 'position')
  assert.deepEqual(
    position.filter((hit) => hit.value === 'fixed'),
    [],
    '分栏态面板一旦被置为 fixed 就会脱离网格，拖拽分割线时不再跟随列宽（CDP 实测最大 71px 黑缝）',
  )

  const transition = matchingDeclarations(RIGHTBAR_CHROME, SPLIT_HTML, SPLIT_PANEL, 'transition')
  assert.deepEqual(
    transition,
    [],
    '分栏态面板不得声明私有过渡：外壳 data-dragging 只中和帧与手柄，面板过渡会在拖拽中以缓动追赶指针',
  )

  // 全屏态才允许视口右锚，且它必须真的命中全屏面板 —— 否则上面的空断言可能只是没解析到规则
  const fullscreenPosition = matchingDeclarations(RIGHTBAR_CHROME, FULLSCREEN_HTML, FULLSCREEN_PANEL, 'position')
  assert.ok(
    fullscreenPosition.some((hit) => hit.value === 'fixed' && hit.priority === 'important'),
    '全屏态仍需 fixed 右锚；这条同时证明样式表被完整解析，分栏态的空结果不是解析失败',
  )
})

test('e2e: 全屏态右侧面板保留视口右锚与宽度过渡', () => {
  const right = matchingDeclarations(RIGHTBAR_CHROME, FULLSCREEN_HTML, FULLSCREEN_PANEL, 'right')
  assert.ok(
    right.some((hit) => hit.value === '0' && hit.priority === 'important'),
    '全屏态必须锚在视口右缘，避免切换定位方式后从视口左缘回弹',
  )
  const transition = matchingDeclarations(RIGHTBAR_CHROME, FULLSCREEN_HTML, FULLSCREEN_PANEL, 'transition')
  assert.ok(
    transition.some((hit) => hit.value.includes('width') && hit.priority === 'important'),
    '全屏态保留宽度过渡，让展开/收起平滑',
  )
})

test('e2e: 会话列不溢出自己的网格轨道，地板交给外壳 computeDesktopColumns', () => {
  const minWidth = matchingDeclarations(PRODUCT_STAGE_CHROME, SPLIT_HTML, CONVERSATION_SURFACE, 'min-width')
  assert.ok(minWidth.length > 0, '会话列必须显式收敛最小宽度，避免内容撑破轨道')
  assert.ok(
    minWidth.every((hit) => hit.value === '0' && hit.priority === 'important'),
    'min-width 必须是 0：写死 420px 比外壳 CENTER_MIN 400px 高 20px，元素会压在右侧面板底下露出近黑底色',
  )
  assert.doesNotMatch(PRODUCT_STAGE_CHROME, /min-width:\s*420px\s*!important/)
})
