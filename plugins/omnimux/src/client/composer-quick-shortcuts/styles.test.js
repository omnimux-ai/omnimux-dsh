import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { QUICK_SHORTCUTS, QUICK_SHORTCUT_ARROW_ICON } from './catalog.js'
import { QUICK_SHORTCUTS_CSS } from './styles.js'

/**
 * 本文件把 Issue #2572 的形态契约钉死在源码层：无边框、整行居中、箭头透明态、
 * 图标与条目一一对应。原型是**真实浏览器**里量到的几何与计算样式，见
 * `.agent-reports/quick-shortcuts-icon-style/`；源码断言只负责防止回退。
 *
 * `icons.jsx` 是 JSX，node:test 不能直接 import，因此一律按文本读并断言关键片段。
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const ICONS_PATH = resolve(HERE, 'icons.jsx')
const COMPONENT_PATH = resolve(HERE, 'ComposerQuickShortcuts.jsx')

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

/** 取 icons.jsx 里图标查表的全部键名。 */
function glyphNames(source) {
  const at = source.indexOf('QUICK_SHORTCUT_ICON_PATHS = Object.freeze({')
  assert.ok(at !== -1, 'icons.jsx 必须仍以查表方式给出图标')
  const body = source.slice(at, source.indexOf('})', at))
  return [...body.matchAll(/^\s{2}'?([a-z][a-z-]*)'?: \(/gm)].map((match) => match[1])
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

  it('模型与参数控件、写失败提示都独占一行，不参与四条按钮的居中计算', () => {
    const controls = ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcut-controls')
    assert.match(controls, /flex-basis:\s*100%;/, '控件必须自成一行，否则会把居中的按钮挤偏')
    assert.doesNotMatch(controls, /position:\s*absolute/, '控件不得绝对定位到行内（会压住最右侧按钮）')
    assert.match(controls, /justify-content:\s*center;/, '控件在自己的行里居中')
    assert.match(controls, /min-width:\s*0;/, '控件必须能被压缩，否则窄列下横向溢出压字')
    assert.match(controls, /flex-wrap:\s*wrap;/, '窄列下两个胶囊要能自己折行')

    const notice = ruleBody(QUICK_SHORTCUTS_CSS, '.omx-quick-shortcut-notice')
    assert.match(notice, /flex-basis:\s*100%;/, '提示出现时也不得把按钮挤偏')
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

  it('色彩一律取既有 token，不新造色值', () => {
    const bareColors = QUICK_SHORTCUTS_CSS.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g) || []
    assert.deepEqual(bareColors, [], `样式表出现裸色值：${bareColors.join(', ')}`)
    assert.match(QUICK_SHORTCUTS_CSS, /var\(--dsw-alias-label-secondary\)/, '文字色必须取既有 token')
  })
})

describe('图标与条目一一对应', () => {
  it('四条条目的图标名各不相同，且都在图标查表里', async () => {
    const names = glyphNames(await readFile(ICONS_PATH, 'utf8'))
    for (const entry of QUICK_SHORTCUTS) {
      assert.ok(names.includes(entry.icon), `${entry.id} 的图标 ${entry.icon} 必须在 icons.jsx 的查表里`)
    }
    assert.equal(new Set(QUICK_SHORTCUTS.map((entry) => entry.icon)).size, 4, '四条不得复用同一枚图标')
  })

  it('行尾箭头用的 `move-up-right` 也在查表里', async () => {
    const source = await readFile(ICONS_PATH, 'utf8')
    assert.ok(glyphNames(source).includes(QUICK_SHORTCUT_ARROW_ICON), '箭头图标必须在查表里')
    assert.match(source, /QUICK_SHORTCUT_ICON_PATHS\['move-up-right'\]/, '箭头组件必须按名取图，不复制一份路径')
  })

  it('图标 14px、箭头 12px，尺寸有单一真源', async () => {
    const source = await readFile(ICONS_PATH, 'utf8')
    assert.match(source, /QUICK_SHORTCUT_ICON_SIZE = 14\b/, '条目图标尺寸必须是 14px')
    assert.match(source, /QUICK_SHORTCUT_ARROW_SIZE = 12\b/, '行尾箭头尺寸必须是 12px')
    assert.equal((source.match(/width=\{QUICK_SHORTCUT_(?:ICON|ARROW)_SIZE\}/g) || []).length, 2, '两个组件都必须用尺寸常量')
  })

  it('lucide 路径逐字落地（抽样钉住五枚图标的特征路径）', async () => {
    const source = await readFile(ICONS_PATH, 'utf8')
    const fingerprints = [
      ['film', 'M3 12h18'],
      ['text-search', 'm21 19-1.9-1.9'],
      ['workflow', 'M7 11v4a2 2 0 0 0 2 2h4'],
      ['sparkles', 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558'],
      [QUICK_SHORTCUT_ARROW_ICON, 'M19 5L5 19'],
    ]
    for (const [name, path] of fingerprints) {
      assert.ok(source.includes(path), `${name} 的特征路径不得改动：${path}`)
    }
    assert.equal((source.match(/viewBox="0 0 24 24"/g) || []).length, 2, '两个 svg 的 viewBox 必须都是 24')
  })

  it('组件按条目取图标，且每项固定是「图标 + 文字 + 箭头」', async () => {
    const source = await readFile(COMPONENT_PATH, 'utf8')
    assert.match(source, /<QuickShortcutIcon name=\{entry\.icon\} \/>/, '图标必须由条目决定，不在渲染处硬编码')
    assert.doesNotMatch(source, /entry\.id === 'clone'/, '渲染处不得出现按 id 分支的图标硬编码')
    assert.match(source, /className="omx-quick-shortcut-label"/, '文案必须有独立节点')
    assert.match(source, /<QuickShortcutArrow \/>/, '每项末尾必须有箭头')
  })
})
