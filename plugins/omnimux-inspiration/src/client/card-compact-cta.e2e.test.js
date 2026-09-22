import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { INSPIRATION_CSS } from './styles.js'

const here = dirname(fileURLToPath(import.meta.url))
const cardSource = readFileSync(join(here, 'InspirationCoverCard.jsx'), 'utf8')

const LABEL = '.omnimux-inspiration-overlay-cta-label'
const BTN = '.omnimux-inspiration-overlay-cta-btn'

const BASE_CSS = `.dshUk-Button-label { min-width: 0; } .probe-cover { position: relative; width: 100%; overflow: hidden; }`

const html = (detail, tryLabel) => `
<div style="width:1600px;padding:20px">
  <div class="probe-card omnimux-inspiration-card-pure" style="width:320px">
    <div class="dshUk-MediaCard-coverWrapper probe-cover" style="aspect-ratio:9/16">
      <div class="omnimux-inspiration-card-overlay">
        <div class="omnimux-inspiration-overlay-cta">
          <button class="${BTN.slice(1)} secondary">
            <span class="dshUk-Button-slot" aria-hidden="true"><svg width="14" height="14"></svg></span>
            <span class="dshUk-Button-label"><span class="${LABEL.slice(1)}">${detail}</span></span>
          </button>
          <button class="${BTN.slice(1)} primary">
            <span class="dshUk-Button-slot" aria-hidden="true"><svg width="14" height="14"></svg></span>
            <span class="dshUk-Button-label"><span class="${LABEL.slice(1)}">${tryLabel}</span></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>`

/**
 * 真实 Chrome 中按宽度扫描卡片，回传每个宽度下两个按钮与文字标签的几何。
 * 选择器必须内联成字面量：测量函数会被序列化进页面，闭包在此处不可用。
 */
function probeWidths(detail, tryLabel, widths) {
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
            fontSize: getComputedStyle(b).fontSize,
            fontWeight: getComputedStyle(b).fontWeight,
            clipped: cs && cs.display !== 'none' && label ? label.scrollWidth > Math.ceil(lr.width) : false,
          }
        }),
      })
    }
    return rows
  }`
  // eslint-disable-next-line no-eval
  return runStyleDomProbe({
    name: 'inspiration-compact-cta',
    styles: `${INSPIRATION_CSS}\n${BASE_CSS}`,
    html: html(detail, tryLabel),
    measure: eval(`(${source})`),
  })
}

test('灵感库卡片：卡片自身宽度驱动 CTA 退化，紧凑只留图标、充足显示文字且永不裁切', () => {
  for (const [locale, detail, tryLabel] of [
    ['zh', '详情', '立即复刻'],
    ['en', 'Details', 'Replicate now'],
  ]) {
    const rows = probeWidths(detail, tryLabel, [140, 180, 208, 240, 260, 320, 400])
    const compact = rows.filter((r) => r.cardWidth <= 180)
    const roomy = rows.filter((r) => r.cardWidth >= (locale === 'en' ? 260 : 208))

    assert.equal(compact.length > 0 && roomy.length > 0, true, `${locale}: 宽度分组必须同时覆盖紧凑与充足区间`)

    for (const row of compact) {
      for (const btn of row.buttons) {
        assert.equal(btn.display, 'none', `${locale} ${row.cardWidth}px: 紧凑区间文字标签必须退出布局`)
        assert.equal(btn.width, 28, `${locale} ${row.cardWidth}px: 紧凑区间按钮收缩为 28px 图标按钮`)
        assert.equal(btn.height, 28, `${locale} ${row.cardWidth}px: 紧凑区间按钮高度不变`)
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

test('灵感库卡片：容器查询按卡片宽度判定，且字号契约不再走会被丢弃的 font 简写', () => {
  assert.match(
    INSPIRATION_CSS,
    /\.omnimux-inspiration-card-pure\s*\{[^}]*container-type:\s*inline-size/,
    '卡片根节点必须是 inline-size 容器',
  )
  assert.match(INSPIRATION_CSS, /container-name:\s*inspiration-card/, '容器必须有唯一名字，避免误命中祖先容器')
  assert.match(
    INSPIRATION_CSS,
    /@container inspiration-card \(max-width:\s*200px\)/,
    '退化规则必须由具名容器查询判定',
  )
  assert.doesNotMatch(INSPIRATION_CSS, /font:\s*550 12px\/16px inherit/, 'font 简写里的 inherit 非法，整条声明会被丢弃')
})

test('灵感库卡片：文字标签由源码渲染，无障碍名称与交互保持原样', () => {
  assert.match(cardSource, /className="omnimux-inspiration-overlay-cta-label"/, '按钮文字必须包进可隐藏的标签元素')
  assert.match(cardSource, /aria-label=\{t\('card\.cta\.detail'\)\}/, '退化后无障碍名称仍由 aria-label 提供')
  assert.match(cardSource, /aria-label=\{t\('card\.cta\.tryFull'\)\}/, '主行动按钮的无障碍名称不得丢失')
  assert.match(cardSource, /onClick=\{handleDetail\}/)
  assert.match(cardSource, /onClick=\{handleReplicate\}/)
})
