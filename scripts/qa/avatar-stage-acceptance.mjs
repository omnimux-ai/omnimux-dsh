/**
 * @file scripts/qa/avatar-stage-acceptance.mjs
 * @description 虚拟形象一级页（omnimux-avatar:studio）的真实浏览器验收模块。
 *
 * 作为 `scripts/worktree-app-qa.mjs` 的 journey 输入使用：
 *   node scripts/worktree-app-qa.mjs --journey=scripts/qa/avatar-stage-acceptance.mjs
 * 该驱动在任务工作树内起完整应用（隔离环境 · 动态端口 · 测完即焚），本模块在真实浏览器内核里
 * 打开左侧栏「虚拟形象」入口，做真实导航与交互，并把截图落到 evidenceDir。
 *
 * 判定只认正几何与真实计算样式：页面标题、HTTP 200 或合法空态都不算通过。
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 轮询直到表达式返回 ok；超时抛错（不静默通过）。 */
async function waitFor(evaluate, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let last
  for (;;) {
    try {
      last = await evaluate(expression)
    } catch (error) {
      last = { ok: false, why: error.message }
    }
    if (last && last.ok) return last
    if (Date.now() > deadline) {
      throw new Error(`等待超时：${label}（最后一次探测：${JSON.stringify(last)}）`)
    }
    await sleep(200)
  }
}

export default async function avatarStageAcceptance({ send, evidenceDir, io }) {
  const assertions = []
  const add = (name, pass, detail) => assertions.push({ name, pass: pass === true, detail })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
      throw new Error(description ?? 'evaluate-failed')
    }
    return result.result?.value
  }

  const screenshot = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const bytes = Buffer.from(shot.data, 'base64')
    io.writeFileSync(`${evidenceDir}/${name}.png`, bytes)
    return { name, bytes: bytes.length }
  }

  const shots = []

  // ── 1. 左侧栏入口存在且可点 ────────────────────────────────────────────────
  const entry = await waitFor(
    evaluate,
    `(() => {
      const el = document.querySelector('[data-omnimux-avatar-entry]')
      if (!el) return { ok: false, why: 'entry-missing' }
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return { ok: false, why: 'entry-zero-size' }
      return { ok: true, text: (el.textContent || '').trim(), w: Math.round(r.width), h: Math.round(r.height) }
    })()`,
    25_000,
    '左侧栏「虚拟形象」入口',
  )
  add('left-rail-entry-visible', true, `入口文案「${entry.text}」，几何 ${entry.w}×${entry.h}`)

  await evaluate(`(() => { document.querySelector('[data-omnimux-avatar-entry]').click(); return true })()`)

  // ── 2. 一级页挂载并占正几何 ────────────────────────────────────────────────
  const stage = await waitFor(
    evaluate,
    `(() => {
      const page = document.querySelector('.omx-avatar-page')
      if (!page) return { ok: false, why: 'stage-missing' }
      const r = page.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return { ok: false, why: 'stage-zero-size' }
      const head = document.querySelector('.omx-avatar-head')
      const body = document.querySelector('.omnimux-avatar-body')
      if (!head || !body) return { ok: false, why: 'head-or-body-missing' }
      const hr = head.getBoundingClientRect()
      const br = body.getBoundingClientRect()
      if (hr.height <= 0 || br.height <= 0) return { ok: false, why: 'head-or-body-zero-size' }
      const scrolls = [...document.querySelectorAll('.omx-stage-scroll')]
        .filter((el) => el.getBoundingClientRect().height > 0)
      return {
        ok: true,
        w: Math.round(r.width), h: Math.round(r.height),
        stickyCount: document.querySelectorAll('.omx-avatar-head.omx-stage-sticky').length,
        liveScrollCount: scrolls.length,
        pageIsScroll: page.classList.contains('omx-stage-scroll'),
        pageIsSticky: page.classList.contains('omx-stage-sticky'),
        headIsScroll: head.classList.contains('omx-stage-scroll'),
        bodyColumns: getComputedStyle(body).gridTemplateColumns,
        title: (document.querySelector('.omx-avatar-head-title')?.textContent || '').trim(),
        nativeSelects: page.querySelectorAll('select').length,
      }
    })()`,
    25_000,
    '虚拟形象一级页挂载',
  )

  add('stage-mounted-positive-geometry', true, `页面 ${stage.w}×${stage.h}`)
  add('stage-title-is-chinese', stage.title === '虚拟形象', `标题「${stage.title}」`)
  add(
    'stage-root-is-the-scroll-container',
    stage.pageIsScroll === true && stage.pageIsSticky === false,
    `根节点是滚动容器=${stage.pageIsScroll}，误挂吸附声明=${stage.pageIsSticky}`,
  )
  add(
    'sticky-header-is-not-scroll-container',
    stage.stickyCount === 1 && stage.headIsScroll === false,
    `吸附头 ${stage.stickyCount} 个，误挂滚动声明=${stage.headIsScroll}`,
  )
  add('single-scroll-container', stage.liveScrollCount === 1, `正几何滚动容器 ${stage.liveScrollCount} 个`)
  add(
    'two-column-body-laid-out',
    stage.bodyColumns.split(' ').filter(Boolean).length === 2,
    `两栏轨道：${stage.bodyColumns}`,
  )
  add('no-native-select-in-stage', stage.nativeSelects === 0, `原生下拉 ${stage.nativeSelects} 个`)

  shots.push(await screenshot('01-avatar-stage'))

  // ── 3. 真实交互：切到「灵感库」并等预设卡渲染 ──────────────────────────────
  const clickedExplore = await evaluate(`(() => {
    const hit = [...document.querySelectorAll('.omx-avatar-page button')]
      .find((b) => (b.textContent || '').trim() === '灵感库')
    if (!hit) return { ok: false, why: 'explore-tab-missing' }
    hit.click()
    return { ok: true }
  })()`)
  add('explore-tab-clickable', clickedExplore.ok === true, clickedExplore.why ?? '已点击「灵感库」')

  const explore = await waitFor(
    evaluate,
    `(() => {
      const grid = document.querySelector('.omx-avatar-preset-grid')
      if (!grid) return { ok: false, why: 'preset-grid-missing' }
      const r = grid.getBoundingClientRect()
      if (r.height <= 0) return { ok: false, why: 'preset-grid-zero-height' }
      const cards = grid.querySelectorAll('button')
      if (cards.length < 2) return { ok: false, why: 'preset-cards-not-rendered:' + cards.length }
      const cs = getComputedStyle(grid)
      // 只数 <img> 个数会把「元素在、图没加载出来」判成通过——真机上裂图与正常图元素数相同。
      // 因此以 naturalWidth>0 为准（图片真的解码成功），并带出前几个失败的地址便于定位。
      const imgs = Array.from(grid.querySelectorAll('img'))
      const decoded = imgs.filter((i) => i.complete && i.naturalWidth > 0)
      const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0)
      return {
        ok: true,
        cards: cards.length,
        columns: cs.gridTemplateColumns.split(' ').filter(Boolean).length,
        display: cs.display,
        images: imgs.length,
        decoded: decoded.length,
        broken: broken.length,
        brokenSample: broken.slice(0, 3).map((i) => i.getAttribute('src')),
        pending: imgs.filter((i) => !i.complete).length,
        firstLabel: (cards[0].textContent || '').trim().slice(0, 24),
      }
    })()`,
    30_000,
    '灵感库预设网格渲染',
  )
  add('preset-grid-rendered', true, `${explore.cards} 个可点卡片，首张「${explore.firstLabel}」`)
  add(
    'preset-grid-is-real-grid',
    explore.display === 'grid' && explore.columns >= 2,
    `display=${explore.display}，列数 ${explore.columns}`,
  )
  add(
    'preset-preview-artwork-decoded',
    explore.decoded >= 2 && explore.broken === 0,
    `预览图 ${explore.images} 张，解码成功 ${explore.decoded}，裂图 ${explore.broken}，未完成 ${explore.pending}${
      explore.broken > 0 ? `；裂图地址样例 ${JSON.stringify(explore.brokenSample)}` : ''
    }`,
  )

  shots.push(await screenshot('02-avatar-explore'))

  // ── 4. 真实交互：点开一张预设预览弹窗 ──────────────────────────────────────
  const openedDialog = await evaluate(`(() => {
    const grid = document.querySelector('.omx-avatar-preset-grid')
    const open = grid && grid.querySelector('.omx-avatar-preset-open')
    if (!open) return { ok: false, why: 'preview-trigger-missing' }
    open.click()
    return { ok: true }
  })()`)
  add('preset-preview-trigger-clickable', openedDialog.ok === true, openedDialog.why ?? '已点击预览')

  const dialog = await waitFor(
    evaluate,
    `(() => {
      const dlg = document.querySelector('[role="dialog"]')
      if (!dlg) return { ok: false, why: 'dialog-missing' }
      const r = dlg.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return { ok: false, why: 'dialog-zero-size' }
      const apply = [...dlg.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '套用')
      return {
        ok: true,
        ariaModal: dlg.getAttribute('aria-modal'),
        w: Math.round(r.width), h: Math.round(r.height),
        hasApply: Boolean(apply),
        applyDisabled: apply ? apply.disabled : null,
      }
    })()`,
    15_000,
    '预设预览弹窗',
  )
  add('preset-dialog-opened-positive-geometry', true, `弹窗 ${dialog.w}×${dialog.h}`)
  add('preset-dialog-declares-modal', dialog.ariaModal === 'true', `aria-modal=${dialog.ariaModal}`)
  add('preset-dialog-has-apply-action', dialog.hasApply === true, `「套用」按钮存在=${dialog.hasApply}`)

  shots.push(await screenshot('03-avatar-preset-dialog'))

  await send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27,
  })
  await sleep(500)
  const closed = await evaluate(`document.querySelector('[role="dialog"]') === null`)
  add('preset-dialog-escape-closes', closed === true, `Escape 后弹窗已关闭=${closed}`)

  // ── 5. 真实交互：回到「历史记录」，验证网格样式真的落到浏览器 ────────────────
  await evaluate(`(() => {
    const hit = [...document.querySelectorAll('.omx-avatar-page button')]
      .find((b) => (b.textContent || '').trim() === '历史记录')
    if (hit) hit.click()
    return true
  })()`)
  await sleep(700)

  // 历史画廊此刻可能没有内容，所以用探针元素验证样式表确实生效。这一步专门守住
  // 「源工作台的 Tailwind 工具类在本插件是惰性的」这一缺陷——它曾在真实浏览器里塌成一列。
  const gridStyle = await evaluate(`(() => {
    const probe = document.createElement('div')
    probe.className = 'omx-avatar-feed-grid'
    probe.style.position = 'absolute'
    probe.style.left = '-9999px'
    probe.style.width = '1200px'
    document.body.appendChild(probe)
    const cs = getComputedStyle(probe)
    const timeline = document.createElement('div')
    timeline.className = 'omx-avatar-feed-timeline'
    timeline.style.position = 'absolute'
    timeline.style.left = '-9999px'
    document.body.appendChild(timeline)
    const ts = getComputedStyle(timeline)
    const out = {
      gridDisplay: cs.display,
      gridColumns: cs.gridTemplateColumns.split(' ').filter(Boolean).length,
      timelineDisplay: ts.display,
      timelineMaxWidth: ts.maxWidth,
      viewport: window.innerWidth,
    }
    probe.remove(); timeline.remove()
    return out
  })()`)

  add(
    'feed-grid-style-reaches-browser',
    gridStyle.gridDisplay === 'grid' && gridStyle.gridColumns >= 2,
    `display=${gridStyle.gridDisplay}，列数 ${gridStyle.gridColumns}（视口 ${gridStyle.viewport}）`,
  )
  add(
    'feed-timeline-style-reaches-browser',
    gridStyle.timelineDisplay === 'flex' && gridStyle.timelineMaxWidth === '340px',
    `display=${gridStyle.timelineDisplay}，max-width=${gridStyle.timelineMaxWidth}`,
  )

  shots.push(await screenshot('04-avatar-history'))

  io.writeFileSync(`${evidenceDir}/journey-result.json`, JSON.stringify({ assertions, shots }, null, 2))
  return { assertions }
}
