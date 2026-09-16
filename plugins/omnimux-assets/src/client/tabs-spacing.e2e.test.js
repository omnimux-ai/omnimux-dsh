import assert from 'node:assert/strict'
import test from 'node:test'

import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { ASSETS_CSS } from './styles.js'

test('资产库两层标签纵向净空保持 10~14px', () => {
  const result = runStyleDomProbe({
    name: 'assets-tabs',
    styles: ASSETS_CSS,
    html: `
      <div class="omnimux-assets-stage" style="width:1200px">
        <div class="omnimux-assets-stage-toolbar" style="height:48px;padding:0 24px;display:flex;align-items:center">
          <div role="tablist" style="height:44px"><button role="tab" aria-selected="true" style="height:44px">本地</button></div>
        </div>
        <div class="omnimux-assets-local-nav">
          <div class="omnimux-assets-local-nav-row"><button class="omnimux-assets-cloud-chip" aria-pressed="true" style="height:28px">全部 3</button></div>
        </div>
      </div>`,
    measure: () => {
      const tab = document.querySelector('[role="tab"]')
      const chip = document.querySelector('.omnimux-assets-cloud-chip')
      const nav = document.querySelector('.omnimux-assets-local-nav')
      return {
        paddingTop: getComputedStyle(nav).paddingTop,
        gap: Math.round(chip.getBoundingClientRect().top - tab.getBoundingClientRect().bottom),
      }
    },
  })
  assert.equal(result.paddingTop, '12px')
  assert.ok(result.gap >= 10 && result.gap <= 16, `两层标签净空 ${result.gap}px 越界`)
})
