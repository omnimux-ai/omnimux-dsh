/**
 * 加载态视觉契约（AC-1 / AC-2）：
 * 画布中央一道 1.6px 细弧（SVG，viewBox 32x32，r=14，dasharray 24 64）
 * + 下方一行 12.5px 说明文字；单一 1.35s 线性旋转动效 + 280ms 整体淡入。
 *
 * 宿主（CanvasBridge / CanvasTab）共用 CanvasLoadingState 组件；画布岛
 * （canvas/App.tsx）用同一套 DOM 结构与 workbench-theme.css 实现——两棵
 * React 树只共享视觉契约，不交换组件或元素。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { WORKFLOW_CSS } from './styles.js'

const here = dirname(fileURLToPath(import.meta.url))
const bridgeSrc = readFileSync(join(here, 'CanvasBridge.jsx'), 'utf8')
const canvasTabSrc = readFileSync(join(here, 'projects/CanvasTab.jsx'), 'utf8')
const islandAppSrc = readFileSync(join(here, '../canvas/App.tsx'), 'utf8')
const islandThemeCss = readFileSync(join(here, '../canvas/theme/workbench-theme.css'), 'utf8')
const hostLocalesSrc = readFileSync(join(here, 'locales.js'), 'utf8')
const islandZhSrc = readFileSync(join(here, '../canvas/i18n/dict.zh.ts'), 'utf8')

/** 取出一条顶层 CSS 规则的完整文本（含选择器）。避免计算属性访问。 */
function extractRule(css, selector) {
  const start = css.indexOf(`${selector} {`)
  assert.ok(start >= 0, `缺少选择器 ${selector}`)
  let depth = 0
  let cursor = start
  let end = -1
  while (cursor < css.length && end < 0) {
    const nextOpen = css.indexOf('{', cursor)
    const nextClose = css.indexOf('}', cursor)
    if (nextClose < 0) break
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1
      cursor = nextOpen + 1
    } else {
      depth -= 1
      cursor = nextClose + 1
      if (depth === 0) end = cursor
    }
  }
  assert.ok(end > start, `${selector} 规则体未闭合`)
  return css.slice(start, end)
}

const countOf = (src, pattern) => (src.match(pattern) ?? []).length
const hostLoader = bridgeSrc.slice(
  bridgeSrc.indexOf('export function CanvasLoadingState'),
  bridgeSrc.indexOf('\nexport function CanvasBridge'),
)
const islandLoader = islandAppSrc.slice(
  islandAppSrc.indexOf("if (boot.phase === 'loading')"),
  islandAppSrc.indexOf("if (boot.phase === 'error')"),
)

describe('宿主加载态：CanvasLoadingState 单一细弧 + 一行说明', () => {
  it('CanvasBridge 导出加载组件，且 loading 分支不再渲染纯文字', () => {
    assert.match(bridgeSrc, /export function CanvasLoadingState\(/)
    assert.match(bridgeSrc, /status === 'loading' \? <CanvasLoadingState t=\{t\} \/> : null/)
    assert.doesNotMatch(bridgeSrc, /className="omnimux-workflow-canvas-status">\s*\{t\('canvas\.loading'\)\}/)
    // 错误态与重试按钮行为保持原样
    assert.match(bridgeSrc, /status === 'error' \?/)
    assert.match(bridgeSrc, /t\('canvas\.loadFailed'\)/)
    assert.match(bridgeSrc, /onClick=\{\(\) => \{ void load\(\) \}\}/)
  })

  it('CanvasTab 无目标工作区时复用同一加载组件', () => {
    assert.match(canvasTabSrc, /import \{ CanvasBridge, CanvasLoadingState \} from '\.\.\/CanvasBridge\.jsx'/)
    assert.match(canvasTabSrc, /<CanvasLoadingState t=\{t\} \/>/)
    assert.doesNotMatch(canvasTabSrc, /className="omnimux-workflow-canvas-status">\s*\{t\('canvas\.loading'\)\}/)
  })

  it('DOM：viewBox 32x32、单 circle r=14、1.6px、round、dasharray 24 64', () => {
    assert.equal(countOf(hostLoader, /<circle/g), 1, '加载态只允许一道弧，禁止底环/第二环')
    assert.match(hostLoader, /viewBox="0 0 32 32"/)
    assert.match(hostLoader, /cx="16"/)
    assert.match(hostLoader, /cy="16"/)
    assert.match(hostLoader, /r="14"/)
    assert.match(hostLoader, /strokeWidth="1\.6"/)
    assert.match(hostLoader, /strokeLinecap="round"/)
    assert.match(hostLoader, /strokeDasharray="24 64"/)
    assert.match(hostLoader, /className="omnimux-workflow-canvas-loading-label">\{t\('canvas\.loading'\)\}/)
    // 颜色只允许在 CSS 里以 token + fallback 出现，JSX 不得写裸色值。
    assert.doesNotMatch(hostLoader, /stroke=["']#/)
    assert.doesNotMatch(hostLoader, /style=\{\{/)
  })

  it('CSS：1.35s 线性无限旋转 + 280ms 淡入 + 12.5px/.05em 说明文字', () => {
    const spinner = extractRule(WORKFLOW_CSS, '.omnimux-workflow-canvas-loading-spinner')
    assert.match(spinner, /animation:\s*omnimux-workflow-canvas-loading-spin 1\.35s linear infinite/)
    const loading = extractRule(WORKFLOW_CSS, '.omnimux-workflow-canvas-loading')
    assert.match(loading, /animation:\s*omnimux-workflow-canvas-loading-fade 280ms/)
    const label = extractRule(WORKFLOW_CSS, '.omnimux-workflow-canvas-loading-label')
    assert.match(label, /font-size:\s*12\.5px/)
    assert.match(label, /letter-spacing:\s*\.05em/)
    assert.match(label, /color:\s*var\(--dsw-alias-label-tertiary,\s*#[0-9a-f]{3,8}\)/)
    const arc = extractRule(WORKFLOW_CSS, '.omnimux-workflow-canvas-loading-arc')
    assert.match(arc, /stroke:\s*var\(--dsw-alias-[a-z-]+,\s*#cfc7ff\)/, '弧色优先 DSH token，#cfc7ff 仅作 fallback')
    // 不出现光晕 / 阴影 / 伪元素装饰
    for (const rule of [spinner, loading, label, arc]) {
      assert.doesNotMatch(rule, /box-shadow|filter:|text-shadow|::before|::after/)
    }
    assert.equal(countOf(WORKFLOW_CSS, /@keyframes omnimux-workflow-canvas-loading-spin/g), 1, '只允许一个旋转动效')
    assert.match(WORKFLOW_CSS, /@keyframes omnimux-workflow-canvas-loading-fade/)
  })

  it('文案：中文说明为「正在打开创作页」', () => {
    assert.match(hostLocalesSrc, /'canvas\.loading': '正在打开创作页'/)
    assert.doesNotMatch(hostLocalesSrc, /正在加载创作画布/)
  })
})

describe('岛内 boot loading：与宿主同构的单一细弧 + 一行说明', () => {
  it('App.tsx loading 分支使用同一 DOM 结构与文案 key', () => {
    assert.equal(countOf(islandLoader, /<circle/g), 1, '岛内加载态只允许一道弧')
    assert.match(islandLoader, /viewBox="0 0 32 32"/)
    assert.match(islandLoader, /r="14"/)
    assert.match(islandLoader, /strokeWidth="1\.6"/)
    assert.match(islandLoader, /strokeLinecap="round"/)
    assert.match(islandLoader, /strokeDasharray="24 64"/)
    assert.match(islandLoader, /t\('app\.loading'\)/)
    assert.doesNotMatch(islandLoader, /style=\{\{/)
    // 错误态与重试按钮行为不变
    assert.match(islandAppSrc, /window\.location\.reload\(\)/)
    assert.match(islandAppSrc, /t\('app\.retry'\)/)
  })

  it('workbench-theme.css：同一套动效与排版，颜色走 --wb-* token', () => {
    assert.match(islandThemeCss, /--wb-loader-arc:\s*var\(--dsw-alias-brand-purple,\s*#cfc7ff\)/)
    const spinner = extractRule(islandThemeCss, '.wf-canvas-boot-spinner')
    assert.match(spinner, /animation:\s*wf-canvas-boot-spin 1\.35s linear infinite/)
    const status = extractRule(islandThemeCss, '.wf-canvas-boot-status')
    assert.match(status, /animation:\s*wf-canvas-boot-fade 280ms/)
    const label = extractRule(islandThemeCss, '.wf-canvas-boot-status__label')
    assert.match(label, /font-size:\s*12\.5px/)
    assert.match(label, /letter-spacing:\s*\.05em/)
    assert.match(label, /color:\s*var\(--wb-text-muted\)/)
    const arc = extractRule(islandThemeCss, '.wf-canvas-boot-spinner__arc')
    assert.match(arc, /stroke:\s*var\(--wb-loader-arc,\s*#cfc7ff\)/)
    assert.equal(countOf(islandThemeCss, /@keyframes wf-canvas-boot-spin/g), 1, '只允许一个旋转动效')
  })

  it('文案：岛内中文说明与宿主一致', () => {
    assert.match(islandZhSrc, /'app\.loading': '正在打开创作页'/)
    assert.doesNotMatch(islandZhSrc, /正在加载工作区/)
  })
})
