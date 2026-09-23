import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { QUICK_SHORTCUTS, QUICK_SHORTCUT_ARROW_ICON } from './catalog.js'
import { QUICK_SHORTCUTS_CSS, ensureQuickShortcutStyles, acquireQuickShortcutStyles } from './styles.js'
import { JSDOM } from 'jsdom'

it('shares stylesheet lifetime across independent composer seats', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
  try {
    const doc = dom.window.document
    const releaseFirst = acquireQuickShortcutStyles(doc)
    const releaseSecond = acquireQuickShortcutStyles(doc)
    ensureQuickShortcutStyles(doc)
    ensureQuickShortcutStyles(doc)
    assert.equal(doc.head.querySelector('style').getAttribute('data-users'), '2')
    assert.equal(doc.head.querySelectorAll('style').length, 1)
    releaseFirst()
    releaseFirst()
    assert.equal(doc.head.querySelectorAll('style').length, 1)
    assert.equal(doc.head.querySelector('style').textContent, QUICK_SHORTCUTS_CSS)
    releaseSecond()
    assert.equal(doc.head.querySelectorAll('style').length, 0)
  } finally {
    dom.window.close()
  }
})

/**
 * 本文件把 Issue #2572 的形态契约钉死在源码层：无边框、整行居中、箭头透明态、
 * 图标与条目一一对应，且五枚 lucide 图标**逐元素逐属性**不被改写。
 * 原型是**真实浏览器**里量到的几何与计算样式，见
 * `.agent-reports/quick-shortcuts-icon-style/`；源码断言只负责防止回退。
 *
 * `icons.jsx` 是 JSX，node:test 不能直接 import，因此一律按文本读并断言关键片段。
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const ICONS_PATH = resolve(HERE, 'icons.jsx')
const COMPONENT_PATH = resolve(HERE, 'ComposerQuickShortcuts.jsx')
/** 宿主主题 Token 契约快照（与本仓 `tests/e2e/clip-primary-btn-contrast.e2e.test.mjs` 同一真源）。 */
const HOST_TOKENS_PATH = resolve(HERE, '../../../../../tests/e2e/fixtures/dsh-theme-tokens.json')

/**
 * 五枚图标**逐元素逐属性**的期望值（标签 + 全部属性，顺序照给定源）。
 * 只抽样一条路径是抓不住事故的：改掉任意一段数值照样能变绿。
 */
const LUCIDE_ELEMENTS = {
  film: [
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }],
    ['path', { d: 'M7 3v18' }],
    ['path', { d: 'M3 7.5h4' }],
    ['path', { d: 'M3 12h18' }],
    ['path', { d: 'M3 16.5h4' }],
    ['path', { d: 'M17 3v18' }],
    ['path', { d: 'M17 7.5h4' }],
    ['path', { d: 'M17 16.5h4' }],
  ],
  'text-search': [
    ['path', { d: 'M21 5H3' }],
    ['path', { d: 'M10 12H3' }],
    ['path', { d: 'M10 19H3' }],
    ['circle', { cx: '17', cy: '15', r: '3' }],
    ['path', { d: 'm21 19-1.9-1.9' }],
  ],
  workflow: [
    ['rect', { width: '8', height: '8', x: '3', y: '3', rx: '2' }],
    ['path', { d: 'M7 11v4a2 2 0 0 0 2 2h4' }],
    ['rect', { width: '8', height: '8', x: '13', y: '13', rx: '2' }],
  ],
  sparkles: [
    ['path', {
      d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
    }],
    ['path', { d: 'M20 2v4' }],
    ['path', { d: 'M22 4h-4' }],
    ['circle', { cx: '4', cy: '20', r: '2' }],
  ],
  'move-up-right': [
    ['path', { d: 'M13 5H19V11' }],
    ['path', { d: 'M19 5L5 19' }],
  ],
}

/** 样式表里全部规则块（本表无嵌套与 @media，直接按花括号切分；先剥掉注释）。 */
function cssBlocks(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({ selector: match[1].trim(), body: match[2] }))
}

/**
 * 取某条规则的声明体：按「选择器列表里恰好含这一条」精确匹配，
 * 并取最后一条同名规则（后面的规则才是最终生效的那条，例如箭头自身那条）。
 * 找不到就抛，避免断言在空字符串上静默变绿。
 */
function ruleBody(css, selector) {
  const hits = cssBlocks(css).filter((block) => block.selector.split(',').map((one) => one.trim()).includes(selector))
  assert.ok(hits.length > 0, `样式表里必须存在规则 ${selector}`)
  return hits[hits.length - 1].body
}

/** 取 icons.jsx 里某枚图标的图形元素，规范化为「标签 + 全部属性」的字符串数组。 */
function glyphElements(source, name) {
  const at = source.indexOf(`\n  ${name}: (`) !== -1
    ? source.indexOf(`\n  ${name}: (`)
    : source.indexOf(`\n  '${name}': (`)
  assert.ok(at !== -1, `icons.jsx 的图标查表里必须仍有 ${name}`)
  const start = source.indexOf('(', at) + 1
  const end = source.indexOf('\n  ),', start)
  assert.ok(end > start, `${name} 的图形块必须闭合`)
  const block = source.slice(start, end)
  return [...block.matchAll(/<([a-z]+)((?:\s+[a-zA-Z-]+="[^"]*")*)\s*\/>/g)].map((match) => {
    const attrs = [...match[2].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map(([, key, value]) => `${key}=${value}`)
    return `${match[1]}|${attrs.join('|')}`
  })
}

/** 期望值同样规范化成「标签 + 全部属性」，便于与源码逐元素对拍。 */
function expectedElements(name) {
  return LUCIDE_ELEMENTS[name].map(([tag, attrs]) => `${tag}|${Object.entries(attrs).map(([key, value]) => `${key}=${value}`).join('|')}`)
}

describe('四条快捷方式：无边框「图标 + 文字 + 箭头」', () => {
  it('按钮没有边框、没有圆角底、没有底色', () => {
    const body = ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcut-btn')
    assert.match(body, /border:\s*0;/, '按钮不得有边框')
    assert.match(body, /border-radius:\s*0;/, '按钮不得有圆角底')
    assert.match(body, /background:\s*transparent;/, '按钮不得有底色')
    assert.doesNotMatch(body, /border(?:-width)?:\s*[1-9]/, '不得出现任何可见边框宽度')
    assert.doesNotMatch(body, /border-radius:\s*[^0\s]/, '不得出现非零圆角')
    assert.doesNotMatch(body, /box-shadow/, '去掉胶囊后不得改用投影伪装底色')
  })

  it('四条按钮整行居中，且每行都居中对齐', () => {
    const body = ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcuts')
    assert.match(body, /display:\s*flex;/, '行容器必须是 flex')
    assert.match(body, /justify-content:\s*center;/, '四条按钮必须整行左右居中，不是靠左')
    assert.match(body, /flex-wrap:\s*wrap;/, '窄列必须能换行，不能靠溢出撞上控件')
    assert.match(body, /margin:\s*0 auto;/, '整行仍要相对输入框水平居中')
  })

  it('整行落在输入框正下方（官方停靠槽默认排在输入框之前）', () => {
    const body = ruleBody(QUICK_SHORTCUTS_CSS, "[data-phase='hero'] .omx-quick-shortcuts")
    assert.match(body, /order:\s*3;/, '必须排到输入框那块（order: 2）之后，否则会跑到输入框上方')
  })

  it('内联模型参数保持单行，外部写失败提示独占一行（Issue #2592）', () => {
    const controls = ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcut-controls')
    assert.match(controls, /display:\s*inline-flex;/)
    assert.doesNotMatch(controls, /flex-basis:\s*100%;/, '内联控件不得另占一行')
    assert.doesNotMatch(controls, /position:\s*absolute/, '控件不得盖住其它入口')
    assert.match(controls, /min-width:\s*0;/)
    assert.match(controls, /flex-wrap:\s*nowrap;/, '内联底栏不得折行增高')

    const notice = ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcut-notice')
    assert.match(notice, /flex-basis:\s*100%;/, '提示出现时也不得把按钮挤偏')
  })

  it('内联控件窄列压缩文字而不折行，浮层不被工具区裁切（Issue #2592）', () => {
    const inner = ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcut-controls > .omx-media-config-controls')
    assert.match(inner, /flex-wrap:\s*nowrap;/)
    assert.match(inner, /min-width:\s*0;/)
    assert.match(ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcut-controls .omx-capsule-trigger'), /min-width:\s*28px;/, '保留可操作的最小按钮')
    assert.match(ruleBody(QUICK_SHORTCUTS_CSS, '[data-composer-card][data-omnimux-inline-density] [class*="tools"]'), /overflow:\s*visible;/)
    assert.match(ruleBody(QUICK_SHORTCUTS_CSS, '[data-composer-card][data-omnimux-inline-density] .omx-popover-shell'), /max-width:\s*100%;/)
    assert.match(ruleBody(QUICK_SHORTCUTS_CSS, "[data-composer-card][data-omnimux-inline-density='short'] .omx-model-name-display"), /max-width:\s*88px;/)
    assert.match(ruleBody(QUICK_SHORTCUTS_CSS, "[data-composer-card][data-omnimux-inline-density='icon'] #modelCascadeTriggerBtn"), /width:\s*28px;/)
    assert.match(ruleBody(QUICK_SHORTCUTS_CSS, "html [data-composer-card][data-omnimux-inline-density='short'] .sh-active-skill-chip .sh-chip-label"), /display:\s*inline-block!important;/, 'short 不能被全局 icon 密度提前隐藏技能文字')

    // 模型胶囊里唯一由数据驱动的两段文字：宁可省略号，也不把内容顶出卡片。
    for (const selector of [
      '.omx-quick-shortcut-controls .omx-model-name-display',
      '.omx-quick-shortcut-controls .omx-channel-name-display',
    ]) {
      const body = ruleBody(QUICK_SHORTCUTS_CSS, selector)
      assert.match(body, /text-overflow:\s*ellipsis;/, `${selector} 必须有省略号兜底`)
      assert.match(body, /overflow:\s*hidden;/)
      assert.match(body, /white-space:\s*nowrap;/)
      assert.match(body, /min-width:\s*0;/)
    }
  })

  it('箭头默认半透明、悬停与选中时变实；悬停另有文字提亮', () => {
    const arrow = ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcut-arrow')
    assert.match(arrow, /opacity:\s*0\.5;/, '箭头默认必须半透明')

    const hoverArrow = ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcut-btn:hover .omx-quick-shortcut-arrow')
    assert.match(hoverArrow, /opacity:\s*1;/, '悬停时箭头必须变实')

    const activeArrow = ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcut-btn.is-active .omx-quick-shortcut-arrow')
    assert.match(activeArrow, /opacity:\s*1;/, '选中时箭头也必须变实')

    const hover = ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcut-btn:hover')
    assert.match(hover, /color:\s*var\(--dsw-alias-label-primary/, '悬停必须提亮文字，不能是死文字')

    const active = ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcut-btn.is-active')
    assert.match(active, /color:\s*var\(--dsw-alias-label-primary\)/, '选中态去掉边框后仍须可辨（文字色）')
    assert.match(active, /font-weight:\s*600;/, '选中态必须另有字重差异，否则与悬停同色时分不出来')
    assert.doesNotMatch(active, /background/, '选中态不得用底色表达（本任务要求去掉底色）')
  })

  it('色彩一律取既有 token，且不含裸色值', () => {
    const bareColors = QUICK_SHORTCUTS_CSS.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g) || []
    assert.deepEqual(bareColors, [], `样式表出现裸色值：${bareColors.join(', ')}`)
    assert.match(QUICK_SHORTCUTS_CSS, /var\(--dsw-alias-label-secondary\)/, '文字色必须取既有 token')
  })

  it('样式表引用的宿主主题 Token 必须真实存在（防宿主升级后静默改名）', async () => {
    const fixture = JSON.parse(await readFile(HOST_TOKENS_PATH, 'utf8'))
    assert.ok(Array.isArray(fixture.tokens) && fixture.tokens.length > 100, '宿主 Token 快照必须可用')
    const available = new Set(fixture.tokens)
    const referenced = [...new Set([...QUICK_SHORTCUTS_CSS.matchAll(/var\((--dsw-alias-[a-z0-9-]+)/g)].map((m) => m[1]))]
    assert.ok(referenced.length >= 2, '样式表必须引用宿主语义 Token')
    for (const token of referenced) {
      assert.ok(available.has(token), `样式表引用了宿主不存在的 Token：${token}`)
    }
  })
})

describe('图标与条目一一对应', () => {
  it('四条条目的图标名各不相同，且都在图标查表里', async () => {
    const source = await readFile(ICONS_PATH, 'utf8')
    for (const entry of QUICK_SHORTCUTS) {
      assert.ok(glyphElements(source, entry.icon).length > 0, `${entry.id} 的图标 ${entry.icon} 必须在 icons.jsx 的查表里`)
    }
    assert.equal(new Set(QUICK_SHORTCUTS.map((entry) => entry.icon)).size, 4, '四条不得复用同一枚图标')
  })

  it('行尾箭头按真源常量取图，不在图标文件里重复字面量', async () => {
    const source = await readFile(ICONS_PATH, 'utf8')
    assert.ok(glyphElements(source, QUICK_SHORTCUT_ARROW_ICON).length > 0, '箭头图标必须在查表里')
    assert.match(source, /import \{ QUICK_SHORTCUT_ARROW_ICON \} from '\.\/catalog\.js'/, '箭头名必须来自 catalog.js 真源')
    assert.match(source, /ICON_PATHS\[QUICK_SHORTCUT_ARROW_ICON\]/, '箭头必须按真源常量取图')
    assert.doesNotMatch(source, /ICON_PATHS\['move-up-right'\]/, '不得再按字面量取图（那会形成第二个真源）')
  })

  it('图标 14px、箭头 12px，尺寸有单一真源', async () => {
    const source = await readFile(ICONS_PATH, 'utf8')
    assert.match(source, /const ICON_SIZE = 14\b/, '条目图标尺寸必须是 14px')
    assert.match(source, /const ARROW_SIZE = 12\b/, '行尾箭头尺寸必须是 12px')
    assert.equal((source.match(/width=\{(?:ICON|ARROW)_SIZE\}/g) || []).length, 2, '两个组件都必须用尺寸常量')
    assert.equal((source.match(/height=\{(?:ICON|ARROW)_SIZE\}/g) || []).length, 2, '两个组件都必须用尺寸常量')
    assert.equal((source.match(/viewBox="0 0 24 24"/g) || []).length, 2, '两个 svg 的 viewBox 必须都是 24')
  })

  it('五枚 lucide 图标逐元素逐属性落地，一个数值都不许改', async () => {
    const source = await readFile(ICONS_PATH, 'utf8')
    for (const [name, expected] of Object.entries(LUCIDE_ELEMENTS)) {
      assert.deepEqual(
        glyphElements(source, name),
        expectedElements(name),
        `${name} 的图形必须与给定 lucide 源逐元素逐属性一致`,
      )
    }
  })

  it('组件按条目取图标，且每项固定是「图标 + 文字 + 箭头」', async () => {
    const source = await readFile(COMPONENT_PATH, 'utf8')
    assert.match(source, /<QuickShortcutIcon name=\{entry\.icon\} \/>/, '图标必须由条目决定，不在渲染处硬编码')
    assert.doesNotMatch(source, /entry\.id === 'clone'/, '渲染处不得出现按 id 分支的图标硬编码')
    assert.match(source, /className="omx-quick-shortcut-label"/, '文案必须有独立节点')
    assert.match(source, /<QuickShortcutArrow \/>/, '每项末尾必须有箭头')
  })

  it('非全屏（分栏/分屏）模式下强制隐藏快捷方式那一排（display: none !important）', () => {
    for (const selector of [
      'html[data-omnimux-split-compact] .omx-quick-shortcuts',
      '.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omx-quick-shortcuts',
      '[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omx-quick-shortcuts',
    ]) {
      const body = ruleBody(QUICK_SHORTCUTS_CSS, selector)
      assert.match(body, /display:\s*none\s*!important;/, `${selector} 必须在分屏模式下隐藏`)
    }
  })
})
