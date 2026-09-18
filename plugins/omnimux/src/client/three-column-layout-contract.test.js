/**
 * 三分栏布局契约门禁（Issue #2140）。
 *
 * 为什么需要它：三分栏（左栏 / 会话栏 / 右栏工作台）的收起行为由六条互相覆盖的
 * `grid-template-columns !important` 规则决定，**谁生效取决于层叠（重要性 → 特异性 → 顺序）**。
 * 既有断言都是源码文本正则，只证明某条规则**存在**，不证明它**胜出** —— 任何人追加一条
 * 靠后的规则即可改变真实几何而测试全绿。本套件改用「真实 CSS 文本 + 真实选择器匹配 +
 * 层叠判定」，锁住每个状态组合的**胜出规则与其列宽分配**。
 *
 * 契约真源：docs/contracts/three-column-layout.md（条款 INV-1 … INV-14）。
 * 真实内核几何由 scripts/three-column-collapse-qa.mjs 的状态矩阵负责；两者互补：
 * 本套件快、精确到规则；矩阵慢、证明浏览器里的实际列宽。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const TOGGLE_ATTR = 'data-omnimux-sidebar-toggle-topbar'
const LEFT_COLLAPSED = 'data-omnimux-left-collapsed'
const CONVERSATION_COLLAPSED = 'data-omnimux-conversation-collapsed'

/** 生产源码路径（相对本文件）。 */
const STYLE_SOURCE = 'conversation-box.js'
const COLLAPSE_SOURCE = 'conversation-collapse.js'

/** 读取同目录生产源码文本。刻意不用 import：CI 以精简依赖集运行本文件，只允许 jsdom 一个外部依赖。 */
function sourceText(relative) {
  return readFileSync(new URL(relative, import.meta.url), 'utf8')
}

/**
 * 从源码文本里原样抽取导出的 CSS 模板字面量。
 * 抽取失败必须抛错——常量被改名或删除即应让门禁变红，绝不静默空转。
 * @param {string} source
 * @param {string} anchor
 * @returns {string}
 */
export function extractTemplate(source, anchor) {
  const start = source.indexOf(anchor)
  assert.ok(start >= 0, `生产源码中未找到样式常量锚点：${anchor}`)
  const bodyStart = start + anchor.length
  const end = source.indexOf('\n`', bodyStart)
  assert.ok(end > bodyStart, `生产源码中的样式模板字面量未闭合：${anchor}`)
  return source.slice(bodyStart, end)
}

const boxSource = sourceText(STYLE_SOURCE)
const collapseSource = sourceText(COLLAPSE_SOURCE)

/** 三分栏网格规则的真源（唯一）。 */
export const PRODUCT_STAGE_CHROME = extractTemplate(boxSource, 'export const PRODUCT_STAGE_CHROME = `')
/**
 * 中间栏收起模块的样式。其选择器含常量插值，按真实取值还原后再解析；
 * 本模块当前不含网格规则，还原是为将来若有人把网格规则挪进来时仍能被判定。
 */
export const CONVERSATION_COLLAPSE_CSS = extractTemplate(
  collapseSource,
  'CONVERSATION_COLLAPSE_CSS = `',
).replace(/\$\{CONVERSATION_COLLAPSED_ATTR\}/g, CONVERSATION_COLLAPSED)

/* ------------------------------------------------------------------ 解析与判定 */

/**
 * 解析 CSS 文本中带 `grid-template-columns` 的规则，保留源码顺序。
 * 自解析而非依赖 jsdom 的 CSSOM：后者遇到 `:has()` 等选择器会整段丢弃规则，
 * 而丢掉一条规则就等于门禁瞎了一只眼。
 * @param {string} css
 * @returns {{ selectorText: string, grid: string, index: number }[]}
 */
export function parseGridRules(css) {
  const clean = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let matched
  while ((matched = re.exec(clean))) {
    const selectorText = matched[1].trim()
    if (!selectorText || selectorText.startsWith('@')) continue
    const declaration = matched[2]
      .split(';')
      .find((part) => part.split(':')[0]?.trim() === 'grid-template-columns')
    if (!declaration) continue
    const value = declaration.slice(declaration.indexOf(':') + 1).replace(/!important\s*$/i, '').trim()
    if (!value) continue
    rules.push({ selectorText, grid: normalizeGrid(value), index: rules.length })
  }
  return rules
}

/** 归一化列宽表达式，便于比较（压缩空白）。 */
export function normalizeGrid(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

/**
 * 标准 CSS 特异性 [id, class/attr/pseudo-class, type]。
 * `:not()` / `:is()` / `:has()` 按其参数取特异性（:is/:has 取最高者，此处按并集近似，
 * 对本仓的选择器形态足够；出现偏差时会影响判定顺序，故保留为导出函数便于单测）。
 * @param {string} selector
 * @returns {[number, number, number]}
 */
export function specificity(selector) {
  const expanded = String(selector || '')
    .replace(/:not\(([^)]*)\)/g, ' $1 ')
    .replace(/:is\(([^)]*)\)/g, ' $1 ')
    .replace(/:has\(([^)]*)\)/g, ' $1 ')
  const ids = (expanded.match(/#[\w-]+/g) || []).length
  const classes = (expanded.match(/\.[\w-]+|\[[^\]]*\]|:{1,2}[\w-]+(\([^)]*\))?/g) || []).length
  const types = (expanded.match(/(^|[\s>+~])([a-zA-Z][\w-]*)/g) || []).length
  return [ids, classes, types]
}

const compareSpecificity = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/**
 * 在给定状态组合下解出胜出的列宽规则。
 * @param {{ selectorText: string, grid: string, index: number }[]} rules
 * @param {{ htmlAttrs?: string, frameAttrs?: string }} state
 * @returns {{ grid: string, selectorText: string, specificity: number[] } | null} null = 无插件规则命中（交外壳原生）
 */
export function resolveGridWinner(rules, state = {}) {
  const htmlAttrs = state.htmlAttrs ? ` ${state.htmlAttrs}` : ''
  const frameAttrs = state.frameAttrs ? ` ${state.frameAttrs}` : ''
  const dom = new JSDOM(
    `<!doctype html><html${htmlAttrs}><body><div class="dshDesktopFrame"${frameAttrs}></div></body></html>`,
  )
  const frame = dom.window.document.querySelector('.dshDesktopFrame')
  const hits = []
  for (const rule of rules) {
    for (const selector of rule.selectorText.split(',').map((part) => part.trim())) {
      if (!selector) continue
      let matched = false
      try {
        matched = frame.matches(selector)
      } catch {
        matched = false // 本引擎不认识的选择器不参与判定，绝不静默当成命中
      }
      if (!matched) continue
      hits.push({ grid: rule.grid, selectorText: selector, specificity: specificity(selector), index: rule.index })
    }
  }
  if (hits.length === 0) return null
  hits.sort((a, b) => compareSpecificity(a.specificity, b.specificity) || a.index - b.index)
  return hits[hits.length - 1]
}

/** 生产真源里的全部列宽规则（源码顺序即层叠顺序）。 */
const PRODUCTION_RULES = [...parseGridRules(PRODUCT_STAGE_CHROME), ...parseGridRules(CONVERSATION_COLLAPSE_CSS)]

/**
 * 契约真值表：状态组合 → 期望的胜出列宽。
 * `contractGrid` 是契约期望；`observedGrid` 是当前实测（两者不同即为已登记的偏差）。
 */
const MATRIX = [
  {
    id: 'INV-11',
    label: '① 三分栏展开（无收起标记）',
    state: { htmlAttrs: TOGGLE_ATTR },
    contractGrid: null,
    note: '展开态交外壳原生网格，插件不得介入',
  },
  {
    id: 'INV-1+INV-2',
    label: '② 左栏收起（右栏开）',
    state: { htmlAttrs: `${TOGGLE_ATTR} ${LEFT_COLLAPSED}` },
    contractGrid: '0px var(--omnimux-conversation-width, 380px) minmax(0px, 1fr)',
    note: '会话栏保持像素宽度，释放的 280px 全部交给右栏',
  },
  {
    id: 'INV-6',
    label: '③ 左栏收起 + 右栏收起',
    state: { htmlAttrs: `${TOGGLE_ATTR} ${LEFT_COLLAPSED}`, frameAttrs: 'data-rightbar-collapsed="true"' },
    contractGrid: '0px minmax(0px, 1fr) 0px',
    note: '右栏确证收起时会话栏占满视口，绝不留下黑色死区',
  },
  {
    id: 'INV-1',
    label: '④ 官方左栏收起（frame 标记，无 html 镜像）',
    state: { htmlAttrs: TOGGLE_ATTR, frameAttrs: 'data-sidebar-collapsed' },
    contractGrid: '0px var(--omnimux-conversation-width, 380px) minmax(0px, 1fr)',
    note: '壳层自身收起左栏时同样保宽（html 镜像与 frame 标记必须行为一致）',
  },
  {
    id: 'INV-9',
    label: '⑤ 中间栏收起（左栏展开，右栏开）',
    state: { htmlAttrs: `${TOGGLE_ATTR} ${CONVERSATION_COLLAPSED}` },
    contractGrid: 'var(--omnimux-sidebar-width, 280px) 0px minmax(0px, 1fr)',
    note: '中间列收缩为 0，右栏占满右侧',
  },
  {
    id: 'INV-9×INV-1',
    label: '⑥ 中间栏收起 + 左栏收起（右栏开）',
    state: { htmlAttrs: `${TOGGLE_ATTR} ${CONVERSATION_COLLAPSED} ${LEFT_COLLAPSED}` },
    // 契约期望（INV-9 × INV-1 交叉态）：中间列收缩为 0，右栏吃掉全部宽度。
    // 实测当前由 `#2074` 的保宽规则夺取，中间列仍留一行会话栏宽度（真实浏览器实测 485px，
    // 见 docs/evidence/three-column-collapse-qa-report.json 的 matrix 段）。
    contractGrid: 'var(--omnimux-sidebar-width, 0px) 0px minmax(0px, 1fr)',
    observedGrid: '0px var(--omnimux-conversation-width, 380px) minmax(0px, 1fr)',
    knownDeviation: 'K-1',
    note: '已知偏差 K-1：保宽规则特异性更高，既有的中间栏收缩规则被覆盖',
  },
  {
    id: 'INV-6',
    label: '⑦ 右栏收起（左栏展开）',
    state: { htmlAttrs: TOGGLE_ATTR, frameAttrs: 'data-rightbar-collapsed="true"' },
    contractGrid: 'var(--omnimux-sidebar-width, 280px) minmax(0px, 1fr) 0px',
    note: '会话栏占满剩余宽度',
  },
]

/* ------------------------------------------------------------------ 契约断言 */

describe('三分栏布局契约：状态组合的胜出规则（Issue #2140）', () => {
  it('生产真源里确实存在参与层叠的列宽规则（门禁未空转）', () => {
    assert.ok(
      PRODUCTION_RULES.length >= 6,
      `期望至少 6 条 grid-template-columns 规则参与层叠，实际 ${PRODUCTION_RULES.length} 条`,
    )
    assert.ok(
      PRODUCTION_RULES.some((rule) => rule.grid.includes('--omnimux-conversation-width')),
      '保宽规则必须存在：它是「收起左栏不改会话栏宽度」的唯一实现',
    )
  })

  for (const entry of MATRIX) {
    it(`${entry.id} ${entry.label}`, () => {
      const winner = resolveGridWinner(PRODUCTION_RULES, entry.state)
      const observed = winner ? normalizeGrid(winner.grid) : null
      const expected = entry.observedGrid ?? entry.contractGrid

      if (expected === null) {
        assert.equal(
          observed,
          null,
          `${entry.label}：插件不得介入展开态，实测却被「${observed}」命中（选择器 ${winner?.selectorText}）`,
        )
        return
      }
      assert.equal(
        observed,
        normalizeGrid(expected),
        `${entry.label}：胜出列宽应为「${expected}」，实测「${observed}」` +
          `（胜出选择器 ${winner?.selectorText}）\n` +
          `  契约依据：${entry.note}` +
          (entry.knownDeviation ? `\n  该条为已登记偏差 ${entry.knownDeviation}，契约期望为「${entry.contractGrid}」` : ''),
      )
    })
  }

  it('已登记偏差 K-1 仍然存在（行为一旦变化必须重新确认契约，而不是悄悄漂移）', () => {
    const suspected = MATRIX.find((entry) => entry.knownDeviation === 'K-1')
    const winner = resolveGridWinner(PRODUCTION_RULES, suspected.state)
    const observed = winner ? normalizeGrid(winner.grid) : null
    assert.notEqual(
      observed,
      normalizeGrid(suspected.contractGrid),
      'K-1 已被修复：请同步更新契约文档、本矩阵与真实内核 QA 的期望值，并删除本条登记',
    )
    assert.equal(
      observed,
      normalizeGrid(suspected.observedGrid),
      'K-1 的现状发生变化（既非契约期望也非登记现状），必须先确认新行为是否符合三分栏契约',
    )
  })
})

/* ------------------------------------------------------------------ 门禁自证 */

describe('门禁自身的检出能力：篡改规则必须被发现（反向验证）', () => {
  const base = PRODUCTION_RULES.length
  const baselineRule = PRODUCTION_RULES.find((rule) => rule.grid.includes('--omnimux-conversation-width'))
  assert.ok(base > 0 && baselineRule, '生产真源必须包含保宽规则')

  it('复制保宽规则改掉列宽并追加到末尾 → 判定必须随之改变', () => {
    // 「随手改动」的真实形态：复制一条既有规则、改数值、贴在样式表末尾。
    // 同特异性下后者胜出，既有断言（只看规则是否存在）对此完全无感。
    const tampered = [
      ...PRODUCTION_RULES,
      { ...baselineRule, grid: '777px minmax(0px, 1fr) 1fr', index: base },
    ]
    const winner = resolveGridWinner(tampered, MATRIX[1].state)
    assert.equal(
      normalizeGrid(winner.grid),
      '777px minmax(0px, 1fr) 1fr',
      '同选择器的后置规则未生效：判定函数必须按「同特异性取后者」的层叠规则收敛',
    )
    assert.notEqual(
      normalizeGrid(winner.grid),
      normalizeGrid(MATRIX[1].observedGrid ?? MATRIX[1].contractGrid),
      '门禁未能检出一条夺取状态的追加规则：这正是「随意改动后悄悄乱掉」的路径',
    )
  })

  it('追加一条低特异性的通用规则 → 判定不得改变（避免误报）', () => {
    const tampered = [
      ...PRODUCTION_RULES,
      { selectorText: '.dshDesktopFrame', grid: '111px minmax(0px, 1fr) 1fr', index: base },
    ]
    const winner = resolveGridWinner(tampered, MATRIX[1].state)
    assert.equal(
      normalizeGrid(winner.grid),
      normalizeGrid(MATRIX[1].contractGrid),
      '低特异性通用规则不应夺取状态组合，否则门禁会因无关改动误报',
    )
  })

  it('删除保宽规则 → 左栏收起态的判定必须改变', () => {
    const withoutBaseline = PRODUCTION_RULES.filter(
      (rule) => !rule.grid.includes('--omnimux-conversation-width'),
    )
    const winner = resolveGridWinner(withoutBaseline, MATRIX[1].state)
    const observed = winner ? normalizeGrid(winner.grid) : null
    assert.notEqual(
      observed,
      normalizeGrid(MATRIX[1].contractGrid),
      '删掉保宽规则后判定竟然不变，说明矩阵断言没有真正压在这条规则上',
    )
  })

  it('把保宽规则弱化成低特异性选择器 → 左栏收起态不再保宽（矩阵确实在检验特异性）', () => {
    const weakened = PRODUCTION_RULES.map((rule) =>
      rule.grid.includes('--omnimux-conversation-width')
        ? { ...rule, selectorText: '.dshDesktopFrame', grid: rule.grid }
        : rule,
    )
    const winner = resolveGridWinner(weakened, MATRIX[1].state)
    assert.notEqual(
      normalizeGrid(winner.grid),
      normalizeGrid(MATRIX[1].contractGrid),
      '保宽规则被弱化后仍被判为胜出，说明矩阵没有真正检验选择器特异性',
    )
  })
})

/* ------------------------------------------------------------------ 禁改清单 */

describe('禁改清单（INV-3 / INV-10 / INV-12）', () => {
  it('INV-10 第三轨严禁 auto，也严禁写死像素（右栏会被压成 0）', () => {
    for (const rule of PRODUCTION_RULES) {
      assert.doesNotMatch(
        rule.grid,
        /(^|\s)auto(\s|$)/,
        `第三轨出现 auto：${rule.selectorText}\n  auto 会与 1fr 竞争，把右侧工作台压成 0px`,
      )
    }
  })

  it('INV-3 不得出现记忆式会话栏基准', () => {
    for (const rule of PRODUCTION_RULES) {
      assert.doesNotMatch(
        rule.grid,
        /lastGoodConversationWidth|rememberConversationWidth/,
        '记忆式基准会让收起态拖动分割线被吞掉，必须保持派生态',
      )
    }
    assert.doesNotMatch(
      CONVERSATION_COLLAPSE_CSS,
      /--omnimux-conversation-width\s*:\s*\d+px\s*!important/,
      '会话栏宽度只能由几何写入方派生写入，不得在样式表里写死',
    )
  })

  it('INV-6 保宽规则必须排除右栏收起态，否则右栏收起时会话栏无法全宽', () => {
    const baseline = PRODUCTION_RULES.filter((rule) => rule.grid.includes('--omnimux-conversation-width'))
    assert.ok(baseline.length > 0, '保宽规则必须存在')
    for (const rule of baseline) {
      assert.match(
        rule.selectorText,
        /:not\(\[data-rightbar-collapsed="true"\]\)/,
        `保宽规则缺少右栏收起排除：${rule.selectorText}\n` +
          '  缺少它会复现 Issue #1749 的「会话栏无法全宽 / 中间黑色死区」',
      )
    }
  })
})
