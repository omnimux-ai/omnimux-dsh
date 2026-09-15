import assert from 'node:assert/strict'
import test from 'node:test'

import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { PRODUCTS_CSS } from './styles.js'

test('产品库分割线两侧留白 20px 对齐内容与工具栏', () => {
  const result = runStyleDomProbe({
    name: 'products-divider',
    styles: PRODUCTS_CSS,
    html: `
      <div class="omnimux-products-stage" style="width:1200px">
        <div class="omnimux-products-list-view">
          <div class="omnimux-products-action-row" style="padding:8px 20px 12px"><button>添加产品</button></div>
          <div role="separator" aria-orientation="horizontal" style="height:1px;background:#333"></div>
          <div class="omnimux-products-stage-toolbar" style="padding:0 20px"><span>筛选</span></div>
        </div>
      </div>`,
    measure: () => {
      const divider = document.querySelector('.omnimux-products-stage [role="separator"]')
      const stage = document.querySelector('.omnimux-products-stage')
      const stageRect = stage.getBoundingClientRect()
      const dividerRect = divider.getBoundingClientRect()
      return {
        marginLeft: getComputedStyle(divider).marginLeft,
        marginRight: getComputedStyle(divider).marginRight,
        leftGap: Math.round(dividerRect.left - stageRect.left),
        rightGap: Math.round(stageRect.right - dividerRect.right),
      }
    },
  })
  assert.equal(result.marginLeft, '20px')
  assert.equal(result.marginRight, '20px')
  assert.equal(result.leftGap, 20)
  assert.equal(result.rightGap, 20)
})
