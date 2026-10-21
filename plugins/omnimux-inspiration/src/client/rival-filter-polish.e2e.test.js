import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

/**
 * 端到端门禁：账号监控常驻账号列的末行可读性与提示条底色（#3171 / #3172 / #3432）。
 *
 * 这些承诺都是**布局**承诺——「四行不需要滚动就能看全」「冷却行昵称不被状态
 * 文字挤成省略号」「两栏列宽生效」「提示条有底色」——jsdom 不做布局，样式文本
 * 断言也证明不了。所以这里在真实无头 Chrome 里挂载真实的 `RivalAccountColumn`
 * （#3432 后账号维度从弹层改为常驻左栏，行组件 AccountFilterRow 不变），注入
 * 真实的两栏样式表，再测量盒子：
 *
 * 1. 两栏栅格生效：左栏 248px，右侧内容列在它旁边；
 * 2. 列表规则确实生效（max-height 是像素值，不是 none）；
 * 3. 列表的 scrollHeight 不超过 clientHeight（末行没有被裁到滚动区外）；
 * 4. 四行全部落在列表可视区内；
 * 5. 冷却行昵称的 scrollWidth 不超过 clientWidth（没有被省略号截断）；
 * 6. 提示条的 background-color 不是透明的——而**反向对照**（故意引用一个
 *    未定义令牌的元素）必须是透明的，否则这条断言什么也证明不了。
 *
 * 两条防止「装置自证」的纪律：夹具必须先注入样式表（否则无样式也能满足 3、4，
 * 断言等于没测）；令牌清单里刻意**不定义** `--dsw-alias-bg-tertiary`——组件库
 * 与宿主都没有它，在夹具里补上会把「引用了未定义令牌」这类缺陷掩盖掉。
 */

const CHROME_PATH = process.env.OMNIMUX_QA_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const HAS_CHROME = existsSync(CHROME_PATH)
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../../..')
const shimEntry = join(here, '../../tests/fixtures', 'ui-kit-shim.mjs')

/** 与组件库令牌表一致的浅色令牌；不含 --dsw-alias-bg-tertiary。 */
const TOKENS = `
  --dsw-alias-bg-base: #ffffff; --dsw-alias-bg-elevated: #ffffff;
  --dsw-alias-bg-layer-1: #f7f7f8; --dsw-alias-bg-layer-2: #f0f1f3;
  --dsw-alias-bg-mask-1: rgba(0,0,0,0.12); --dsw-alias-bg-module-platform: #e8eaed;
  --dsw-alias-label-primary: #111827; --dsw-alias-label-secondary: #4b5563;
  --dsw-alias-label-tertiary: #667085; --dsw-alias-label-primary-foreground: #ffffff;
  --dsw-alias-border-l1: #dddddd; --dsw-alias-border-l2: #cccccc; --dsw-alias-border-l3: #b8b8b8;
  --dsw-alias-border-l4: #a3a3a3; --dsw-alias-interactive-bg-hover: #f0f1f3;
  --dsw-alias-state-error-primary: #dc2626; --dsw-alias-state-warn-primary: #d97706;
  --dsw-alias-state-warn-bg: rgba(217,119,6,0.16); --dsw-alias-state-error-text: #dc2626;
  --dsw-alias-button-primary-fill: #111827; --dsw-alias-button-primary-hover: #374151;
  --dsw-alias-button-ghost-active-fill: rgba(103,87,231,0.14);
  --dsw-alias-button-ghost-active-border: rgba(103,87,231,0.5);
  --dsw-alias-button-ghost-active-hover: rgba(103,87,231,0.2);
`

function probePageHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>pending</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { ${TOKENS} font-family: -apple-system, "PingFang SC", sans-serif; background: #ffffff; padding: 24px; }
  /* 宿主必须给足高度：账号监控页自带滚动容器，宿主过矮会把左栏下沿裁掉，
     那是夹具失真，不是产品布局。 */
  #root { width: 720px; height: 860px; }
  .omx-stage-scroll { width: 720px; height: 600px; overflow-y: auto; overflow-x: hidden; position: relative; }
  .omx-stage-sticky { position: sticky; top: 0; height: 48px; background: #ffffff; z-index: 20; }
</style>
</head>
<body>
<div id="root"><div class="omx-stage-scroll" id="scroll"><div class="omx-stage-sticky" id="sticky"></div><div id="stage-root"></div></div></div>
<script>
  window.__probeErrors = []
  window.addEventListener('error', (e) => window.__probeErrors.push(String(e.message || e.error)))
</script>
<script src="./stage.js"></script>
<script>
  (function () {
    var tries = 0
    function finish(payload) { document.title = 'RESULT:' + JSON.stringify(payload) }
    function measure() {
      var layout = document.querySelector('.omnimux-rival-layout')
      var column = document.querySelector('.omnimux-rival-accounts')
      var list = document.querySelector('.omnimux-rival-accounts-list')
      var rows = Array.prototype.slice.call(document.querySelectorAll('.omnimux-rival-accounts-list .omnimux-rival-filter-row'))
      if (!layout || !column || !list || rows.length === 0) {
        if (++tries > 80) return finish({ error: 'column-not-mounted', errors: window.__probeErrors })
        return setTimeout(measure, 50)
      }
      var layoutRect = layout.getBoundingClientRect()
      var columnRect = column.getBoundingClientRect()
      var listRect = list.getBoundingClientRect()
      // 探针挂在被测容器内：插件样式表注入在 document.head，选择器是全局的，
      // 但贴着被测容器放最接近真实位置。
      var probe = document.createElement('div'); probe.className = 'omnimux-rival-notice'
      var echo = document.createElement('div'); echo.className = 'omnimux-rival-import-echo'
      var control = document.createElement('div')
      control.setAttribute('style', 'background: var(--dsw-alias-bg-tertiary)')
      column.appendChild(probe); column.appendChild(echo); column.appendChild(control)
      var cs = function (el) { return getComputedStyle(el) }
      var result = {
        styleSheetInjected: !!document.getElementById('omnimux-rival-accounts-styles'),
        layoutWidth: layoutRect.width,
        columnWidth: columnRect.width,
        contentPresent: !!layout.querySelector('.omnimux-rival-content'),
        columnMaxHeight: cs(column).maxHeight,
        columnPosition: cs(column).position,
        columnTop: cs(column).top,
        viewportHeight: window.innerHeight,
        listDisplay: cs(list).display,
        probePadding: cs(probe).padding,
        layer2Resolved: cs(probe).getPropertyValue('--dsw-alias-bg-layer-2').trim(),
        listScrollHeight: list.scrollHeight,
        listClientHeight: list.clientHeight,
        listTop: listRect.top,
        listBottom: listRect.bottom,
        noticeBackground: cs(probe).backgroundColor,
        echoBackground: cs(echo).backgroundColor,
        undefinedTokenControl: cs(control).backgroundColor,
        rows: rows.map(function (row) {
          var name = row.querySelector('.omnimux-rival-filter-name')
          var box = row.getBoundingClientRect()
          return {
            id: row.getAttribute('data-account-id'),
            health: row.getAttribute('data-health'),
            rowHeight: box.height,
            insideList: box.top >= listRect.top - 1 && box.bottom <= listRect.bottom + 1,
            nameText: name.textContent,
            nameRowHeight: row.querySelector('.omnimux-rival-filter-name-row')?.getBoundingClientRect().height || 0,
            nameRowWrap: getComputedStyle(row.querySelector('.omnimux-rival-filter-name-row')).flexWrap,
            statusRightGap: (() => {
              const status = row.querySelector('.omnimux-rival-filter-actions')
              return status ? Math.round(box.right - status.getBoundingClientRect().right) : null
            })(),
            nameWhiteSpace: getComputedStyle(name).whiteSpace,
            nameScrollWidth: name.scrollWidth,
            nameClientWidth: name.clientWidth,
            nameWidth: name.getBoundingClientRect().width,
          }
        }),
        errors: window.__probeErrors,
      }
      probe.remove(); echo.remove(); control.remove()
      var scroll = document.getElementById('scroll')
      scroll.style.display = 'none'
      window.__setActive(false)
      scroll.style.height = '400px'
      setTimeout(function () {
        scroll.style.display = ''
        window.__setActive(true)
        setTimeout(function () {
          var col = document.querySelector('.omnimux-rival-accounts')
          var list2 = document.querySelector('.omnimux-rival-accounts-list')
          var scrollRect = scroll.getBoundingClientRect()
          var colRect = col.getBoundingClientRect()
          result.reshown = {
            scrollHeightVar: col.style.getPropertyValue('--omnimux-rival-scroll-h').trim(),
            columnBottom: Math.round(colRect.bottom),
            scrollportBottom: Math.round(scrollRect.bottom),
            listClientHeight: list2.clientHeight,
            columnTop: Math.round(colRect.top),
          }
          finish(result)
        }, 200)
      }, 120)
    }
    measure()
  })()
</script>
</body></html>`
}

const ACCOUNTS = [
  {
    id: 'ra_ok', nickname: '喵星日常', handle: '@meow_daily', platform: 'tiktok',
    refresh_state: 'idle', error_code: null, consecutive_failures: 0, post_count: 3,
  },
  {
    id: 'ra_cool', nickname: 'Jeff | Chinese AI Gateway · 中文模型网关（超长昵称）', handle: '@chineseapi_gateway_official', platform: 'tiktok',
    refresh_state: 'backoff', error_code: 'cloud-error', consecutive_failures: 1,
    next_auto_refresh_at: new Date(Date.now() + 42 * 60_000).toISOString(), post_count: 1,
  },
  {
    id: 'ra_reimport', nickname: '科技小辛', handle: '@tech_xin', platform: 'youtube',
    refresh_state: 'error', error_code: 'identity-unverified', consecutive_failures: 1, post_count: 0,
  },
  {
    id: 'ra_stopped', nickname: '穿搭研究所', handle: '@ootd_lab', platform: 'instagram',
    refresh_state: 'error', error_code: 'cloud-error', consecutive_failures: 3,
    next_auto_refresh_at: null, post_count: 1,
  },
]

async function runProbe() {
  if (!HAS_CHROME) return { skipped: true, reason: `chrome not found at ${CHROME_PATH}` }
  const dir = mkdtempSync(join(tmpdir(), 'e2e-rival-column-'))
  try {
    const entry = join(dir, 'entry.jsx')
    writeFileSync(entry, `
      import { createRoot } from 'react-dom/client'
      import { RivalAccountColumn } from ${JSON.stringify(join(here, 'RivalAccountColumn.jsx'))}
      import { injectRivalStyles } from ${JSON.stringify(join(here, 'rival-styles.js'))}
      import { zh } from ${JSON.stringify(join(here, 'locales.js'))}
      // 真实挂载路径由 RivalAccountsPanel 注入样式表；这里只挂账号列，
      // 所以必须显式走同一个注入入口，否则测的是「没有样式的 DOM」。
      injectRivalStyles()
      const t = (key) => zh[key] ?? key
      const accounts = ${JSON.stringify(ACCOUNTS)}
      const allIds = accounts.map((account) => account.id)
      const root = createRoot(document.getElementById('stage-root'))
      const render = (active) => root.render(
        <div className="omnimux-rival-layout">
          <RivalAccountColumn
            t={t}
            accounts={accounts}
            selection={{ mode: 'all' }}
            allIds={allIds}
            onSelect={() => {}}
            onReset={() => {}}
            onRemove={async () => ({ ok: true })}
            onRetry={() => {}}
            quotaLeft={46}
            active={active}
          />
          <div className="omnimux-rival-content" />
        </div>
      )
      window.__setActive = render
      render(true)
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
      plugins: [{
        name: 'ui-kit-shim',
        setup(build) {
          build.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: shimEntry }))
        },
      }],
      loader: { '.jsx': 'jsx', '.js': 'jsx', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty', '.eot': 'empty' },
      define: { 'process.env.NODE_ENV': '"production"' },
      absWorkingDir: repoRoot,
      nodePaths: [join(repoRoot, 'node_modules')],
      logLevel: 'warning',
    })
    const page = join(dir, 'index.html')
    writeFileSync(page, probePageHtml())
    const out = spawnSync(CHROME_PATH, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--window-size=1200,1000', '--virtual-time-budget=8000', '--dump-dom', `file://${page}`,
    ], { encoding: 'utf8', timeout: 120000 })
    const stdout = out.stdout ?? ''
    const match = /<title>RESULT:(.*?)<\/title>/s.exec(stdout)
    assert.ok(match, `页面未回传测量结果: ${stdout.slice(0, 400)}`)
    const result = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    assert.ok(!result.error, `夹具未渲染完成: ${result.error} ${JSON.stringify(result.errors ?? [])}`)
    return result
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const probe = await runProbe()

// A layout promise needs a layout engine. Without a real Chrome the probe has
// nothing to measure, so the file registers no test — it never turns a missing
// browser into a passing tautology and never records a skipped test.
if (probe.skipped !== true) {
  test('样式表真的注入到夹具里，两栏布局断言才有意义', () => {
    assert.equal(probe.styleSheetInjected, true)
    assert.equal(probe.listDisplay, 'flex')
    assert.equal(probe.contentPresent, true)
    assert.equal(Math.round(probe.columnWidth), 248, `左栏必须是两栏栅格里的 248px 列（实际 ${probe.columnWidth}）`)
    assert.equal(Math.round(probe.layoutWidth), 720, `两栏布局必须撑满宿主宽度（实际 ${probe.layoutWidth}）`)
    assert.ok(
      probe.columnMaxHeight !== 'none' && parseFloat(probe.columnMaxHeight) > 0,
      `账号列必须有像素级 max-height，而不是 none: ${probe.columnMaxHeight}`,
    )
  })

  test('账号列吸附在一级 Tab 栏下方（#3448）', () => {
    assert.equal(probe.columnPosition, 'sticky')
    assert.equal(probe.columnTop, '60px', `吸顶偏移必须留出实测 48px Tab 栏 + 12px 间距（实际 ${probe.columnTop}）`)
    assert.equal(
      Math.round(parseFloat(probe.columnMaxHeight)),
      600 - 48 - 24,
      `max-height 必须按真实 scrollport 扣掉 Tab 栏高度（实际 ${probe.columnMaxHeight}）`,
    )
    assert.ok(probe.reshown, '隐藏/缩放/再显示场景必须回传测量')
    assert.equal(probe.reshown.scrollHeightVar, '400px', '切回该 tab 后必须重新测量 scrollport')
    assert.ok(
      probe.reshown.columnBottom <= probe.reshown.scrollportBottom,
      `重新显示后列底必须落在 scrollport 内: bottom=${probe.reshown.columnBottom} scrollport=${probe.reshown.scrollportBottom}`,
    )
    assert.ok(probe.reshown.columnTop >= 60, '重新显示后仍需留在 48px 头部下方')
  })

  test('常驻账号列的四行不需要滚动就能看全', () => {
    assert.equal(probe.rows.length, 4)
    assert.ok(
      probe.listScrollHeight <= probe.listClientHeight + 1,
      `列表内容超出可视高度，末行会被裁到滚动区外: scrollHeight=${probe.listScrollHeight} clientHeight=${probe.listClientHeight}`,
    )
    const outside = probe.rows.filter((row) => row.insideList !== true).map((row) => row.id)
    assert.deepEqual(outside, [], `这些行落在列表可视区外: ${outside.join(', ')}`)
  })

  test('长昵称行不换行：行高一致，超长昵称省略（#3446）', () => {
    const cooling = probe.rows.find((row) => row.id === 'ra_cool')
    const normal = probe.rows.find((row) => row.id === 'ra_ok')
    assert.ok(cooling, '冷却行未渲染')
    assert.ok(normal, '普通行未渲染')
    assert.equal(cooling.health, 'cooling')
    // Every row keeps the same one-line height; the long name truncates instead
    // of pushing the platform/warning icons onto a second line.
    // 不换行由布局契约保证：昵称行 nowrap、昵称单行省略，且昵称行始终只有一行高。
    assert.ok(probe.rows.every((row) => row.nameRowWrap === 'nowrap'), '昵称行必须禁止换行')
    assert.ok(probe.rows.every((row) => row.nameWhiteSpace === 'nowrap'), '昵称必须保持单行')
    const heights = probe.rows.map((row) => Math.round(row.nameRowHeight))
    assert.ok(heights.every((height) => height <= 28), `昵称行出现了第二行: ${heights.join(', ')}`)
    const truncated = probe.rows.filter((row) => row.nameScrollWidth > row.nameClientWidth + 1)
    assert.ok(truncated.length > 0, '夹具里的长昵称应被省略号截断，而不是换行')
    const pinned = probe.rows.filter((row) => row.statusRightGap !== null)
    assert.ok(pinned.length >= 3, '至少三种异常行必须渲染右侧状态组')
    assert.deepEqual(
      pinned.filter((row) => row.statusRightGap > 8).map((row) => row.id),
      [],
      '异常行的警告/重试状态组必须固定在行最右侧',
    )
    assert.ok(cooling.nameWidth >= 40, `冷却行昵称被压得过窄: ${cooling.nameWidth}`)
  })

  test('提示条底色取自组件库已定义的令牌，未定义令牌的反向对照是透明的', () => {
    // 先确认探针真的命中了规则，否则「透明」可能只是选择器没匹配上。
    assert.equal(probe.probePadding, '8px 10px')
    assert.equal(probe.layer2Resolved, '#f0f1f3')
    // 反向对照：没有它，「有底色」可能只是夹具恰好定义了那个令牌。
    assert.equal(probe.undefinedTokenControl, 'rgba(0, 0, 0, 0)')
    assert.notEqual(probe.noticeBackground, 'rgba(0, 0, 0, 0)', `提示条没有底色: ${probe.noticeBackground}`)
    assert.notEqual(probe.echoBackground, 'rgba(0, 0, 0, 0)', `导入回显条没有底色: ${probe.echoBackground}`)
    assert.equal(probe.noticeBackground, probe.echoBackground)
  })
}
