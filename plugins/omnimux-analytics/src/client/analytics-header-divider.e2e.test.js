import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../../..')

/** Stylesheet imports carry no element order; resolve them to an empty module. */
const cssStubPlugin = {
  name: 'analytics-header-divider-css-stub',
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: 'css-stub' }))
    build.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => ({ contents: 'module.exports = {}', loader: 'js' }))
  },
}

function probePageHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>pending</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; }
  body { font-family: -apple-system, "PingFang SC", sans-serif;
    --dsw-alias-bg-base: #ffffff; --dsw-alias-bg-l1: #f7f7f8; --dsw-alias-bg-layer-1: #f7f7f8;
    --dsw-alias-bg-layer-2: #f0f1f3; --dsw-alias-bg-elevated: #ffffff;
    --dsw-alias-label-primary: #111827; --dsw-alias-label-secondary: #4b5563;
    --dsw-alias-label-tertiary: #667085; --dsw-alias-border-l1: #dddddd; --dsw-alias-border-l2: #cccccc;
    --dsw-alias-brand-primary: #2563eb; background: #ffffff; }
  #root { width: 1280px; height: 800px; }
</style>
</head>
<body>
<div id="root"></div>
<script>
  window.__probeErrors = []
  window.addEventListener('error', (e) => window.__probeErrors.push(String(e.message || e.error)))
</script>
<script src="./stage.js"></script>
<script>
  (function () {
    var tries = 0
    function finish(payload) { document.title = 'RESULT:' + JSON.stringify(payload) }
    function tick() {
      var stage = document.querySelector('.omnimux-analytics-stage')
      if (!stage) {
        if (++tries > 80) return finish({ error: 'stage-not-mounted', errors: window.__probeErrors })
        return setTimeout(tick, 50)
      }
      var header = stage.querySelector('header')
      var divider = stage.querySelector('[role="separator"]')
      var actionRow = stage.querySelector('.omnimux-analytics-stage-action-row')
      var filterBar = stage.querySelector('.omnimux-analytics-stage-filter')
      if (!header || !divider || !actionRow || !filterBar) {
        if (++tries > 80) return finish({ error: 'stage-children-missing', errors: window.__probeErrors })
        return setTimeout(tick, 50)
      }
      var box = function (el) { var r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height } }
      var stageBox = box(stage)
      var rowRect = actionRow.getBoundingClientRect()
      var filterRect = filterBar.getBoundingClientRect()
      finish({
        childOrder: Array.prototype.map.call(stage.children, function (el) { return el === divider ? 'SEPARATOR' : el.className }),
        separatorCount: stage.querySelectorAll('[role="separator"]').length,
        dividerFollowsHeader: header.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING ? true : false,
        dividerPrecedesActionRow: divider.compareDocumentPosition(actionRow) & Node.DOCUMENT_POSITION_FOLLOWING ? true : false,
        actionRowPrecedesFilterBar: rowRect.top < filterRect.top,
        header: box(header),
        divider: box(divider),
        actionRow: box(actionRow),
        filterBar: box(filterBar),
        stage: stageBox,
        filterBorderBottomWidth: getComputedStyle(filterBar).borderBottomWidth,
        filterBorderBottomStyle: getComputedStyle(filterBar).borderBottomStyle,
        errors: window.__probeErrors,
      })
    }
    tick()
  })()
</script>
</body></html>`
}

async function runStageProbe() {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-analytics-divider-'))
  try {
    const entry = join(dir, 'entry.jsx')
    writeFileSync(entry, `
      import { createRoot } from 'react-dom/client'
      import { AnalyticsStage } from ${JSON.stringify(join(here, 'AnalyticsStage.jsx'))}
      import { zh } from ${JSON.stringify(join(here, 'locales.js'))}
      const t = (key) => zh[key] ?? key
      createRoot(document.getElementById('root')).render(<AnalyticsStage t={t} visible />)
    `)
    const outfile = join(dir, 'stage.js')
    await esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: ['chrome120'],
      jsx: 'automatic',
      plugins: [cssStubPlugin],
      loader: { '.jsx': 'jsx', '.js': 'jsx', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty', '.eot': 'empty' },
      define: { 'process.env.NODE_ENV': '"production"' },
      absWorkingDir: repoRoot,
      // The probe page lives in the OS temp dir, which has no node_modules above it.
      nodePaths: [join(repoRoot, 'node_modules')],
      logLevel: 'warning',
    })
    const page = join(dir, 'index.html')
    writeFileSync(page, probePageHtml())
    const out = spawnSync(CHROME_PATH, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--window-size=1600,900', '--virtual-time-budget=8000', '--dump-dom', `file://${page}`,
    ], { encoding: 'utf8', timeout: 120000 })
    const stdout = out.stdout ?? ''
    const match = /<title>RESULT:(.*?)<\/title>/s.exec(stdout)
    assert.ok(match, `页面未回传测量结果: ${stdout.slice(0, 400)}`)
    const result = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    assert.ok(!result.error, `stage 夹具未渲染完成: ${result.error} ${JSON.stringify(result.errors ?? [])}`)
    return result
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const probe = await runStageProbe()

test('数据分析看板的分割线渲染在页头与标签行之间', () => {
  assert.equal(probe.separatorCount, 1)
  assert.equal(probe.dividerFollowsHeader, true)
  assert.equal(probe.dividerPrecedesActionRow, true)
  assert.ok(
    probe.divider.top < probe.actionRow.top,
    `分割线应在标签行上方: divider.top=${probe.divider.top} actionRow.top=${probe.actionRow.top}`,
  )
  // 页头 → 分割线 → 吸附栈（一级 Tab + 筛选行都在栈内，随整页滚动到顶后固定）。
  assert.deepEqual(probe.childOrder.slice(0, 3), [
    'dshUk-PageHeader-pageHeader',
    'SEPARATOR',
    'omx-stage-sticky',
  ])
})

test('标签行与筛选行之间不再有分割线，且筛选栏无底边框', () => {
  assert.equal(probe.actionRowPrecedesFilterBar, true)
  assert.equal(probe.actionRow.bottom <= probe.filterBar.top + 0.5, true)
  assert.equal(probe.filterBorderBottomWidth, '0px')
  assert.equal(probe.filterBorderBottomStyle, 'none')
})

test('分割线保持 1px 高、贯通 stage 全宽，两侧净空落在 8~28px 节奏内', () => {
  assert.equal(probe.divider.height, 1)
  assert.ok(Math.abs(probe.divider.width - probe.stage.width) < 1)
  assert.ok(Math.abs(probe.divider.left - probe.stage.left) < 1)
  const above = probe.divider.top - probe.header.bottom
  const below = probe.actionRow.top - probe.divider.bottom
  assert.ok(above > 0 && above <= 28, `分割线与页头净空 ${above}px 越界`)
  assert.ok(below >= 0 && below <= 28, `分割线与标签行净空 ${below}px 越界`)
  assert.deepEqual(probe.errors, [])
})
