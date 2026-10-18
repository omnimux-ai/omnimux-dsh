import assert from 'node:assert/strict'
import test from 'node:test'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { PRODUCT_STAGE_CHROME } from './conversation-box.js'

/**
 * 端到端回归：macOS 红绿灯安全区不得在页头嵌套层级上累加（Issue #1838）。
 *
 * 在真实浏览器里渲染真实的安全区规则与真实页头 DOM，断言布局几何。纯字符串断言无法发现
 * 「84px 被每一层各加一次」这类缺陷，只有真实布局计算能发现。
 *
 * 浏览器选择与证据由共享布局探针管理。
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

const MEASURE = () => {
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
}

/**
 * 渲染给定状态下的页头并读取几何。
 * 页面自测后把结果写进标题，由共享探针带回。
 */
function measure({ darwin = false, leftCollapsed = false, conversationCollapsed = false, productStage = null } = {}) {
  const attrs = [
      darwin ? `document.body.setAttribute('data-dsh-desktop-platform','darwin');` : '',
      leftCollapsed ? `document.documentElement.setAttribute('data-omnimux-left-collapsed','');` : '',
      conversationCollapsed ? `document.documentElement.setAttribute('data-omnimux-conversation-collapsed','');` : '',
      productStage ? `document.documentElement.setAttribute('data-dsh-product-stage','${productStage}');` : '',
  ].join('')
  return runStyleDomProbe({
    name: 'header-safe-inset', viewportHeight: 600,
    styles: PAGE_HEADER_BASE_CSS + PRODUCT_STAGE_CHROME,
    html: `${HEADER_DOM}<script>${attrs}</script>`, measure: MEASURE,
  })
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

test('工作台一级页在左栏收起态保持 20px 统一基线，标题与按钮对齐', () => {
  const leftCollapsed = measure({ darwin: true, leftCollapsed: true })
  assert.equal(leftCollapsed.pageHeader.paddingLeft, '20px', '工作台页签页在左栏收起时应保持 20px 标准内距')
  assert.equal(leftCollapsed.title.paddingLeft, '0px', '安全区仍不得命中标题')
  assert.equal(leftCollapsed.title.offset, leftCollapsed.subtitle.offset, '标题与副标题必须对齐')
  assert.ok(
    Math.abs(leftCollapsed.title.offset - leftCollapsed.actionRow.offset) <= 24,
    `标题应与「新建项目」按钮同左基线，实际 标题=${leftCollapsed.title.offset} 按钮=${leftCollapsed.actionRow.offset}`,
  )
})

test('独立覆盖层（product stage）在左栏收起时正确避让窗口按钮 84px', () => {
  const stageCollapsed = measure({ darwin: true, leftCollapsed: true, productStage: 'omnimux-apps' })
  assert.equal(stageCollapsed.pageHeader.paddingLeft, '84px', '独立舞台覆盖层在左栏收起时需避让窗口红绿灯')
})

test('左栏展开且会话列收起时（工作台全屏常态），页头保持自身 20px 内边距不被安全区误伤', () => {
  const conversationCollapsed = measure({ darwin: true, conversationCollapsed: true })
  assert.equal(conversationCollapsed.pageHeader.paddingLeft, '20px', '左栏展开时无需避让窗口按钮')
  assert.equal(conversationCollapsed.title.paddingLeft, '0px')
  assert.equal(conversationCollapsed.title.offset, conversationCollapsed.subtitle.offset)
  assert.ok(
    Math.abs(conversationCollapsed.title.offset - conversationCollapsed.actionRow.offset) <= 24,
    `标题应与「新建项目」按钮同左基线，实际 标题=${conversationCollapsed.title.offset} 按钮=${conversationCollapsed.actionRow.offset}`,
  )
})

test('非 macOS 平台不受安全区规则影响', () => {
  const web = measure({})
  assert.equal(web.pageHeader.paddingLeft, '20px')
  assert.equal(web.title.paddingLeft, '0px')
  assert.equal(web.title.offset, web.subtitle.offset)
})
