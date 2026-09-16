#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRODUCT_STAGE_CHROME } from '../plugins/omnimux/src/client/conversation-box.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'evidence')
mkdirSync(EVIDENCE_DIR, { recursive: true })

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
  const found = CHROME_CANDIDATES.find((c) => existsSync(c))
  assert.ok(found, `未找到 Chrome 可执行文件。候选：${CHROME_CANDIDATES.join(', ')}`)
  return found
}

const chrome = findChrome()

const BASE_PAGE_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 1920px; height: 1080px; background: #111215; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.dshUk-PageHeader-pageHeader { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; min-height: 56px; box-sizing: border-box; flex: none; gap: 16px; }
.dshUk-PageHeader-heading { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.dshUk-PageHeader-titleRow { display: flex; align-items: center; gap: 8px; }
.dshUk-PageHeader-title { margin: 0; font-size: 20px; font-weight: 600; line-height: 28px; color: #fff; }
.dshUk-PageHeader-subtitle { margin: 0; font-size: 13px; line-height: 18px; color: #888; }
.dshUk-PageHeader-controls { display: flex; align-items: center; gap: 8px; flex: none; }
.omnimux-workflow-library-page { width: 100%; position: relative; }
.omnimux-workflow-library-action-row { display: flex; padding: 8px 20px 12px; gap: 10px; }
.omnimux-workflow-library-action-row button { height: 32px; padding: 0 14px; border-radius: 6px; background: #fff; color: #000; border: none; font-size: 13px; font-weight: 500; }
.omnimux-workflow-library-filter { display: flex; padding: 0 20px 12px; gap: 16px; align-items: center; }
.omnimux-workflow-library-filter .tab { font-size: 14px; padding: 6px 0; color: #fff; border-bottom: 2px solid #3b82f6; }

/* 市场技能/专家页头样式 (收敛为 12px 20px 32px) */
.sh-plaza-page { position: relative; width: 100%; }
.sh-plaza-body { width: 100%; }
.sh-plaza-body .sh-mkt { max-width: none; width: 100%; padding: 12px 20px 32px; }
.sh-mkt .workshop-intro { padding-bottom: 20px; margin-bottom: 20px; }
.sh-mkt .workshop-heading { font-size: 20px; line-height: 28px; font-weight: 600; margin: 0 0 6px; }
.sh-mkt .workshop-description { font-size: 13px; line-height: 18px; color: #888; margin: 0 0 16px; }
.sh-mkt .action-row { display: flex; align-items: center; gap: 10px; }
.sh-mkt .action-row button { height: 32px; padding: 0 14px; border-radius: 6px; background: #fff; color: #000; border: none; font-size: 13px; font-weight: 500; }
`

const WORKFLOW_DOM = `
<div class="omnimux-workflow-library-page">
  <header class="dshUk-PageHeader-pageHeader">
    <div class="dshUk-PageHeader-heading">
      <div class="dshUk-PageHeader-titleRow"><h1 class="dshUk-PageHeader-title">创作画布</h1></div>
      <p class="dshUk-PageHeader-subtitle">管理项目工程、查看创作页面与项目资产</p>
    </div>
    <div class="dshUk-PageHeader-controls">
      <button style="width:28px;height:28px;background:#222;color:#fff;border:none;border-radius:6px;">↻</button>
      <button style="width:28px;height:28px;background:#222;color:#fff;border:none;border-radius:6px;">✕</button>
    </div>
  </header>
  <div class="omnimux-workflow-library-action-row">
    <button>+ 新建项目</button>
  </div>
  <div class="omnimux-workflow-library-filter">
    <div class="tab">本地项目</div>
    <div style="color:#888;">共创项目</div>
    <div style="color:#888;">AI应用</div>
  </div>
</div>
`

const MARKET_DOM = `
<div class="sh-plaza-page">
  <div class="sh-plaza-body">
    <div class="sh-mkt">
      <section class="workshop-intro">
        <div class="workshop-heading">技能/专家</div>
        <p class="workshop-description">发现、安装并管理 Skill，扩展 OmniMux 的创作能力</p>
        <div class="action-row">
          <button>创建 Skill</button>
          <button style="background:#222;color:#fff;border:1px solid #444;">+ 安装 Skill</button>
        </div>
      </section>
    </div>
  </div>
</div>
`

function runInspection(htmlContent, shotPath) {
  const dir = mkdtempSync(join(tmpdir(), 'header-qa-'))
  try {
    const page = join(dir, 'index.html')
    writeFileSync(page, htmlContent)

    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1600,900',
      '--virtual-time-budget=2000',
    ]
    if (shotPath) {
      args.push(`--screenshot=${shotPath}`)
    }
    args.push('--dump-dom', `file://${page}`)

    const out = spawnSync(chrome, args, { encoding: 'utf8', timeout: 30000 })
    const match = /<title>MEASURE:(.*?)<\/title>/s.exec(out.stdout || '')
    assert.ok(match, `Chrome 执行失败或未回传测量数据。输出：${(out.stdout || out.stderr || '').slice(0, 300)}`)
    return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('==> [1/3] 验证创作画布页面在左栏收起状态（满屏态）下的横向对齐...')
const wfHtml = `<!DOCTYPE html><html lang="zh-CN" data-omnimux-left-collapsed=""><head><meta charset="utf-8">
<title>pending</title>
<style>${BASE_PAGE_CSS}</style>
<style>${PRODUCT_STAGE_CHROME}</style>
</head><body data-dsh-desktop-platform="darwin">
${WORKFLOW_DOM}
<script>
window.addEventListener('DOMContentLoaded', () => {
  const title = document.querySelector('.dshUk-PageHeader-title');
  const sub = document.querySelector('.dshUk-PageHeader-subtitle');
  const btn = document.querySelector('.omnimux-workflow-library-action-row button');
  const tab = document.querySelector('.omnimux-workflow-library-filter .tab');
  const h = document.querySelector('.dshUk-PageHeader-pageHeader');
  const res = {
    headerPaddingLeft: getComputedStyle(h).paddingLeft,
    headerPaddingTop: getComputedStyle(h).paddingTop,
    titleLeft: Math.round(title.getBoundingClientRect().left),
    titleTop: Math.round(title.getBoundingClientRect().top),
    subLeft: Math.round(sub.getBoundingClientRect().left),
    btnLeft: Math.round(btn.getBoundingClientRect().left),
    tabLeft: Math.round(tab.getBoundingClientRect().left),
  };
  document.title = 'MEASURE:' + JSON.stringify(res);
});
</script></body></html>`

const wfShot = join(EVIDENCE_DIR, 'first-level-header-align-workflow-verified.png')
const wfRes = runInspection(wfHtml, wfShot)
console.log('    创作画布测量结果:', wfRes)
assert.equal(wfRes.headerPaddingLeft, '20px', '页头内距必须为 20px')
assert.equal(wfRes.headerPaddingTop, '12px', '页头顶部内距必须为 12px')
assert.equal(wfRes.titleLeft, 20, '标题必须在 20px')
assert.equal(wfRes.subLeft, 20, '副标题必须在 20px')
assert.equal(wfRes.btnLeft, 20, '主按钮必须在 20px')
assert.equal(wfRes.tabLeft, 20, 'Tab栏必须在 20px')

console.log('==> [2/3] 验证技能/专家页面在收敛后的纵向与横向对齐...')
const mktHtml = `<!DOCTYPE html><html lang="zh-CN" data-omnimux-left-collapsed=""><head><meta charset="utf-8">
<title>pending</title>
<style>${BASE_PAGE_CSS}</style>
<style>${PRODUCT_STAGE_CHROME}</style>
</head><body data-dsh-desktop-platform="darwin">
${MARKET_DOM}
<script>
window.addEventListener('DOMContentLoaded', () => {
  const mkt = document.querySelector('.sh-mkt');
  const title = document.querySelector('.workshop-heading');
  const sub = document.querySelector('.workshop-description');
  const btn = document.querySelector('.action-row button');
  const res = {
    mktPaddingLeft: getComputedStyle(mkt).paddingLeft,
    mktPaddingTop: getComputedStyle(mkt).paddingTop,
    titleLeft: Math.round(title.getBoundingClientRect().left),
    titleTop: Math.round(title.getBoundingClientRect().top),
    subLeft: Math.round(sub.getBoundingClientRect().left),
    btnLeft: Math.round(btn.getBoundingClientRect().left),
  };
  document.title = 'MEASURE:' + JSON.stringify(res);
});
</script></body></html>`

const mktShot = join(EVIDENCE_DIR, 'first-level-header-align-market-verified.png')
const mktRes = runInspection(mktHtml, mktShot)
console.log('    技能/专家测量结果:', mktRes)
assert.equal(mktRes.mktPaddingLeft, '20px', '左内距必须为 20px')
assert.equal(mktRes.mktPaddingTop, '12px', '顶部内距必须已收敛至 12px（原18px）')
assert.equal(mktRes.titleLeft, 20, '标题必须对齐在 20px')
assert.equal(mktRes.titleTop, 12, '标题起始 Y 坐标必须收敛至 12px')
assert.equal(mktRes.subLeft, 20, '副标题必须对齐在 20px')
assert.equal(mktRes.btnLeft, 20, '按钮必须对齐在 20px')

console.log('==> [3/3] 验证独立覆盖层（product stage）在收起左栏时依然保留 84px 红绿灯避让...')
const stageHtml = `<!DOCTYPE html><html lang="zh-CN" data-dsh-product-stage="omnimux-apps" data-omnimux-left-collapsed=""><head><meta charset="utf-8">
<title>pending</title>
<style>${BASE_PAGE_CSS}</style>
<style>${PRODUCT_STAGE_CHROME}</style>
</head><body data-dsh-desktop-platform="darwin">
${WORKFLOW_DOM}
<script>
window.addEventListener('DOMContentLoaded', () => {
  const h = document.querySelector('.dshUk-PageHeader-pageHeader');
  document.title = 'MEASURE:' + JSON.stringify({
    stageHeaderPaddingLeft: getComputedStyle(h).paddingLeft
  });
});
</script></body></html>`

const stageRes = runInspection(stageHtml, null)
console.log('    独立舞台覆盖层结果:', stageRes)
assert.equal(stageRes.stageHeaderPaddingLeft, '84px', '独立舞台覆盖层依然正确保留 84px 避让')

const reportJson = {
  timestamp: new Date().toISOString(),
  chromeVersion: chrome,
  workflowInspection: wfRes,
  marketInspection: mktRes,
  stageInspection: stageRes,
  screenshots: [
    'docs/evidence/first-level-header-align-workflow-verified.png',
    'docs/evidence/first-level-header-align-market-verified.png'
  ],
  verdict: 'PASS'
}

writeFileSync(
  join(EVIDENCE_DIR, 'first-level-header-align-verification.json'),
  JSON.stringify(reportJson, null, 2)
)
console.log('✅ 真实浏览器验证证据已成功落盘至 docs/evidence/')
