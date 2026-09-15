import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PRODUCT_STAGE_CHROME } from './conversation-box.js'

/**
 * 端到端回归：macOS 红绿灯安全区不得在页头嵌套层级上累加（Issue #1838）。
 *
 * 在真实 Chrome 里渲染真实的安全区规则与真实页头 DOM，断言布局几何。纯字符串断言无法发现
 * 「84px 被每一层各加一次」这类缺陷，只有真实布局计算能发现。
 *
 * 依赖本机安装的 Chrome；CI 不执行本文件（与 comment-native.e2e.test.js 同类的本地专用 e2e）。
 */

/** PageHeader 的关键布局声明，取自 dsh-ui-kit 的 PageHeader.module.css。 */
const PAGE_HEADER_BASE_CSS = `
.dshUk-PageHeader-pageHeader { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; min-height: 56px; box-sizing: border-box; flex: none; gap: 16px; }
.dshUk-PageHeader-heading { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.dshUk-PageHeader-titleRow { display: flex; align-items: center; gap: 8px; }
.dshUk-PageHeader-title { margin: 0; font-size: 20px; font-weight: 600; line-height: 28px; }
.dshUk-PageHeader-subtitle { margin: 0; font-size: 13px; line-height: 18px; }
.dshUk-PageHeader-controls { display: flex; align-items: center; gap: 8px; flex: none; }
.omnimux-workflow-library-page { width: 100%; }
.omnimux-workflow-library-action-row { display: flex; padding: 8px 20px 12px; }
`

const HEADER_DOM = `
<div class="omnimux-workflow-library-page">
  <header class="dshUk-PageHeader-pageHeader">
    <div class="dshUk-PageHeader-heading">
      <div class="dshUk-PageHeader-titleRow"><h1 class="dshUk-PageHeader-title">创作画布</h1></div>
      <p class="dshUk-PageHeader-subtitle">管理项目工程、查看创作页面与项目资产</p>
    </div>
    <div class="dshUk-PageHeader-controls"><button>refresh</button><button>close</button></div>
  </header>
  <div class="omnimux-workflow-library-action-row"><button>新建项目</button></div>
</div>`

const MEASURE = `(() => {
  const host = document.querySelector('.omnimux-workflow-library-page').getBoundingClientRect();
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { offset: Math.round(r.x - host.x), paddingLeft: getComputedStyle(el).paddingLeft };
  };
  return {
    pageHeader: pick('.dshUk-PageHeader-pageHeader'),
    heading: pick('.dshUk-PageHeader-heading'),
    title: pick('.dshUk-PageHeader-title'),
    subtitle: pick('.dshUk-PageHeader-subtitle'),
    actionRow: pick('.omnimux-workflow-library-action-row'),
  };
})()`

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/opt/homebrew/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
].filter(Boolean)

function findChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate))
  assert.ok(found, `未找到 Chrome，无法执行布局端到端回归。候选路径：${CHROME_CANDIDATES.join(', ')}`)
  return found
}

/**
 * 渲染给定状态下的页头并读取几何。
 * 页面自测后把结果写进 <title>，由 --dump-dom 带回，测试里无需维护一套 CDP 客户端。
 */
function measure({ darwin = false, leftCollapsed = false, conversationCollapsed = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-header-e2e-'))
  try {
    const attrs = [
      darwin ? `document.body.setAttribute('data-dsh-desktop-platform','darwin');` : '',
      leftCollapsed ? `document.documentElement.setAttribute('data-omnimux-left-collapsed','');` : '',
      conversationCollapsed ? `document.documentElement.setAttribute('data-omnimux-conversation-collapsed','');` : '',
    ].join('')
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>pending</title>
<style>* { box-sizing: border-box; margin: 0; padding: 0; } body { width: 1600px; }</style>
<style>${PAGE_HEADER_BASE_CSS}</style>
<style>${PRODUCT_STAGE_CHROME}</style>
</head><body>${HEADER_DOM}
<script>
${attrs}
document.title = 'RESULT:' + JSON.stringify(${MEASURE});
</script></body></html>`
    const page = join(dir, 'probe.html')
    writeFileSync(page, html)
    const out = spawnSync(findChrome(), [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--window-size=1600,600', '--virtual-time-budget=1500', '--dump-dom', `file://${page}`,
    ], { encoding: 'utf8', timeout: 30000 })
    const stdout = out.stdout ?? ''
    const match = /<title>RESULT:(.*?)<\/title>/s.exec(stdout)
    assert.ok(match, `页面未回传测量结果。Chrome 输出片段：${stdout.slice(0, 400)}`)
    return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('页头安全区不在嵌套层级上累加，标题与描述保持左对齐', () => {
  const expanded = measure({ darwin: true })
  assert.equal(expanded.title.paddingLeft, '0px', '标题不应被安全区规则命中')
  assert.equal(expanded.subtitle.paddingLeft, '0px', '描述不应被安全区规则命中')
  assert.equal(expanded.heading.paddingLeft, '0px', '页头内层容器不应被安全区规则命中')
  assert.equal(expanded.pageHeader.paddingLeft, '20px', '左栏展开时页头应保留自身内边距')
  assert.equal(expanded.title.offset, expanded.subtitle.offset, '标题与描述必须共享同一左边界')
  assert.ok(
    Math.abs(expanded.title.offset - expanded.actionRow.offset) <= 24,
    `标题应与「新建项目」按钮同左基线，实际 标题=${expanded.title.offset} 按钮=${expanded.actionRow.offset}`,
  )
})

test('左栏或会话列收起时页头保留 84px 窗口按钮安全区', () => {
  const leftCollapsed = measure({ darwin: true, leftCollapsed: true })
  assert.equal(leftCollapsed.pageHeader.paddingLeft, '84px', '左栏收起时页头应避让窗口按钮')
  assert.equal(leftCollapsed.title.paddingLeft, '0px', '安全区仍不得命中标题')

  const conversationCollapsed = measure({ darwin: true, conversationCollapsed: true })
  assert.equal(conversationCollapsed.pageHeader.paddingLeft, '84px', '会话列收起时页头应避让窗口按钮')
})

test('非 macOS 平台不受安全区规则影响', () => {
  const web = measure({})
  assert.equal(web.pageHeader.paddingLeft, '20px')
  assert.equal(web.title.paddingLeft, '0px')
  assert.equal(web.title.offset, web.subtitle.offset)
})
