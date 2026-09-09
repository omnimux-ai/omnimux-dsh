/**
 * 画布/完整双模式顶栏三段显隐契约测试。
 *
 * 契约来源：架构设计（高见远）—— canvas 嵌入模式下顶栏只保留右段（Export / 交付），
 * 左段（WorkspaceModeTabs 模式切换）与中段（项目名称输入框 + 项目切换器）必须隐藏；
 * standalone 完整模式下三段全部保留。
 *
 * 实现方式：OpenReel 顶栏自身打 `data-toolbar-section="left|center|right"` 段标记
 * （外加 .openreel-toolbar-* 类名双保险），CLIP_CSS 按祖先
 * `.omnimux-clip-stage[data-clip-mode="canvas"|"standalone"]` 做互斥。
 *
 * 这里不只用 `String.includes` 做字符串断言——先做一个轻量 CSS 规则解析器，
 * 把选择器 → 声明块解析出来，再对真实声明值做断言，避免"注释里写了就算过"的假阳性。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLIP_CSS } from './styles.js'

const HERE = dirname(fileURLToPath(import.meta.url))

const TOOLBAR_TSX = join(HERE, 'openreel/web/components/editor/Toolbar.tsx')
const MOTION_TSX = join(HERE, 'openreel/web/motion/MotionCreatorShell.tsx')

// ─── 轻量 CSS 规则解析器 ────────────────────────────────────────────────
/** 剥掉注释，避免注释文本污染解析结果。 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * 解析成 [{ selector, decls: Map<string, string> }]。
 * 只处理本文件使用的扁平规则语法（无嵌套），@media 块会被展开为带条件前缀的记录。
 */
function parseRules(css) {
  const clean = stripComments(css)
  const rules = []
  let i = 0
  const mediaStack = []
  while (i < clean.length) {
    // 先吞掉闭合花括号（@media 块结束）与空白，避免它们混进下一条选择器
    while (i < clean.length && (clean[i] === '}' || /\s/.test(clean[i]))) {
      if (clean[i] === '}') mediaStack.pop()
      i += 1
    }
    const braceIdx = clean.indexOf('{', i)
    if (braceIdx === -1) break
    const head = clean.slice(i, braceIdx).trim()
    if (head.startsWith('@')) {
      mediaStack.push(head)
      i = braceIdx + 1
      continue
    }
    // 找到匹配的右花括号
    let depth = 1
    let j = braceIdx + 1
    while (j < clean.length && depth > 0) {
      if (clean[j] === '{') depth += 1
      else if (clean[j] === '}') depth -= 1
      j += 1
    }
    const body = clean.slice(braceIdx + 1, j - 1)
    const decls = new Map()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      const prop = part.slice(0, colon).trim()
      const value = part.slice(colon + 1).trim()
      if (prop) decls.set(prop, value)
    }
    const media = mediaStack.join(' && ')
    for (const raw of head.split(',').map((s) => s.trim()).filter(Boolean)) {
      // 归一化空白：源码里选择器可能跨行书写
      rules.push({ selector: raw.replace(/\s+/g, ' '), media, decls })
    }
    i = j
  }
  return rules
}

const RULES = parseRules(CLIP_CSS)

/** 找出所有（在指定 @media 条件下）命中该选择器片段的规则。 */
function rulesFor(selectorFragment, media = '') {
  return RULES.filter(
    (r) => r.selector.includes(selectorFragment) && (media ? r.media.includes(media) : !r.media),
  )
}

/** 取某选择器在指定条件下聚合得到的所有声明值。 */
function declValuesFor(selectorFragment, prop, media = '') {
  return rulesFor(selectorFragment, media)
    .map((r) => r.decls.get(prop))
    .filter(Boolean)
}

const CANVAS = '.omnimux-clip-stage[data-clip-mode="canvas"]'
const STANDALONE = '.omnimux-clip-stage[data-clip-mode="standalone"]'

// ─── 维度一：canvas 模式隐藏左段与中段 ──────────────────────────────────
test('canvas-toolbar-mode: canvas 隐藏左段（模式切换）', () => {
  const left = rulesFor(`${CANVAS} [data-toolbar-section="left"]`)
  assert.ok(left.length > 0, 'canvas 模式必须有针对左段的规则')
  assert.ok(
    left.every((r) => r.decls.get('display') === 'none !important'),
    `canvas 左段必须 display:none !important，实际: ${JSON.stringify(left.map((r) => r.decls.get('display')))}`,
  )
  // 双保险类名
  const alias = rulesFor(`${CANVAS} .openreel-toolbar-left`)
  assert.ok(alias.length > 0, 'canvas 模式必须同时覆盖 .openreel-toolbar-left 双保险类名')
  assert.ok(alias.every((r) => r.decls.get('display') === 'none !important'))
})

test('canvas-toolbar-mode: canvas 隐藏中段（项目名称 + 项目切换器）', () => {
  const center = rulesFor(`${CANVAS} [data-toolbar-section="center"]`)
  assert.ok(center.length > 0, 'canvas 模式必须有针对中段的规则')
  assert.ok(
    center.every((r) => r.decls.get('display') === 'none !important'),
    `canvas 中段必须 display:none !important，实际: ${JSON.stringify(center.map((r) => r.decls.get('display')))}`,
  )
  const alias = rulesFor(`${CANVAS} .openreel-toolbar-center`)
  assert.ok(alias.every((r) => r.decls.get('display') === 'none !important'))
})

// ─── 维度二：canvas 模式保留右段并右对齐 ────────────────────────────────
test('canvas-toolbar-mode: canvas 保留右段并顶到最右', () => {
  const right = rulesFor(`${CANVAS} [data-toolbar-section="right"]`)
  assert.ok(right.length > 0, 'canvas 模式必须有针对右段的规则')
  // 关键：右段绝不能被顺手隐藏
  assert.ok(
    right.every((r) => r.decls.get('display') !== 'none !important'),
    'canvas 模式绝不能隐藏右段（Export / 交付必须保留）',
  )
  assert.ok(
    declValuesFor(`${CANVAS} [data-toolbar-section="right"]`, 'margin-left').every(
      (v) => v === 'auto !important',
    ),
    'canvas 右段必须 margin-left:auto !important 顶到最右',
  )
})

test('canvas-toolbar-mode: return action is inlined into toolbar right with non-drag protection', () => {
  const src = stripComments(readFileSync(TOOLBAR_TSX, 'utf8'))
  assert.ok(src.includes('data-toolbar-section="right"'), 'Toolbar 必须包含右段标记')
  assert.ok(src.includes('omnimux-clip-stage-close-btn'), '右段必须包含退出编辑按钮类名')
  assert.ok(src.includes('WebkitAppRegion: "no-drag"'), '退出编辑按钮必须具有原生 no-drag 拖拽保护')
  assert.ok(src.includes('gap-2.5'), '右段必须使用 gap-2.5 并排布局导出按钮与退出编辑按钮')

  const exportIndex = src.indexOf('openreel-export-btn')
  const exitBtnIndex = src.indexOf('omnimux-clip-stage-close-btn')
  assert.ok(exportIndex !== -1, '右段必须包含导出按钮')
  assert.ok(exitBtnIndex !== -1, '右段必须包含退出编辑按钮')
  assert.ok(exportIndex < exitBtnIndex, '退出编辑按钮必须位于 Export 导出按钮的右侧')
})

// ─── 维度三：standalone 模式三段全显 ────────────────────────────────────
test('canvas-toolbar-mode: standalone 三段全部按 flex 展示', () => {
  for (const section of ['left', 'center', 'right']) {
    const sel = `${STANDALONE} [data-toolbar-section="${section}"]`
    const rules = rulesFor(sel)
    assert.ok(rules.length > 0, `standalone 模式必须有针对 ${section} 段的规则`)
    assert.ok(
      rules.some((r) => r.decls.get('display') === 'flex !important'),
      `standalone ${section} 段必须 display:flex !important`,
    )
  }
})

test('canvas-toolbar-mode: 官方 responsive 段不被无脑强制 flex（保留 lg 断点）', () => {
  // Motion 顶栏中段是 `hidden lg:flex`（窄窗口隐藏）。
  // Tailwind 以 important:'.openreel-studio-root' 生成 .hidden，
  // 若 standalone 规则不豁免 responsive 段，官方断点行为会被永久吃掉。
  //
  // 注意：standalone 规则的选择器形如
  //   [data-toolbar-section="left"]:where(:not([data-toolbar-responsive="true"]))
  // 因此"非 responsive 强制 flex"要看带 :where(:not(...)) 豁免的规则，
  // 而不是简单地检查选择器里有没有 data-toolbar-responsive 这个子串。
  const forced = RULES.filter(
    (r) =>
      !r.media &&
      r.selector.includes(STANDALONE) &&
      r.selector.includes(':where(:not([data-toolbar-responsive="true"]))') &&
      r.decls.get('display') === 'flex !important',
  )
  // 两套选择器（属性选择器 + .openreel-toolbar-* 双保险类名）各 3 条 = 6 条
  const forcedAttr = forced.filter((r) => r.selector.includes('[data-toolbar-section'))
  const forcedClass = forced.filter((r) => r.selector.includes('.openreel-toolbar-'))
  assert.equal(forcedAttr.length, 3, `属性选择器应有 3 条强制 flex 规则，实际 ${forcedAttr.length}`)
  assert.equal(forcedClass.length, 3, `双保险类名应有 3 条强制 flex 规则，实际 ${forcedClass.length}`)

  // 注意 :where(:not([data-toolbar-responsive="true"])) 也包含该子串，
  // 必须显式排除否定形式，只挑"正面命中 responsive 段"的规则。
  const responsive = RULES.filter(
    (r) =>
      r.selector.includes('[data-toolbar-responsive="true"]') &&
      !r.selector.includes(':not([data-toolbar-responsive'),
  )
  assert.ok(
    responsive.some(
      (r) => r.media.includes('1024px') && r.decls.get('display') === 'flex !important',
    ),
    'responsive 段必须在 @media (min-width:1024px) 下才 flex，窄窗口交回官方 hidden',
  )
  assert.ok(
    !responsive.some((r) => !r.media && r.decls.get('display') === 'flex !important'),
    'responsive 段不得在全局作用域被强制 flex（会破坏官方 lg 断点）',
  )
})

// ─── 维度四：模式互斥（同一段在两种模式下结论相反） ─────────────────────
test('canvas-toolbar-mode: 左/中段在两种模式下互斥，右段不互斥', () => {
  for (const section of ['left', 'center']) {
    const canvasDisplay = declValuesFor(`${CANVAS} [data-toolbar-section="${section}"]`, 'display')
    const standaloneDisplay = declValuesFor(
      `${STANDALONE} [data-toolbar-section="${section}"]`,
      'display',
    )
    assert.deepEqual(canvasDisplay, ['none !important'], `${section} 段 canvas 下必须隐藏`)
    assert.ok(
      standaloneDisplay.includes('flex !important'),
      `${section} 段 standalone 下必须展示`,
    )
  }
  const canvasRight = declValuesFor(`${CANVAS} [data-toolbar-section="right"]`, 'display')
  assert.ok(
    !canvasRight.includes('none !important'),
    '右段在两种模式下都必须可见（canvas 靠右对齐，不是隐藏）',
  )
})

// ─── 维度五：源码段标记完整性 ───────────────────────────────────────────
/** 统计源码里 data-toolbar-section 标记的出现情况（忽略注释）。 */
function readSectionMarkers(file) {
  const src = stripComments(readFileSync(file, 'utf8'))
  const found = new Set()
  for (const m of src.matchAll(/data-toolbar-section="(left|center|right)"/g)) {
    found.add(m[1])
  }
  return found
}

test('canvas-toolbar-mode: Toolbar.tsx 三段标记齐全', () => {
  const markers = readSectionMarkers(TOOLBAR_TSX)
  assert.deepEqual(
    [...markers].sort(),
    ['center', 'left', 'right'],
    'Toolbar.tsx 必须同时打上 left / center / right 三段标记',
  )
})

test('canvas-toolbar-mode: MotionCreatorShell.tsx 三段标记齐全', () => {
  const markers = readSectionMarkers(MOTION_TSX)
  assert.deepEqual(
    [...markers].sort(),
    ['center', 'left', 'right'],
    'MotionCreatorShell.tsx 必须同时打上 left / center / right 三段标记',
  )
})

test('canvas-toolbar-mode: 段标记双保险类名与属性成对出现', () => {
  for (const file of [TOOLBAR_TSX, MOTION_TSX]) {
    const src = stripComments(readFileSync(file, 'utf8'))
    for (const section of ['left', 'center', 'right']) {
      const attrRe = new RegExp(`data-toolbar-section="${section}"`)
      const classRe = new RegExp(`openreel-toolbar-${section}`)
      assert.ok(attrRe.test(src), `${file} 缺少 data-toolbar-section="${section}"`)
      assert.ok(classRe.test(src), `${file} 缺少 .openreel-toolbar-${section} 双保险类名`)
    }
  }
})

test('canvas-toolbar-mode: 中段标记确实包住项目名称输入与项目切换器', () => {
  const src = stripComments(readFileSync(TOOLBAR_TSX, 'utf8'))
  const start = src.indexOf('data-toolbar-section="center"')
  assert.ok(start > -1, 'Toolbar.tsx 缺少中段标记')
  // 取中段 div 的结束位置：下一段（right）标记之前
  const end = src.indexOf('data-toolbar-section="right"')
  assert.ok(end > start, '中段标记必须出现在右段标记之前')
  const segment = src.slice(start, end)
  assert.ok(segment.includes('ToolcraftTextInputControl'), '中段必须包含项目名称输入框')
  assert.ok(segment.includes('ProjectSwitcher'), '中段必须包含项目切换器')
})

test('canvas-toolbar-mode: 左段标记确实包住 WorkspaceModeTabs', () => {
  const src = stripComments(readFileSync(TOOLBAR_TSX, 'utf8'))
  const start = src.indexOf('data-toolbar-section="left"')
  const end = src.indexOf('data-toolbar-section="center"')
  assert.ok(start > -1 && end > start, 'Toolbar.tsx 左段标记位置异常')
  assert.ok(
    src.slice(start, end).includes('WorkspaceModeTabs'),
    '左段必须包含 WorkspaceModeTabs 模式切换',
  )
})

test('canvas-toolbar-mode: 两段模式选择器都以 data-clip-mode 为条件', () => {
  const src = stripComments(CLIP_CSS)
  assert.ok(src.includes('[data-clip-mode="canvas"]'), 'CLIP_CSS 缺少 canvas 模式选择器')
  assert.ok(src.includes('[data-clip-mode="standalone"]'), 'CLIP_CSS 缺少 standalone 模式选择器')
  // 保证段规则挂在 .omnimux-clip-stage 下，而不是全局污染宿主
  const sectionRules = RULES.filter((r) => r.selector.includes('[data-toolbar-section'))
  assert.ok(sectionRules.length > 0, '缺少段级规则')
  assert.ok(
    sectionRules.every((r) => r.selector.includes('.omnimux-clip-stage')),
    '所有段级规则都必须挂在 .omnimux-clip-stage 作用域下，禁止全局污染宿主主题',
  )
})

test('canvas-toolbar-mode: canvas 模式下隐藏媒体素材卡片上的生成 (KieAI/Sparkles) 图标', () => {
  const rules = rulesFor(`${CANVAS} [data-action="kieai"]`)
  assert.ok(rules.length > 0, 'canvas 模式必须有针对 [data-action="kieai"] 的隐藏规则')
  assert.ok(
    rules.every((r) => r.decls.get('display') === 'none !important'),
    'canvas [data-action="kieai"] 必须 display:none !important',
  )
  const aliasRules = rulesFor(`${CANVAS} .openreel-media-kieai-btn`)
  assert.ok(aliasRules.length > 0, 'canvas 模式必须同时覆盖 .openreel-media-kieai-btn 双保险类名')
  assert.ok(
    aliasRules.every((r) => r.decls.get('display') === 'none !important'),
    'canvas .openreel-media-kieai-btn 必须 display:none !important',
  )
})
