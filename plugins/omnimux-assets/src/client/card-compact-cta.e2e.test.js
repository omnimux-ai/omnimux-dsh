import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { ASSETS_CSS } from './styles.js'

const here = dirname(fileURLToPath(import.meta.url))
const gridSource = readFileSync(join(here, 'AssetGrid.jsx'), 'utf8')

const LABEL = '.omnimux-assets-overlay-label'

const BASE_CSS = `.dshUk-Button-label { min-width: 0; }`

const html = (view, add) => `
<div style="width:1600px;padding:20px">
  <div class="probe-card omnimux-assets-card" style="width:320px">
    <div class="omnimux-assets-card-thumb">
      <div class="omnimux-assets-card-overlay">
        <div class="omnimux-assets-card-overlay-actions">
          <button class="omnimux-assets-overlay-btn omnimux-assets-overlay-btn--secondary">
            <span class="dshUk-Button-slot" aria-hidden="true"><svg width="14" height="14"></svg></span>
            <span class="dshUk-Button-label"><span class="${LABEL.slice(1)}">${view}</span></span>
          </button>
          <button class="omnimux-assets-overlay-btn omnimux-assets-overlay-btn--primary">
            <span class="dshUk-Button-slot" aria-hidden="true"><svg width="14" height="14"></svg></span>
            <span class="dshUk-Button-label"><span class="${LABEL.slice(1)}">${add}</span></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>`

/** 选择器必须内联：测量函数会被序列化进页面，闭包在此处不可用。 */
function probeWidths(view, add, widths) {
  const source = `function measure() {
    const labelClass = ${JSON.stringify(LABEL)}
    const widths = ${JSON.stringify(widths)}
    const card = document.querySelector('.probe-card')
    const rows = []
    for (const w of widths) {
      card.style.width = w + 'px'
      const btns = Array.prototype.slice.call(card.querySelectorAll('button'))
      rows.push({
        cardWidth: w,
        buttons: btns.map(function (b) {
          const label = b.querySelector(labelClass)
          const br = b.getBoundingClientRect()
          const lr = label ? label.getBoundingClientRect() : null
          const cs = label ? getComputedStyle(label) : null
          return {
            width: Math.round(br.width * 10) / 10,
            height: Math.round(br.height * 10) / 10,
            display: cs ? cs.display : '?',
            clipped: cs && cs.display !== 'none' && label ? label.scrollWidth > Math.ceil(lr.width) : false,
          }
        }),
      })
    }
    return rows
  }`
  // eslint-disable-next-line no-eval
  return runStyleDomProbe({
    name: 'assets-compact-cta',
    styles: `${ASSETS_CSS}\n${BASE_CSS}`,
    html: html(view, add),
    measure: eval(`(${source})`),
  })
}

test('资产库卡片：卡片自身宽度驱动 CTA 退化，紧凑只留图标、充足显示文字且永不裁切', () => {
  for (const [locale, view, add] of [
    ['zh', '查看详情', '添加到会话'],
    ['en', 'View Details', 'Add to Conversation'],
  ]) {
    const rows = probeWidths(view, add, [140, 200, 260, 290, 302, 340, 420])
    const compact = rows.filter((r) => r.cardWidth <= 290)
    const roomy = rows.filter((r) => r.cardWidth >= 302)

    assert.equal(compact.length > 0 && roomy.length > 0, true, `${locale}: 宽度分组必须同时覆盖紧凑与充足区间`)

    for (const row of compact) {
      for (const btn of row.buttons) {
        assert.equal(btn.display, 'none', `${locale} ${row.cardWidth}px: 紧凑区间文字标签必须退出布局`)
        assert.equal(btn.width, 32, `${locale} ${row.cardWidth}px: 紧凑区间按钮收缩为 32px 图标按钮`)
        assert.equal(btn.height, 32, `${locale} ${row.cardWidth}px: 紧凑区间按钮高度不变`)
      }
    }

    for (const row of roomy) {
      for (const btn of row.buttons) {
        assert.notEqual(btn.display, 'none', `${locale} ${row.cardWidth}px: 充足区间必须显示文字标签`)
        assert.equal(btn.clipped, false, `${locale} ${row.cardWidth}px: 充足区间文字不得被裁切`)
      }
    }
  }
})

test('资产库卡片：退化由具名容器查询判定，且声明落在卡片根节点上', () => {
  assert.match(ASSETS_CSS, /\.omnimux-assets-card\s*\{[^}]*container-type:\s*inline-size/, '卡片根节点必须是 inline-size 容器')
  assert.match(ASSETS_CSS, /container-name:\s*asset-card/, '容器必须有唯一名字，避免误命中祖先容器')
  assert.match(ASSETS_CSS, /@container asset-card \(max-width:\s*296px\)/, '退化规则必须由具名容器查询判定')
})

test('资产库卡片：文字标签由源码渲染，无障碍名称与交互保持原样', () => {
  assert.match(gridSource, /className="omnimux-assets-overlay-label"/, '按钮文字必须包进可隐藏的标签元素')
  assert.match(gridSource, /aria-label=\{t\('card\.view'\)\}/, '退化后无障碍名称仍由 aria-label 提供')
  assert.match(
    gridSource,
    /aria-label=\{added \? t\('card\.addedToConversation'\) : t\('card\.addToConversation'\)\}/,
    '主行动按钮的无障碍名称不得丢失',
  )
  assert.match(gridSource, /onClick=\{handleView\}/)
  assert.match(gridSource, /onClick=\{handleAdd\}/)
})
