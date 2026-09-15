import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PRODUCTS_CSS } from '../../../omnimux-products/src/client/styles.js'
import { ASSETS_CSS } from '../../../omnimux-assets/src/client/styles.js'
import { ANALYTICS_CSS } from '../../../omnimux-analytics/src/client/styles.js'
import { PRODUCT_STAGE_CHROME } from './conversation-box.js'
import { HUB_CSS } from './styles.js'

const marketCssRaw = readFileSync(join(import.meta.dirname, '../../../omnimux-market/src/client/css.js'), 'utf8')
const cssMatch = /const CSS = `([\s\S]*?)`;/.exec(marketCssRaw)
const MARKET_CSS = cssMatch ? cssMatch[1] : marketCssRaw

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

function runDomProbe(html, measureFn) {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-tabs-dividers-'))
  try {
    const pageHtml = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>pending</title>
<style>* { box-sizing: border-box; margin: 0; padding: 0; } body { width: 1600px; background: #111; color: #fff; }</style>
<style>${HUB_CSS}</style>
<style>${PRODUCT_STAGE_CHROME}</style>
<style>${PRODUCTS_CSS}</style>
<style>${ASSETS_CSS}</style>
<style>${MARKET_CSS}</style>
<style>${ANALYTICS_CSS}</style>
</head><body>${html}
<script>
document.title = 'RESULT:' + JSON.stringify((${measureFn.toString()})());
</script></body></html>`
    const page = join(dir, 'probe.html')
    writeFileSync(page, pageHtml)
    const out = spawnSync(CHROME_PATH, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--window-size=1600,800', '--virtual-time-budget=1500', '--dump-dom', `file://${page}`,
    ], { encoding: 'utf8', timeout: 30000 })
    const stdout = out.stdout ?? ''
    const match = /<title>RESULT:(.*?)<\/title>/s.exec(stdout)
    assert.ok(match, `页面未回传测量结果: ${stdout.slice(0, 300)}`)
    return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('产品库分割线两侧留白 20px 对齐内容与工具栏', () => {
  const productsHtml = `
<div class="omnimux-products-stage" style="width:1200px">
  <div class="omnimux-products-list-view">
    <div class="omnimux-products-action-row" style="padding: 8px 20px 12px;"><button>添加产品</button></div>
    <div role="separator" aria-orientation="horizontal" class="dshUk-Divider-divider dshUk-Divider-horizontal" style="height:1px;background:#333;"></div>
    <div class="omnimux-products-stage-toolbar" style="padding: 0 20px;"><span>筛选</span></div>
  </div>
</div>`
  const res = runDomProbe(productsHtml, () => {
    const d = document.querySelector('.omnimux-products-stage [role="separator"]');
    const stage = document.querySelector('.omnimux-products-stage');
    const sR = stage.getBoundingClientRect();
    const dR = d.getBoundingClientRect();
    return {
      marginLeft: getComputedStyle(d).marginLeft,
      marginRight: getComputedStyle(d).marginRight,
      leftGap: Math.round(dR.left - sR.left),
      rightGap: Math.round(sR.right - dR.right),
    };
  });
  assert.equal(res.marginLeft, '20px');
  assert.equal(res.marginRight, '20px');
  assert.equal(res.leftGap, 20);
  assert.equal(res.rightGap, 20);
})

test('资产库两层标签纵向净空保持舒适透气（12~16px）', () => {
  const assetsHtml = `
<div class="omnimux-assets-stage" style="width:1200px">
  <div class="omnimux-assets-stage-toolbar" style="height:48px;padding:0 24px;display:flex;align-items:center;">
    <div class="dshUk-Tabs-tabs" role="tablist" style="height:44px;">
      <button role="tab" aria-selected="true" class="dshUk-Tabs-tab active" style="height:44px;position:relative;">本地</button>
    </div>
  </div>
  <div class="omnimux-assets-local-nav">
    <div class="omnimux-assets-local-nav-row">
      <button class="omnimux-assets-cloud-chip" aria-pressed="true" style="height:28px;">全部 3</button>
    </div>
  </div>
</div>`
  const res = runDomProbe(assetsHtml, () => {
    const tab = document.querySelector('.omnimux-assets-stage-toolbar [role="tab"]');
    const chip = document.querySelector('.omnimux-assets-cloud-chip');
    const nav = document.querySelector('.omnimux-assets-local-nav');
    const tR = tab.getBoundingClientRect();
    const cR = chip.getBoundingClientRect();
    return {
      paddingTop: getComputedStyle(nav).paddingTop,
      gap: Math.round(cR.top - tR.bottom),
    };
  });
  assert.equal(res.paddingTop, '12px');
  assert.ok(res.gap >= 12 && res.gap <= 16);
})

test('技能市场复用共享全圆角胶囊Tab且两层间距收紧', () => {
  const marketHtml = `
<div class="sh-mkt" style="width:1200px">
  <div class="nav-bar">
    <div class="nav-tabs">
      <button class="nav-tab active" style="height:36px;">Skill</button>
    </div>
  </div>
  <div class="category-bar">
    <button class="cat-btn active">全部</button>
    <button class="cat-btn">选品</button>
  </div>
</div>`
  const res = runDomProbe(marketHtml, () => {
    const tab = document.querySelector('.nav-tab.active');
    const cat = document.querySelector('.cat-btn.active');
    const navBar = document.querySelector('.nav-bar');
    const tR = tab.getBoundingClientRect();
    const cR = cat.getBoundingClientRect();
    return {
      borderRadius: getComputedStyle(cat).borderRadius,
      height: getComputedStyle(cat).height,
      navBarMarginBottom: getComputedStyle(navBar).marginBottom,
      gap: Math.round(cR.top - tR.bottom),
    };
  });
  assert.equal(res.borderRadius, '999px');
  assert.equal(res.height, '28px');
  assert.ok(res.gap >= 12 && res.gap <= 16);
})

test('数据分析看板移除下方重复分割线', () => {
  const analyticsHtml = `
<div class="omnimux-analytics-stage" style="width:1200px">
  <div class="omnimux-analytics-stage-filter">
    <span>Filter Controls</span>
  </div>
</div>`
  const res = runDomProbe(analyticsHtml, () => {
    const f = document.querySelector('.omnimux-analytics-stage-filter');
    return {
      borderBottomWidth: getComputedStyle(f).borderBottomWidth,
      borderBottomStyle: getComputedStyle(f).borderBottomStyle,
    };
  });
  assert.equal(res.borderBottomWidth, '0px');
  assert.equal(res.borderBottomStyle, 'none');
})
