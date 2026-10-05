import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

/**
 * 端到端门禁：账号筛选弹层的末行可读性与提示条底色（#3171 / #3172）。
 *
 * 这两个承诺都是**布局**承诺——「四行不需要滚动就能看全」「冷却行昵称不被
 * 状态文字挤成省略号」「提示条有底色」——jsdom 不做布局，样式文本断言也证明
 * 不了。所以这里在真实无头 Chrome 里挂载真实的 `RivalAccountFilter`、注入
 * 真实的样式表，再测量盒子：
 *
 * 1. 列表规则确实生效（max-height 是像素值，不是 none）；
 * 2. 列表的 scrollHeight 不超过 clientHeight（末行没有被裁到滚动区外）；
 * 3. 四行全部落在列表可视区内；
 * 4. 冷却行昵称的 scrollWidth 不超过 clientWidth（没有被省略号截断）；
 * 5. 提示条的 background-color 不是透明的——而**反向对照**（故意引用一个
 *    未定义令牌的元素）必须是透明的，否则这条断言什么也证明不了。
 *
 * 两条防止「装置自证」的纪律：夹具必须先注入样式表（否则无样式也能满足 2、3，
 * 断言等于没测）；令牌清单里刻意**不定义** `--dsw-alias-bg-tertiary`——组件库
 * 与宿主都没有它，在夹具里补上会把「引用了未定义令牌」这类缺陷掩盖掉。
 */

const CHROME_PATH = process.env.OMNIMUX_QA_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const HAS_CHROME = existsSync(CHROME_PATH)
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../../..')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')

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
  /* 宿主必须给足高度：账号监控页自带滚动容器，宿主过矮会把浮层下沿裁掉，
     那是夹具失真，不是产品布局。 */
  #root { width: 720px; height: 860px; }
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
    function measure() {
      var list = document.querySelector('.omnimux-rival-filter-list')
      var rows = Array.prototype.slice.call(document.querySelectorAll('.omnimux-rival-filter-row'))
      if (!list || rows.length === 0) {
        if (++tries > 80) return finish({ error: 'panel-not-open', errors: window.__probeErrors })
        return setTimeout(measure, 50)
      }
      var listRect = list.getBoundingClientRect()
      // 探针挂在挂载根内：插件样式表注入在 document.head，选择器是全局的，
      // 但贴着被测容器放最接近真实位置。
      var host = list.closest('.omnimux-rival-filter') || document.getElementById('root')
      var probe = document.createElement('div'); probe.className = 'omnimux-rival-notice'
      var echo = document.createElement('div'); echo.className = 'omnimux-rival-import-echo'
      var control = document.createElement('div')
      control.setAttribute('style', 'background: var(--dsw-alias-bg-tertiary)')
      host.appendChild(probe); host.appendChild(echo); host.appendChild(control)
      var cs = function (el) { return getComputedStyle(el) }
      var result = {
        styleSheetInjected: !!document.getElementById('omnimux-rival-accounts-styles'),
        listMaxHeight: cs(list).maxHeight,
        listDisplay: cs(list).display,
        probePadding: cs(probe).padding,
        layer2Resolved: cs(probe).getPropertyValue('--dsw-alias-bg-layer-2').trim(),
        listScrollHeight: list.scrollHeight,
        listClientHeight: list.clientHeight,
        listScrollTop: list.scrollTop,
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
            nameScrollWidth: name.scrollWidth,
            nameClientWidth: name.clientWidth,
            nameWidth: name.getBoundingClientRect().width,
          }
        }),
        errors: window.__probeErrors,
      }
      probe.remove(); echo.remove(); control.remove()
      finish(result)
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
    id: 'ra_cool', nickname: '毛孩子食堂', handle: '@fur_kitchen', platform: 'tiktok',
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
  const dir = mkdtempSync(join(tmpdir(), 'e2e-rival-filter-polish-'))
  try {
    const entry = join(dir, 'entry.jsx')
    writeFileSync(entry, `
      import { createRoot } from 'react-dom/client'
      import { RivalAccountFilter } from ${JSON.stringify(join(here, 'RivalAccountFilter.jsx'))}
      import { injectRivalStyles } from ${JSON.stringify(join(here, 'rival-styles.js'))}
      import { zh } from ${JSON.stringify(join(here, 'locales.js'))}
      // 真实挂载路径由 RivalAccountsPanel 注入样式表；这里只挂筛选组件，
      // 所以必须显式走同一个注入入口，否则测的是「没有样式的 DOM」。
      injectRivalStyles()
      const t = (key) => zh[key] ?? key
      const accounts = ${JSON.stringify(ACCOUNTS)}
      createRoot(document.getElementById('root')).render(
        <RivalAccountFilter
          t={t}
          accounts={accounts}
          selection={{ mode: 'all' }}
          onToggle={() => {}}
          onInvert={() => {}}
          onReset={() => {}}
          onRetry={() => {}}
          quotaLeft={46}
        />,
      )
      // 真实旅程的第一步：点开筛选浮层，测量只发生在打开之后。
      setTimeout(() => {
        const trigger = document.querySelector('.omnimux-rival-filter-trigger')
        if (trigger) trigger.click()
      }, 60)
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
const opts = { skip: probe.skipped === true }

test('样式表真的注入到夹具里，布局断言才有意义', opts, () => {
  assert.equal(probe.styleSheetInjected, true)
  assert.equal(probe.listDisplay, 'flex')
  assert.equal(probe.listMaxHeight, '320px')
})

test('账号筛选浮层的四行不需要滚动就能看全', opts, () => {
  assert.equal(probe.rows.length, 4)
  assert.ok(
    probe.listScrollHeight <= probe.listClientHeight + 1,
    `列表内容超出可视高度，末行会被裁到滚动区外: scrollHeight=${probe.listScrollHeight} clientHeight=${probe.listClientHeight}`,
  )
  const outside = probe.rows.filter((row) => row.insideList !== true).map((row) => row.id)
  assert.deepEqual(outside, [], `这些行落在列表可视区外: ${outside.join(', ')}`)
})

test('冷却行的昵称完整显示，不被状态文字挤成省略号', opts, () => {
  const cooling = probe.rows.find((row) => row.id === 'ra_cool')
  const normal = probe.rows.find((row) => row.id === 'ra_ok')
  assert.ok(cooling, '冷却行未渲染')
  assert.equal(cooling.health, 'cooling')
  // 换行规则生效的证据：冷却行比普通行高（状态文字落到第二行），
  // 而不是靠压缩昵称挤进一行。
  assert.ok(
    cooling.rowHeight > normal.rowHeight,
    `冷却行没有把状态文字换行，行高与普通行相同: cooling=${cooling.rowHeight} normal=${normal.rowHeight}`,
  )
  assert.ok(
    cooling.nameScrollWidth <= cooling.nameClientWidth + 1,
    `冷却行昵称被截断: ${cooling.nameText} scrollWidth=${cooling.nameScrollWidth} clientWidth=${cooling.nameClientWidth}`,
  )
  assert.ok(cooling.nameWidth >= 56, `冷却行昵称宽度不足以容纳五个字: ${cooling.nameWidth}`)
  const truncated = probe.rows
    .filter((row) => row.nameScrollWidth > row.nameClientWidth + 1)
    .map((row) => row.id)
  assert.deepEqual(truncated, [], `这些行的昵称被截断: ${truncated.join(', ')}`)
})

test('提示条底色取自组件库已定义的令牌，未定义令牌的反向对照是透明的', opts, () => {
  // 先确认探针真的命中了规则，否则「透明」可能只是选择器没匹配上。
  assert.equal(probe.probePadding, '8px 10px')
  assert.equal(probe.layer2Resolved, '#f0f1f3')
  // 反向对照：没有它，「有底色」可能只是夹具恰好定义了那个令牌。
  assert.equal(probe.undefinedTokenControl, 'rgba(0, 0, 0, 0)')
  assert.notEqual(probe.noticeBackground, 'rgba(0, 0, 0, 0)', `提示条没有底色: ${probe.noticeBackground}`)
  assert.notEqual(probe.echoBackground, 'rgba(0, 0, 0, 0)', `导入回显条没有底色: ${probe.echoBackground}`)
  assert.equal(probe.noticeBackground, probe.echoBackground)
})
