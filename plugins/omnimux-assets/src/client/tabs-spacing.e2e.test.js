import assert from 'node:assert/strict'
import test from 'node:test'

import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { ASSETS_CSS } from './styles.js'

/**
 * 共享基础组件贡献的几何，取自各自的源码（都不在 ASSETS_CSS 内，夹具按真机结构补齐）：
 *  - dsh-ui-kit `toolbar/Toolbar.module.css` 的 `.bar`：一级工具栏是横向不折行的 flex 行、垂直居中
 *    （高度由 ASSETS_CSS 的 `.omnimux-assets-stage-toolbar` 给出，此处不重复声明）；
 *  - dsh-ui-kit `tabs/Tabs.module.css` 的 `.underline` / `.tabItem`：一级页签字面体 44px，
 *    `role="tab"` 元素就是 `.tabItem`，以 height:100% 撑满该行；
 *  - `@deepseek-ai/dsh-client-ui-primitives` 的 `Button.module.css` 的 `.sm`：二级胶囊
 *    （Button size="sm"）高 28px（design.md §2.1 的 28px 紧凑变体）。
 * 两条净空的数值（`main` 的内边距、两级分类行的内边距）一律由 ASSETS_CSS 产出。
 */
const PRIMITIVE_CSS = `
.bar { display: flex; flex-wrap: nowrap; align-items: center; box-sizing: border-box; }
.underline { display: inline-flex; align-items: center; height: 44px; }
.underline .tabItem { display: inline-flex; align-items: center; height: 100%; }
.sm { height: 28px; }
`

const TOOLBAR = `
      <div class="omnimux-assets-stage-toolbar bar">
        <div role="tablist" class="underline">
          <button type="button" role="tab" aria-selected="true" class="tabItem">本地</button>
          <button type="button" role="tab" aria-selected="false" class="tabItem">公共</button>
        </div>
      </div>`

const CHIP_ROW = (rowClass) => `
        <div class="${rowClass}" role="group" aria-label="二级分类">
          <button type="button" class="omnimux-assets-cloud-chip sm" aria-pressed="true">全部</button>
          <button type="button" class="omnimux-assets-cloud-chip sm" aria-pressed="false">角色</button>
          <button type="button" class="omnimux-assets-cloud-chip sm" aria-pressed="false">场景</button>
        </div>`

// 路径 A：本地 / 产品库 / AI生成 —— 分类行挂在吸附栏 `.omx-stage-sticky` 内。
const PATH_A = `
    <div class="omnimux-assets-stage omx-stage-scroll" data-path="local" style="height:560px">
      <div class="omx-stage-sticky" data-rail="local">
${TOOLBAR}
        <div class="omnimux-assets-local-nav" data-nav="local">
${CHIP_ROW('omnimux-assets-local-nav-row')}
        </div>
      </div>
      <div class="omnimux-assets-body">
        <div class="omnimux-assets-main">
          <div data-content="local" style="height:1200px;flex:none"></div>
        </div>
      </div>
    </div>`

// 路径 B：公共 —— 分类行由 CloudAssetsView 自渲染，落在 `.omnimux-assets-body > .omnimux-assets-main` 内。
const PATH_B = `
    <div class="omnimux-assets-stage omx-stage-scroll" data-path="cloud" style="height:560px">
      <div class="omx-stage-sticky" data-rail="cloud">
${TOOLBAR}
      </div>
      <div class="omnimux-assets-body">
        <div class="omnimux-assets-main">
          <div class="omnimux-assets-cloud">
            <div class="omnimux-assets-cloud-nav omx-stage-sticky" data-nav="cloud">
${CHIP_ROW('omnimux-assets-cloud-nav-row')}
            </div>
            <div class="omnimux-assets-cloud-scroll">
              <div data-content="cloud" style="height:1200px;flex:none"></div>
            </div>
          </div>
        </div>
      </div>
    </div>`

test('资产库两条分类行挂载路径的上净空各自锁定 14px、下净空各自锁定 30px', () => {
  const result = runStyleDomProbe({
    name: 'assets-tabs-spacing-two-paths',
    styles: `${PRIMITIVE_CSS}${ASSETS_CSS}`,
    // 夹具只摆两条真实挂载路径的 DOM，并内联滚动视口与内容填充高度（二者不参与任何断言数值）。
    html: `${PATH_A}${PATH_B}`,
    measure: () => {
      const readPath = (path) => {
        const stage = document.querySelector(`[data-path="${path}"]`)
        const rail = document.querySelector(`[data-rail="${path}"]`)
        const nav = document.querySelector(`[data-nav="${path}"]`)
        const main = stage.querySelector('.omnimux-assets-main')
        const tabs = stage.querySelectorAll('[role="tab"]')
        const lastTab = tabs[tabs.length - 1]
        const chip = nav.querySelector('.omnimux-assets-cloud-chip')
        const content = stage.querySelector(`[data-content="${path}"]`)
        // 真机由 AssetsStage 的 ResizeObserver 把吸附栏实测高写进 --stage-rail-h。
        stage.style.setProperty('--stage-rail-h', `${Math.round(rail.getBoundingClientRect().height)}px`)
        const navStyle = getComputedStyle(nav)
        const mainStyle = getComputedStyle(main)
        const gapTop = () => Math.round(chip.getBoundingClientRect().top - lastTab.getBoundingClientRect().bottom)
        const navTopRest = Math.round(nav.getBoundingClientRect().top)
        const restGapTop = gapTop()
        const gapBottom = Math.round(content.getBoundingClientRect().top - chip.getBoundingClientRect().bottom)
        stage.scrollTop = 320
        const scrolled = stage.scrollTop
        const stuckGapTop = gapTop()
        const navTopStuck = Math.round(nav.getBoundingClientRect().top)
        stage.scrollTop = 0
        return {
          restGapTop,
          stuckGapTop,
          gapBottom,
          navShift: navTopStuck - navTopRest,
          scrolled,
          railHeight: Math.round(rail.getBoundingClientRect().height),
          navPaddingTop: navStyle.paddingTop,
          navPaddingBottom: navStyle.paddingBottom,
          navPositionTop: navStyle.top,
          mainPaddingTop: mainStyle.paddingTop,
          mainPaddingLeft: mainStyle.paddingLeft,
          mainPaddingRight: mainStyle.paddingRight,
          mainPaddingBottom: mainStyle.paddingBottom,
        }
      }
      return { local: readPath('local'), cloud: readPath('cloud') }
    },
  })

  // 1. 静态契约：公共分类行吸附在一级工具栏正下方，偏移取吸附栏实测高。
  assert.match(
    ASSETS_CSS,
    /\.omnimux-assets-cloud-nav\.omx-stage-sticky\s*\{[^}]*top:\s*var\(--stage-rail-h,\s*0px\)/,
    '公共分类行的吸附声明（top: var(--stage-rail-h)）不得缺失',
  )
  // 2. 本地分类行的内边距是三个页签共用的几何，不得改动。
  assert.match(
    ASSETS_CSS,
    /\.omnimux-assets-local-nav \{[^}]*padding: 12px 20px 14px;/,
    '本地分类行的内边距必须保持 12px 20px 14px',
  )

  for (const path of ['local', 'cloud']) {
    const reading = result[path]
    assert.equal(reading.scrolled, 320, `${path} 路径未滚动到吸附阈值，吸附态读数无效`)
    assert.equal(reading.restGapTop, 14, `${path} 路径一级↔二级净空（静止）应为 14px`)
    assert.equal(reading.stuckGapTop, 14, `${path} 路径一级↔二级净空（吸附后）应为 14px`)
    assert.equal(reading.gapBottom, 30, `${path} 路径二级↔内容净空应为 30px`)
    assert.equal(reading.mainPaddingBottom, '16px', `${path} 路径 main 的下内边距应为 16px`)
  }

  // 3. 公共路径：分类行静止顶边与吸附态顶边重合，净空不会随滚动跳变。
  assert.equal(result.cloud.navShift, 0, '公共分类行静止顶边与吸附态顶边必须重合')
  assert.equal(result.cloud.navPositionTop, '48px', '公共分类行的吸附偏移应等于吸附栏高')
  assert.equal(result.cloud.railHeight, 48, '公共吸附栏（工具栏）高度应为 48px')
  assert.equal(result.cloud.navPaddingTop, '12px')
  assert.equal(result.cloud.navPaddingBottom, '20px')

  // 4. 本地路径：分类行内边距与吸附栏高度逐值不变（本地/产品库/AI生成 共用）。
  assert.equal(result.local.navShift, 0)
  assert.equal(result.local.railHeight, 102, '本地吸附栏高度应为 102px')
  assert.equal(result.local.navPaddingTop, '12px')
  assert.equal(result.local.navPaddingBottom, '14px')

  // 5. `main` 的上内边距只对公共路径归零：三页签路径仍是 16px，左右基准线两条路径一致。
  assert.equal(result.local.mainPaddingTop, '16px', '三页签路径 main 的上内边距应为 16px')
  assert.equal(result.cloud.mainPaddingTop, '0px', '公共路径 main 的上内边距应归零')
  for (const path of ['local', 'cloud']) {
    assert.equal(result[path].mainPaddingLeft, '20px', `${path} 路径 main 的左内边距应为 20px`)
    assert.equal(result[path].mainPaddingRight, '20px', `${path} 路径 main 的右内边距应为 20px`)
  }
})
