import assert from 'node:assert/strict'
import test from 'node:test'

import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { ASSETS_CSS } from './styles.js'

test('E2E: 资产中心分类 Tab 胶囊彻底移除数量数字且八维下拉选项保留数量', () => {
  const result = runStyleDomProbe({
    name: 'assets-tab-counts-removal',
    styles: ASSETS_CSS,
    html: `
      <div class="omnimux-assets-stage" style="width:1200px">
        <!-- 公共资产库一级与二级 Tab 胶囊导航 -->
        <div class="omnimux-assets-cloud-nav">
          <div class="omnimux-assets-cloud-nav-row" role="group" aria-label="公共素材分类">
            <button class="omnimux-assets-cloud-chip" aria-pressed="true">全部</button>
            <button class="omnimux-assets-cloud-chip" aria-pressed="false">角色</button>
            <button class="omnimux-assets-cloud-chip" aria-pressed="false">场景</button>
            <button class="omnimux-assets-cloud-chip" aria-pressed="false">道具</button>
            <button class="omnimux-assets-cloud-chip" aria-pressed="false">素材</button>
            <button class="omnimux-assets-cloud-chip" aria-pressed="false">风格</button>
            <button class="omnimux-assets-cloud-chip" aria-pressed="false">声音</button>
          </div>
          <div class="omnimux-assets-cloud-subnav" role="group" aria-label="二级分类">
            <button class="omnimux-assets-cloud-chip" aria-pressed="true">全部</button>
            <button class="omnimux-assets-cloud-chip" aria-pressed="false">女性角色</button>
            <button class="omnimux-assets-cloud-chip" aria-pressed="false">男性角色</button>
          </div>
        </div>

        <!-- 本地资产分类 Tab 胶囊导航 -->
        <div class="omnimux-assets-local-nav">
          <div class="omnimux-assets-local-nav-row" role="group" aria-label="本地素材分类">
            <button class="omnimux-assets-cloud-chip" aria-pressed="true">全部</button>
            <button class="omnimux-assets-cloud-chip" aria-pressed="false">角色</button>
            <button class="omnimux-assets-cloud-chip" aria-pressed="false">场景</button>
          </div>
        </div>

        <!-- 八维筛选下拉 Popover 选项（保护区：保留数量） -->
        <div class="omnimux-assets-cloud-dimension-menu">
          <button class="omnimux-assets-cloud-dimension-option" aria-pressed="true">
            <span class="omnimux-assets-cloud-dimension-option-label">全部</span>
            <span class="omnimux-assets-cloud-count">429</span>
          </button>
          <button class="omnimux-assets-cloud-dimension-option" aria-pressed="false">
            <span class="omnimux-assets-cloud-dimension-option-label">Female</span>
            <span class="omnimux-assets-cloud-count">263</span>
          </button>
        </div>
      </div>`,
    measure: () => {
      // 1. 检查一级、二级与本地分类 Tab 胶囊
      const chips = Array.from(document.querySelectorAll('.omnimux-assets-cloud-chip'))
      const chipTexts = chips.map((c) => c.textContent.trim())
      const chipsWithCountSpan = chips.filter((c) => c.querySelector('.omnimux-assets-cloud-count') !== null)

      // 2. 检查八维下拉 Popover 菜单内部选项
      const menuOptions = Array.from(document.querySelectorAll('.omnimux-assets-cloud-dimension-option'))
      const optionCounts = menuOptions.map((opt) => {
        const countSpan = opt.querySelector('.omnimux-assets-cloud-count')
        return countSpan ? countSpan.textContent.trim() : null
      })

      return {
        totalChips: chips.length,
        chipTexts,
        chipsWithCountSpanCount: chipsWithCountSpan.length,
        menuOptionCount: menuOptions.length,
        optionCounts,
      }
    },
  })

  // 断言 1：所有分类 Tab 胶囊均不含 .omnimux-assets-cloud-count 数量节点
  assert.equal(result.chipsWithCountSpanCount, 0, '所有 Tab 胶囊均不得包含数量 span')

  // 断言 2：Tab 胶囊文本均为纯文本，无尾随数字
  for (const text of result.chipTexts) {
    assert.doesNotMatch(text, /\d+$/, `Tab 胶囊 "${text}" 不得携带数字`)
  }

  // 断言 3：八维下拉 Popover 选项保护区完好保留数量
  assert.equal(result.menuOptionCount, 2)
  assert.deepEqual(result.optionCounts, ['429', '263'], '八维下拉选项必须完好保留统计数量')
})
