import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const cssSource = readFileSync(join(here, 'css.js'), 'utf8')
const MARKET_CSS = /const CSS = `([\s\S]*)`\s*;/.exec(cssSource)?.[1] || ''
const cardSource = readFileSync(join(here, 'plaza/FeaturedCard.jsx'), 'utf8')

const LABEL = '.hover-btn-label'
const CREATIFY_LABEL = '.omnimux-creatify-quick-try-label'

const html = (detail, tryLabel) => `
<div style="width:1600px;padding:20px">
  <div class="probe-card featured-card" style="width:320px">
    <div class="featured-cover-wrap">
      <div class="featured-hover-actions">
        <button class="hover-btn hover-btn-detail"><svg width="14" height="14" viewBox="0 0 24 24"></svg><span class="${LABEL.slice(1)}">${detail}</span></button>
        <button class="hover-btn hover-btn-try"><svg width="14" height="14" viewBox="0 0 24 24"></svg><span class="${LABEL.slice(1)}">${tryLabel}</span></button>
      </div>
    </div>
  </div>
</div>`

/** 选择器必须内联：测量函数会被序列化进页面，闭包在此处不可用。 */
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
            iconCount: b.querySelectorAll('svg').length,
            clipped: cs && cs.display !== 'none' && label ? label.scrollWidth > Math.ceil(lr.width) : false,
          }
        }),
      })
    }
    return rows
  }`
  // eslint-disable-next-line no-eval
  return runStyleDomProbe({
    name: 'market-compact-cta',
    styles: MARKET_CSS,
    html: html(detail, tryLabel),
    measure: eval(`(${source})`),
  })
}

const creatifyHtml = (tryTooltip, tryLabel) => `
<div style="width:1600px;padding:20px">
  <div class="probe-creatify-card omnimux-creatify-card featured-card" style="width:320px">
    <div class="omnimux-creatify-card-hover-drawer">
      <div class="omnimux-creatify-drawer-content">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
          <div class="omnimux-creatify-drawer-uses"><span>100+ 次使用</span></div>
          <button type="button" class="omnimux-creatify-quick-try-btn" title="${tryTooltip}" aria-label="${tryTooltip}">
            <svg width="12" height="12" viewBox="0 0 24 24"></svg>
            <span class="${CREATIFY_LABEL.slice(1)}">${tryLabel}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>`

function probeCreatifyWidths(tryTooltip, tryLabel, widths) {
  const source = `function measure() {
    const labelClass = ${JSON.stringify(CREATIFY_LABEL)}
    const widths = ${JSON.stringify(widths)}
    const card = document.querySelector('.probe-creatify-card')
    const rows = []
    for (const w of widths) {
      card.style.width = w + 'px'
      const btn = card.querySelector('.omnimux-creatify-quick-try-btn')
      const label = btn ? btn.querySelector(labelClass) : null
      const br = btn ? btn.getBoundingClientRect() : null
      const lr = label ? label.getBoundingClientRect() : null
      const cs = label ? getComputedStyle(label) : null
      rows.push({
        cardWidth: w,
        button: btn ? {
          width: Math.round(br.width * 10) / 10,
          height: Math.round(br.height * 10) / 10,
          display: cs ? cs.display : '?',
          iconCount: btn.querySelectorAll('svg').length,
          title: btn.getAttribute('title') || '',
          ariaLabel: btn.getAttribute('aria-label') || '',
          clipped: cs && cs.display !== 'none' && label ? label.scrollWidth > Math.ceil(lr.width) : false,
        } : null,
      })
    }
    return rows
  }`
  // eslint-disable-next-line no-eval
  return runStyleDomProbe({
    name: 'creatify-compact-cta',
    styles: MARKET_CSS,
    html: creatifyHtml(tryTooltip, tryLabel),
    measure: eval(`(${source})`),
  })
}

test('专家市场精选卡：卡片自身宽度驱动 CTA 退化，紧凑只留图标、充足显示文字且永不裁切', () => {
  assert.ok(MARKET_CSS.includes('.hover-btn'), '市场样式表必须被完整提取')

  for (const [locale, detail, tryLabel] of [
    ['zh', '查看详情', '去对话中试试'],
    ['en', 'View Details', 'Try in Session'],
  ]) {
    const rows = probeWidths(detail, tryLabel, [140, 180, 220, 260, 280, 296, 420])
    const compact = rows.filter((r) => r.cardWidth <= 280)
    const roomy = rows.filter((r) => r.cardWidth >= 296)

    assert.equal(compact.length > 0 && roomy.length > 0, true, `${locale}: 宽度分组必须同时覆盖紧凑与充足区间`)

    for (const row of compact) {
      for (const btn of row.buttons) {
        assert.equal(btn.display, 'none', `${locale} ${row.cardWidth}px: 紧凑区间文字标签必须退出布局`)
        assert.equal(btn.width, 34, `${locale} ${row.cardWidth}px: 紧凑区间按钮收缩为 34px 图标按钮`)
        assert.equal(btn.height, 34, `${locale} ${row.cardWidth}px: 紧凑区间按钮高度不变`)
        assert.equal(
          btn.iconCount >= 1,
          true,
          `${locale} ${row.cardWidth}px: 紧凑区间按钮必须保留图标，不得退化成无标识的空方块`,
        )
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

test('3:2营销精选卡：卡片自身宽度驱动快捷试用 CTA 退化，窄栏(<=288px)隐藏文字保留24px图标按钮与气泡提示，宽栏显示文字', () => {
  assert.ok(MARKET_CSS.includes('.omnimux-creatify-quick-try-btn'), '营销卡片试用按钮样式必须被完整提取')

  for (const [locale, tryTooltip, tryLabel] of [
    ['zh', '去对话试试', '去对话中试试'],
    ['en', 'Try in Chat', 'Try in Chat'],
  ]) {
    const rows = probeCreatifyWidths(tryTooltip, tryLabel, [140, 180, 220, 260, 280, 296, 420])
    const compact = rows.filter((r) => r.cardWidth <= 280)
    const roomy = rows.filter((r) => r.cardWidth >= 296)

    assert.equal(compact.length > 0 && roomy.length > 0, true, `${locale}: 宽度分组必须同时覆盖紧凑与充足区间`)

    for (const row of compact) {
      const btn = row.button
      assert.ok(btn, `${locale} ${row.cardWidth}px: 按钮必须存在`)
      assert.equal(btn.display, 'none', `${locale} ${row.cardWidth}px: 紧凑状态(<=288px)文字标签必须退出布局 (display: none)`)
      assert.equal(btn.width, 24, `${locale} ${row.cardWidth}px: 紧凑状态按钮收缩为 24px 图标按钮`)
      assert.equal(btn.height, 24, `${locale} ${row.cardWidth}px: 紧凑状态按钮高度为 24px`)
      assert.equal(btn.iconCount >= 1, true, `${locale} ${row.cardWidth}px: 紧凑状态按钮必须保留图标`)
      assert.equal(btn.title, tryTooltip, `${locale} ${row.cardWidth}px: 紧凑状态按钮必须保留气泡提示 title`)
      assert.equal(btn.ariaLabel, tryTooltip, `${locale} ${row.cardWidth}px: 紧凑状态按钮必须保留 aria-label`)
    }

    for (const row of roomy) {
      const btn = row.button
      assert.ok(btn, `${locale} ${row.cardWidth}px: 按钮必须存在`)
      assert.notEqual(btn.display, 'none', `${locale} ${row.cardWidth}px: 充足状态(>288px)必须显示文字标签`)
      assert.equal(btn.clipped, false, `${locale} ${row.cardWidth}px: 充足状态文字不得被裁切`)
      assert.equal(btn.iconCount >= 1, true, `${locale} ${row.cardWidth}px: 充足状态同时显示图标与文字`)
      assert.equal(btn.title, tryTooltip, `${locale} ${row.cardWidth}px: 充足状态按钮必须保留气泡提示 title`)
    }
  }
})

test('专家市场精选卡：退化由具名容器查询判定，且声明落在卡片根节点上', () => {
  assert.match(MARKET_CSS, /\.featured-card\{[^}]*container-type:inline-size/, '卡片根节点必须是 inline-size 容器')
  assert.match(MARKET_CSS, /container-name:market-featured-card/, '容器必须有唯一名字，避免误命中祖先容器')
  assert.match(MARKET_CSS, /@container market-featured-card \(max-width:288px\)/, '退化规则必须由具名容器查询判定')
  assert.match(MARKET_CSS, /\.omnimux-creatify-card\s*\{[^}]*container-type:\s*inline-size/, '3:2营销卡片根节点必须是 inline-size 容器')
  assert.match(MARKET_CSS, /\.omnimux-creatify-card\s*\{[^}]*container-name:\s*market-featured-card/, '3:2营销卡片容器必须声明 market-featured-card')
  assert.match(MARKET_CSS, /\.omnimux-creatify-quick-try-btn\s*\{[^}]*white-space:\s*nowrap/, '试用按钮文字不折行')
})

test('专家市场精选卡：文字标签由源码渲染，图标与无障碍名称随退化保留', () => {
  assert.match(cardSource, /className: 'hover-btn-label'/, '按钮文字必须包进可隐藏的标签元素')
  assert.match(cardSource, /renderHoverIcon\('detail'\)/, '详情按钮必须带图标，否则紧凑区间会退化成空方块')
  assert.match(cardSource, /renderHoverIcon\('try'\)/, '试用按钮必须带图标，否则紧凑区间会退化成空方块')
  assert.match(cardSource, /'aria-label': detailTitle/, '文字隐藏后无障碍名称必须由 aria-label 提供')
  assert.match(cardSource, /'aria-label': tryTitle/, '文字隐藏后无障碍名称必须由 aria-label 提供')
  assert.match(cardSource, /onClick: onOpenClick/)
  assert.match(cardSource, /onClick: onTryClick/)

  // 3:2 营销卡片专项断言
  assert.match(cardSource, /className: 'omnimux-creatify-quick-try-label'/, '营销卡片按钮文字必须包进 quick-try-label 元素')
  assert.match(cardSource, /title: tryTooltip/, '营销卡片试用按钮必须绑定 title 悬停气泡提示')
  assert.match(cardSource, /'aria-label': tryTooltip/, '营销卡片试用按钮必须绑定 aria-label')
  assert.match(cardSource, /'去对话试试'/, '中文环境悬停气泡文字必须为 去对话试试')
})
