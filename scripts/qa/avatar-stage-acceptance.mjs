/**
 * @file scripts/qa/avatar-stage-acceptance.mjs
 * @description 数字人一级页（omnimux-avatar:studio）的真实浏览器验收模块。
 *
 * 作为 `scripts/worktree-app-qa.mjs` 的 journey 输入使用：
 *   node scripts/worktree-app-qa.mjs --journey=scripts/qa/avatar-stage-acceptance.mjs
 * 该驱动在任务工作树内起完整应用（隔离环境 · 动态端口 · 测完即焚），本模块在真实浏览器内核里
 * 打开左侧栏「数字人」入口，做真实导航与交互，并把截图落到 evidenceDir。
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
    '左侧栏「数字人」入口',
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
      const scrolls = [...document.querySelectorAll('.omx-avatar-scroll')]
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
    '数字人一级页挂载',
  )

  add('stage-mounted-positive-geometry', true, `页面 ${stage.w}×${stage.h}`)
  add('stage-title-is-chinese', stage.title === '数字人', `标题「${stage.title}」`)
  add(
    'stage-root-is-not-the-scroll-container',
    stage.pageIsScroll === false && stage.pageIsSticky === false,
    `根节点是滚动容器=${stage.pageIsScroll}，误挂吸附声明=${stage.pageIsSticky}`,
  )
  add(
    'sticky-header-is-not-scroll-container',
    stage.stickyCount === 1 && stage.headIsScroll === false,
    `吸附头 ${stage.stickyCount} 个，误挂滚动声明=${stage.headIsScroll}`,
  )
  add('two-pane-scroll-containers', stage.liveScrollCount === 2, `正几何内部滚动区 ${stage.liveScrollCount} 个（左右各一）`)
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

  // 让懒加载的卡片也真正发起请求，否则「还没开始加载」会被当成通过（历史缺陷：32/35 解码即算绿）。
  // 这里只改探针的加载时机，不改应用行为；要求变成「全部解码成功」。
  await evaluate(`(() => {
    for (const img of document.querySelectorAll('.omx-avatar-preset-grid img')) img.loading = 'eager'
    return true
  })()`)
  await new Promise((resolve) => setTimeout(resolve, 2500))

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
    explore.decoded >= 2 && explore.broken === 0 && explore.pending === 0,
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

  // ── 5.5 本次重构的四条关键交互（导航位置 / 模型菜单 / 双击改名 / 分区滚动） ────
  // 判定只认真实 DOM 与插件自己的 HTTP 面：不读内存状态，也不靠截图比对。
  const navOrder = await evaluate(`(() => {
    const avatar = document.querySelector('[data-omnimux-avatar-entry]')
    const project = document.querySelector('[data-dsh-omnimux-workflow-entry]')
    if (!avatar) return { ok: false, why: 'avatar-entry-missing' }
    if (!project) return { ok: false, why: 'project-entry-missing' }
    const rows = [...document.querySelectorAll('[data-omnimux-avatar-entry], [data-dsh-omnimux-workflow-entry]')]
    const positions = rows.map((el) => (el === avatar ? 'avatar' : 'project'))
    const order = [...project.parentElement.children]
    return {
      ok: true,
      positions,
      avatarBelowProject: order.indexOf(avatar) > order.indexOf(project),
      avatarLabel: (avatar.textContent || '').trim(),
    }
  })()`)
  add('nav-avatar-entry-exists', navOrder.ok === true, navOrder.why ?? '入口存在')
  add(
    'nav-avatar-below-project',
    navOrder.avatarBelowProject === true,
    `同级顺序=[${navOrder.positions}]，数字人位于「项目」之下=${navOrder.avatarBelowProject}`,
  )
  add(
    'nav-avatar-label-is-digital-human',
    navOrder.avatarLabel.includes('数字人') && !navOrder.avatarLabel.includes('虚拟形象'),
    `入口文案「${navOrder.avatarLabel}」`,
  )

  // 模型配置收敛为一颗按钮：点开才有浮层，浮层里是品牌/模型/渠道三级下拉。
  const modelMenu = await evaluate(`(async () => {
    const btn = document.querySelector('.omx-avatar-modelbtn')
    if (!btn) return { ok: false, why: 'model-button-missing' }
    const before = document.querySelectorAll('.omx-avatar-picker').length
    btn.click()
    await new Promise((r) => setTimeout(r, 250))
    const pop = document.querySelector('.omx-avatar-popover--model')
    const labels = pop ? [...pop.querySelectorAll('.omx-avatar-field-lbl')].map((n) => n.textContent.trim()) : []
    const dialogs = document.querySelectorAll('.omx-avatar-picker').length
    // 浮层底色必须不透明：裸用未定义令牌时 var() 整条失效、背景退化为 transparent，
    // 菜单就会透出下层文字（真实缺陷，不是观感偏好）。
    let bgAlpha = null
    if (pop) {
      const bg = getComputedStyle(pop).backgroundColor
      const m = bg.match(/rgba?\(([^)]+)\)/)
      if (m) {
        const parts = m[1].split(',').map((v) => Number(v.trim()))
        bgAlpha = parts.length < 4 ? 1 : parts[3]
      }
    }
    return { ok: true, before, popOpen: Boolean(pop), labels, dialogs, bgAlpha }
  })()`)
  add('model-config-collapsed-to-one-button', modelMenu.before === 0, `点开前浮层内选择器 ${modelMenu.before} 个`)
  add(
    'model-menu-surface-is-opaque',
    modelMenu.bgAlpha !== null && modelMenu.bgAlpha >= 0.95,
    `模型菜单底色不透明度 ${modelMenu.bgAlpha}`,
  )
  add(
    'model-menu-opens-with-three-fields',
    modelMenu.popOpen === true && modelMenu.labels.length === 3,
    `浮层字段=[${modelMenu.labels}]`,
  )

  const modelPick = await evaluate(`(async () => {
    const pop = document.querySelector('.omx-avatar-popover--model')
    if (!pop) return { ok: false, why: 'popover-missing' }
    const fields = [...pop.querySelectorAll('.omx-avatar-field')]
    const groupField = fields[2]
    const trigger = groupField && groupField.querySelector('.omx-avatar-dropdown')
    if (!trigger) return { ok: false, why: 'group-dropdown-missing' }
    const before = trigger.textContent.trim()
    trigger.click()
    await new Promise((r) => setTimeout(r, 200))
    const items = [...groupField.querySelectorAll('[role="option"]')]
    const target = items.find((n) => n.textContent.trim() && n.getAttribute('aria-selected') !== 'true')
    if (!target) return { ok: false, why: 'no-alternative-option', count: items.length }
    const wanted = target.textContent.trim()
    target.click()
    await new Promise((r) => setTimeout(r, 250))
    const after = document.querySelectorAll('.omx-avatar-modelbtn-val')[0]?.textContent.trim() || ''
    return { ok: true, before, wanted, after }
  })()`)
  add(
    'model-menu-selection-lands-on-trigger',
    modelPick.ok === true && String(modelPick.after).length > 0,
    modelPick.ok ? `选项「${modelPick.wanted}」→ 按钮「${modelPick.after}」` : modelPick.why,
  )

  // 双击名称进入编辑、失焦即保存：改名结果必须落到插件自己的账本（HTTP 面复核）。
  const renameName = '验收改名3192'
  const RENAME_LITERAL = JSON.stringify(renameName)
  const rename = await evaluate(`(async () => {
    const nameEl = document.querySelector('.omx-avatar-avatars-name')
    if (!nameEl) return { ok: false, why: 'name-element-missing' }
    nameEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 250))
    const input = document.querySelector('.omx-avatar-page input[aria-label="数字人名称"]')
    if (!input) return { ok: false, why: 'edit-input-missing' }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, ${RENAME_LITERAL})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    // 失焦保存：不派发 Enter，只把焦点移走。
    input.blur()
    await new Promise((r) => setTimeout(r, 400))
    const back = document.querySelector('.omx-avatar-avatars-name')
    return { ok: true, text: (back?.textContent || '').trim(), editing: Boolean(document.querySelector('.omx-avatar-page input[aria-label="数字人名称"]')) }
  })()`)
  add(
    'rename-by-double-click-then-blur',
    rename.ok === true && rename.text === renameName && rename.editing === false,
    rename.ok ? `失焦后名称「${rename.text}」，仍在编辑态=${rename.editing}` : rename.why,
  )

  const renamePersisted = await evaluate(`(async () => {
    const res = await fetch('/api/omnimux/avatar/avatars')
    const body = await res.json().catch(() => null)
    const list = Array.isArray(body?.avatars) ? body.avatars : []
    return { httpStatus: res.status, hit: list.some((a) => a.name === ${RENAME_LITERAL}) }
  })()`)
  add(
    'rename-persisted-in-plugin-ledger',
    renamePersisted.httpStatus === 200 && renamePersisted.hit === true,
    `HTTP ${renamePersisted.httpStatus}，账本含「${renameName}」=${renamePersisted.hit}`,
  )

  // 分区滚动：左栏设定区与右栏画廊各自可滚，页面根不滚。
  const panes = await evaluate(`(() => {
    const page = document.querySelector('.omx-avatar-page')
    const areas = [...document.querySelectorAll('.omx-avatar-scroll')]
    const grown = areas.filter((el) => el.getBoundingClientRect().height > 0)
    const scrollable = grown.filter((el) => el.scrollHeight > el.clientHeight + 1)
    const gen = document.querySelector('.omx-avatar-bar')
    const gr = gen && gen.getBoundingClientRect()
    return {
      ok: true,
      areaCount: grown.length,
      scrollableCount: scrollable.length,
      pageScrolls: page ? page.scrollHeight > page.clientHeight + 1 : null,
      ctaInViewport: gr ? gr.bottom <= window.innerHeight + 1 && gr.top >= 0 : null,
    }
  })()`)
  add('two-pane-scroll-areas-live', panes.areaCount === 2, `正几何内部滚动区 ${panes.areaCount} 个`)
  add(
    'at-least-one-pane-actually-scrolls',
    panes.scrollableCount >= 1,
    `内容超出可滚的区 ${panes.scrollableCount} 个`,
  )
  add('page-root-does-not-scroll', panes.pageScrolls === false, `页根自身可滚=${panes.pageScrolls}`)
  add('generate-cta-stays-in-viewport', panes.ctaInViewport === true, `生成栏在视口内=${panes.ctaInViewport}`)

  shots.push(await screenshot('05-avatar-two-pane'))

  // ── 6. J3 · 真实生成 → 资产库「角色」自动建档 ──────────────────────────────
  // 这一段走的是完整业务路径：真机新建数字人 → 真机点生成 → 中枢真实提交/轮询/下载落盘
  // → 插件归档回调把主图存进资产库「角色」。判定只读应用自己的 HTTP 面或真实 DOM。
  // 整段包在 try/catch 里：任何一步失败都必须留下已收集的断言与失败原因，
  // 而不是把整段旅程塌成一条 journey-error（那会连前面的断言一起丢掉）。
  const AVATAR_NAME = '验收形象3176'
  const NAME_LITERAL = JSON.stringify(AVATAR_NAME)
  const avatarIdRef = { id: '' }

  try {
    // 「+」之前先记下当前名字：新建是否落地要看名字「变了」，不能只看有没有字。
    const beforeCreate = await evaluate(`(() => {
      const el = document.querySelector('.omx-avatar-avatars-name')
      return { name: (el?.textContent || '').trim() }
    })()`)
    const PREVIOUS_LITERAL = JSON.stringify(beforeCreate.name)

    const clickedCreate = await evaluate(`(() => {
      const page = document.querySelector('.omx-avatar-page')
      if (!page) return { ok: false, why: 'stage-missing' }
      const hit = page.querySelector('button[aria-label="新建数字人"]')
      if (!hit) return { ok: false, why: 'create-button-missing' }
      hit.click()
      return { ok: true }
    })()`)
    add('j3-create-avatar-trigger-clickable', clickedCreate.ok === true, clickedCreate.why ?? '已点击「新建数字人」')

    // 「+」只新建并切到默认名，不抢焦点；改名必须由用户双击名称触发。
    const defaultName = await waitFor(
      evaluate,
      `(() => {
        const el = document.querySelector('.omx-avatar-avatars-name')
        const text = (el?.textContent || '').trim()
        if (!text) return { ok: false, why: 'default-name-missing' }
        if (text === ${PREVIOUS_LITERAL}) return { ok: false, why: 'still-previous:' + text }
        return { ok: true, name: text }
      })()`,
      15_000,
      '新建后的默认名称',
    )
    add('j3-create-lands-on-default-name', defaultName.name.includes('未命名'), `默认名「${defaultName.name}」`)

    const openedEditor = await evaluate(`(() => {
      const el = document.querySelector('.omx-avatar-avatars-name')
      if (!el) return { ok: false, why: 'name-element-missing' }
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      return { ok: true }
    })()`)
    add('j3-double-click-opens-editor', openedEditor.ok === true, openedEditor.why ?? '已双击名称')

    await waitFor(
      evaluate,
      `(() => {
        const input = document.querySelector('.omx-avatar-page input[aria-label="数字人名称"]')
        return input ? { ok: true } : { ok: false, why: 'name-input-missing' }
      })()`,
      15_000,
      '新建数字人的名称输入框',
    )

    // 受控输入必须走原生 setter + input 事件，直接改 value 不会触发 React 的 onChange。
    // 提交另起一次求值：同一次求值里紧接着按回车，处理函数读到的还是上一帧的草稿。
    const typedName = await evaluate(`(() => {
      const input = document.querySelector('.omx-avatar-page input[aria-label="数字人名称"]')
      if (!input) return { ok: false, why: 'name-input-missing' }
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, ${NAME_LITERAL})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return { ok: true, value: input.value }
    })()`)
    add('j3-avatar-name-typed', typedName.value === AVATAR_NAME, `输入框值「${typedName.value}」`)

    await sleep(300)
    const submittedName = await evaluate(`(() => {
      const input = document.querySelector('.omx-avatar-page input[aria-label="数字人名称"]')
      if (!input) return { ok: false, why: 'name-input-gone-before-submit' }
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      return { ok: true }
    })()`)
    add('j3-avatar-name-submitted', submittedName.ok === true, submittedName.why ?? '已按回车提交')

    const avatarCreated = await waitFor(
      evaluate,
      `(() => {
        const el = document.querySelector('.omx-avatar-avatars-name')
        const text = (el?.textContent || '').trim()
        return text === ${NAME_LITERAL} ? { ok: true, name: text } : { ok: false, why: 'name-not-current:' + text }
      })()`,
      20_000,
      '新建数字人成为当前形象',
    )
    add('j3-avatar-created-through-ui', avatarCreated.name === AVATAR_NAME, `当前形象「${avatarCreated.name}」`)

    // 从插件自己的 HTTP 面取形象 id：与界面读的是同一份账本，不是另造一份状态。
    const avatarList = await evaluate(`(async () => {
      const res = await fetch('/api/omnimux/avatar/avatars')
      const body = await res.json().catch(() => null)
      const list = Array.isArray(body?.avatars) ? body.avatars : []
      const hit = list.find((a) => a.name === ${NAME_LITERAL})
      return { httpStatus: res.status, count: list.length, id: hit?.id ?? null, names: list.map((a) => a.name) }
    })()`)
    avatarIdRef.id = typeof avatarList.id === 'string' ? avatarList.id : ''
    add(
      'j3-avatar-present-in-plugin-ledger',
      avatarList.httpStatus === 200 && avatarIdRef.id !== '',
      `HTTP ${avatarList.httpStatus}，形象 ${avatarList.count} 个（${avatarList.names.join('、')}），id=${avatarList.id}`,
    )

    // 让「生成」按钮可用：先点随机补齐选项；仍不可用则如实报出原因，不绕过界面。
    const enableCta = await evaluate(`(() => {
      const page = document.querySelector('.omx-avatar-page')
      if (!page) return { ok: false, why: 'stage-missing' }
      const cta = page.querySelector('.omx-avatar-cta')
      if (!cta) return { ok: false, why: 'generate-cta-missing' }
      if (!cta.disabled) return { ok: true, wasDisabled: false }
      const shuffle = page.querySelector('button[aria-label="随机"]')
      if (!shuffle) return { ok: false, why: 'randomize-missing' }
      shuffle.click()
      return { ok: true, wasDisabled: true }
    })()`)
    if (enableCta.wasDisabled) await sleep(700)

    const genClick = await evaluate(`(() => {
      const page = document.querySelector('.omx-avatar-page')
      const cta = page && page.querySelector('.omx-avatar-cta')
      if (!cta) return { ok: false, why: 'generate-cta-missing' }
      const modelText = (page.querySelector('.omx-avatar-dropdown-val')?.textContent || '').trim()
      if (cta.disabled) return { ok: false, why: 'generate-cta-still-disabled', modelText }
      cta.click()
      return { ok: true, label: (cta.textContent || '').trim(), modelText }
    })()`)
    add(
      'j3-generate-cta-clickable',
      genClick.ok === true,
      genClick.why ?? `已点击「${genClick.label}」，模型选择器显示「${genClick.modelText}」`,
    )

    // 提交后的第一手账本快照：没有这条就说明请求根本没落到服务端（而不是「还没生成完」）。
    await sleep(2500)
    const submitSnapshot = await evaluate(`(async () => {
      const res = await fetch('/api/omnimux/avatar/tasks?avatarId=' + encodeURIComponent(${JSON.stringify(avatarIdRef.id)}))
      const body = await res.json().catch(() => null)
      const tasks = Array.isArray(body?.tasks) ? body.tasks : []
      return {
        httpStatus: res.status,
        total: tasks.length,
        kinds: tasks.map((t) => String(t.kind) + ':' + String(t.status)),
      }
    })()`)
    // 界面上没出现任务时，直接用同一个端点读服务端错误原文：这决定了根因是渠道、
    // 鉴权、契约还是提交前的校验，而不是靠猜。
    let submitProbe = null
    if (submitSnapshot.total < 1) {
      submitProbe = await evaluate(`(async () => {
        const catalogRes = await fetch('/omnimux/model-catalog')
        const catalog = await catalogRes.json().catch(() => null)
        const rows = Array.isArray(catalog?.image) ? catalog.image : []
        const model = catalog?.defaults?.image || rows[0]?.id || ''
        const res = await fetch('/api/omnimux/avatar/sheet', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            avatarId: ${JSON.stringify(avatarIdRef.id)},
            model,
            group: '',
            tier: 'total',
            selection: {},
            brief: '验收诊断：仅用于读出服务端错误原文',
          }),
        })
        const body = await res.json().catch(() => null)
        const err = body?.error
        return {
          httpStatus: res.status,
          model,
          imageModelCount: rows.length,
          success: body?.success === true,
          errorCode: typeof err === 'object' && err ? String(err.code ?? '') : '',
          errorMessage: typeof err === 'object' && err ? String(err.message ?? '') : String(err ?? ''),
          taskStatus: body?.task?.status ?? null,
          mode: body?.mode ?? null,
        }
      })()`)
    }
    add(
      'j3-sheet-task-submitted-to-plugin',
      submitSnapshot.total >= 1,
      `HTTP ${submitSnapshot.httpStatus}，任务 ${submitSnapshot.total} 条：${submitSnapshot.kinds.join('、') || '（空）'}` +
        (submitProbe
          ? `；直连 /sheet 诊断：HTTP ${submitProbe.httpStatus}，模型 ${submitProbe.model}（目录 ${submitProbe.imageModelCount} 个），code=${submitProbe.errorCode}，message=${submitProbe.errorMessage}，task=${String(submitProbe.taskStatus)}，mode=${String(submitProbe.mode)}`
          : ''),
    )

    // 任务终态由真实取回路径推进：界面轮询用的就是这个 refresh=1 入口，
    // 这里显式打一次，并把服务端的错误原文带进断言细节（失败必须可定位）。
    const sheetTask = await waitFor(
      evaluate,
      `(async () => {
        const avatarId = ${JSON.stringify(avatarIdRef.id)}
        const res = await fetch('/api/omnimux/avatar/tasks?avatarId=' + encodeURIComponent(avatarId))
        const body = await res.json().catch(() => null)
        const tasks = Array.isArray(body?.tasks) ? body.tasks : []
        const sheets = tasks.filter((t) => t.kind === 'sheet')
        const last = sheets[sheets.length - 1]
        if (!last) return { ok: false, why: 'no-sheet-task:' + tasks.map((t) => String(t.kind) + ':' + String(t.status)).join('|') }
        if (last.status === 'ready') {
          return { ok: true, status: last.status, taskId: last.taskId, destPath: last.destPath, model: last.model, group: last.group, syncError: last.syncError ?? null, taskRef: last.taskRef ?? null }
        }
        if (last.status === 'failed') return { ok: false, why: 'failed:' + String(last.error || '') }
        const refreshRes = await fetch('/api/omnimux/avatar/task?refresh=1&avatarId=' + encodeURIComponent(avatarId) + '&taskId=' + encodeURIComponent(String(last.taskId)))
        const refreshBody = await refreshRes.json().catch(() => null)
        const refreshed = refreshBody?.task
        const refreshErr = refreshBody?.error
        if (refreshed?.status === 'ready') {
          return { ok: true, status: refreshed.status, taskId: refreshed.taskId, destPath: refreshed.destPath, model: refreshed.model, group: refreshed.group, syncError: refreshed.syncError ?? null, taskRef: refreshed.taskRef ?? null }
        }
        if (refreshed?.status === 'failed') return { ok: false, why: 'failed:' + String(refreshed.error || '') }
        return {
          ok: false,
          why: 'status:' + String(refreshed?.status ?? last.status)
            + ' ref=' + String(last.taskRef ?? 'null')
            + ' http=' + String(refreshRes.status)
            + ' err=' + String(typeof refreshErr === 'object' && refreshErr ? (refreshErr.code ?? '') + ':' + (refreshErr.message ?? '') : (refreshErr ?? refreshed?.error ?? '')),
        }
      })()`,
      90_000,
      '主图任务转为 ready',
    )
    add(
      'j3-sheet-task-reached-ready',
      sheetTask.status === 'ready' && typeof sheetTask.destPath === 'string' && sheetTask.destPath !== '',
      `taskId=${sheetTask.taskId}，destPath=${sheetTask.destPath}，归档失败原因=${sheetTask.syncError === null ? '无' : sheetTask.syncError}`,
    )
    add('j3-sheet-archive-had-no-error', sheetTask.syncError === null, `syncError=${String(sheetTask.syncError)}`)

    // 产物真的落到盘上并且浏览器能解码：这是「生成完成」的正几何证据。
    const sheetDecoded = await waitFor(
      evaluate,
      `(() => {
        const imgs = [...document.querySelectorAll('.omx-avatar-card-img')]
        const decoded = imgs.filter((i) => i.complete && i.naturalWidth > 0)
        if (decoded.length === 0) return { ok: false, why: 'no-decoded-card-image:' + imgs.length }
        return { ok: true, total: imgs.length, decoded: decoded.length }
      })()`,
      30_000,
      '主图卡片图片解码成功',
    )
    add('j3-sheet-artifact-decoded-in-ui', sheetDecoded.decoded > 0, `卡片图 ${sheetDecoded.total} 张，解码 ${sheetDecoded.decoded} 张`)

    // 第一次多视角的入口：此刻该形象还没有任何派生任务，成品卡片必须自己给出「生成多视角」，
    // 否则用户永远开不出第一份多视角（徽标只在已有多视角时才渲染）。
    const mvEntry = await evaluate(`(() => {
      const nodes = Array.from(document.querySelectorAll('.omx-avatar-mv-tile--add'))
      const visible = nodes.filter((n) => n.getClientRects().length > 0)
      const first = visible[0] || null
      return {
        total: nodes.length,
        visible: visible.length,
        label: first ? (first.getAttribute('aria-label') || '') : '',
        text: first ? (first.textContent || '').trim() : '',
      }
    })()`)
    add(
      'j3-first-multiview-entry-present',
      mvEntry.visible >= 1 && mvEntry.label === '生成多视角' && mvEntry.text === '生成多视角',
      `入口 ${mvEntry.visible}/${mvEntry.total} 可见，label=「${mvEntry.label}」，文案=「${mvEntry.text}」`,
    )

    // 应用自己的资产库 HTTP 面：这条资产必须落在「角色」分类下，且引用键是该形象。
    const archivedAsset = await waitFor(
      evaluate,
      `(async () => {
        const res = await fetch('/omnimux/assets/library?type=character')
        const body = await res.json().catch(() => null)
        const assets = Array.isArray(body?.assets) ? body.assets : []
        const wanted = ${JSON.stringify('omnimux-avatar:')} + ${JSON.stringify(avatarIdRef.id)}
        const hit = assets.find((a) => a.source === wanted)
        if (!hit) return { ok: false, why: 'asset-missing:' + assets.length }
        return {
          ok: true,
          id: hit.id, name: hit.name, type: hit.type, cite: hit.cite, source: hit.source,
          fileCount: Array.isArray(hit.files) ? hit.files.length : 0,
        }
      })()`,
      60_000,
      '资产库「角色」分类下的形象资产',
    )
    add(
      'j3-asset-archived-under-character-category',
      archivedAsset.type === 'character' && archivedAsset.cite === '@角色/' + AVATAR_NAME,
      `type=${archivedAsset.type}，name=${archivedAsset.name}，cite=${archivedAsset.cite}`,
    )
    add('j3-asset-carries-the-sheet-file', archivedAsset.fileCount >= 1, `资产 ${archivedAsset.id} 引用文件 ${archivedAsset.fileCount} 个`)

    // 真实界面：资产库 → 本地 → 「角色」分类下能看到这条资产卡片。
    await evaluate(`(() => {
      const entry = document.querySelector('[data-omnimux-assets-entry]')
      if (entry) { entry.click(); return true }
      const wb = window.__omnimuxWorkbench
      if (wb && typeof wb.openWorkbench === 'function') {
        void wb.openWorkbench({ tabId: 'omnimux-assets:library', focus: 'split' })
        return true
      }
      return false
    })()`)

    // 本地分类行 + 搜索框：隔离 profile 会带进 Dev 的既有资产，只按分类翻页找不到新资产，
    // 因此用真实搜索把范围收窄到这一个形象（这也是用户会做的动作）。
    const roleChip = await waitFor(
      evaluate,
      `(() => {
        const stage = document.querySelector('.omnimux-assets-stage')
        if (!stage) return { ok: false, why: 'assets-stage-missing' }
        const tabs = [...stage.querySelectorAll('button, [role="tab"]')]
        const localTab = tabs.find((b) => (b.textContent || '').trim() === '本地')
        if (localTab) localTab.click()
        const chips = [...stage.querySelectorAll('.omnimux-assets-local-nav-row button')]
        const role = chips.find((c) => (c.textContent || '').trim() === '角色')
        if (!role) return { ok: false, why: 'role-chip-missing:' + chips.map((c) => (c.textContent || '').trim()).join('|') }
        role.click()
        const input = stage.querySelector('.omnimux-assets-search-wrap input')
        if (!input) return { ok: false, why: 'search-input-missing' }
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, ${NAME_LITERAL})
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return { ok: true, chips: chips.length, searched: input.value }
      })()`,
      25_000,
      '资产库「角色」分类入口与搜索框',
    )
    add(
      'j3-role-category-entry-clickable',
      roleChip.ok === true && roleChip.searched === AVATAR_NAME,
      roleChip.why ?? `分类行 ${roleChip.chips} 项，已点击「角色」并搜索「${roleChip.searched}」`,
    )

    const cardJ3 = await waitFor(
      evaluate,
      `(() => {
        const stage = document.querySelector('.omnimux-assets-stage')
        const cards = [...document.querySelectorAll('.omnimux-assets-card')]
        const hit = cards.find((c) => (c.textContent || '').includes(${NAME_LITERAL}))
        if (!hit) {
          const titles = cards.map((c) => (c.textContent || '').trim().slice(0, 20))
          const pressed = [...(stage?.querySelectorAll('.omnimux-assets-local-nav-row button') ?? [])]
            .map((b) => (b.textContent || '').trim() + ':' + String(b.getAttribute('aria-pressed')))
          return { ok: false, why: 'card-missing:' + cards.length + ' titles=' + titles.join('|') + ' chips=' + pressed.join('|') }
        }
        const r = hit.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) return { ok: false, why: 'card-zero-size' }
        return { ok: true, w: Math.round(r.width), h: Math.round(r.height), dataType: hit.getAttribute('data-type') }
      })()`,
      30_000,
      '资产库里该形象的卡片',
    )
    add(
      'j3-character-card-visible-in-asset-library-ui',
      cardJ3.dataType === 'character',
      `卡片 ${cardJ3.w}×${cardJ3.h}，data-type=${cardJ3.dataType}`,
    )

    shots.push(await screenshot('05-avatar-j3-asset-library'))

    // ── 7. J4 · 多视角派生 → 该形象资产下的「多视角」文件夹 ──────────────────
    // 说明（真实缺口，已写进报告）：当前界面里多视角弹窗只能从「已存在的多视角缩略格」
    // 打开，首次多视角没有任何界面入口（locales 的「生成多视角」文案无人调用）。
    // 因此这里调用插件自己的公开 HTTP 端点 POST /api/omnimux/avatar/multiview——
    // 与界面弹窗点「重新生成」走的是同一个服务端函数，不是桩、不是旁路。
    // 生成、轮询、下载、归档全部真实发生；J4 的界面判定仍全部落在真实资产库 UI 上。
    const mvSubmit = await evaluate(`(async () => {
      const res = await fetch('/api/omnimux/avatar/multiview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          avatarId: ${JSON.stringify(avatarIdRef.id)},
          model: ${JSON.stringify(sheetTask.model ?? '')},
          group: ${JSON.stringify(sheetTask.group ?? '')},
        }),
      })
      const body = await res.json().catch(() => null)
      return {
        httpStatus: res.status,
        success: body?.success === true,
        taskId: body?.task?.taskId ?? null,
        mode: body?.mode ?? null,
        error: body?.error?.message ?? null,
      }
    })()`)
    add(
      'j4-multiview-generation-submitted',
      mvSubmit.httpStatus === 200 && mvSubmit.success === true,
      `HTTP ${mvSubmit.httpStatus}，taskId=${mvSubmit.taskId}，mode=${mvSubmit.mode}，error=${String(mvSubmit.error)}`,
    )

    // 多视角任务同样由真实取回路径推进：主动打一次 refresh=1（界面轮询用的是同一个入口）。
    const mvReady = await waitFor(
      evaluate,
      `(async () => {
        const avatarId = ${JSON.stringify(avatarIdRef.id)}
        const tasksRes = await fetch('/api/omnimux/avatar/tasks?avatarId=' + encodeURIComponent(avatarId))
        const tasksBody = await tasksRes.json().catch(() => null)
        const tasks = Array.isArray(tasksBody?.tasks) ? tasksBody.tasks : []
        const mvs = tasks.filter((t) => t.kind === 'multiview')
        const last = mvs[mvs.length - 1]
        if (!last) return { ok: false, why: 'no-multiview-task' }
        if (last.status === 'ready') {
          return { ok: true, status: last.status, taskId: last.taskId, destPath: last.destPath, syncError: last.syncError ?? null }
        }
        if (last.status === 'failed') return { ok: false, why: 'failed:' + String(last.error || '') }
        const refreshRes = await fetch('/api/omnimux/avatar/task?refresh=1&avatarId=' + encodeURIComponent(avatarId) + '&taskId=' + encodeURIComponent(String(last.taskId)))
        const refreshBody = await refreshRes.json().catch(() => null)
        const refreshed = refreshBody?.task
        if (refreshed?.status === 'ready') {
          return { ok: true, status: refreshed.status, taskId: refreshed.taskId, destPath: refreshed.destPath, syncError: refreshed.syncError ?? null }
        }
        if (refreshed?.status === 'failed') return { ok: false, why: 'failed:' + String(refreshed.error || '') }
        return { ok: false, why: 'status:' + String(refreshed?.status ?? last.status) + ':' + String(refreshed?.error || '') }
      })()`,
      90_000,
      '多视角任务转为 ready',
    )
    add(
      'j4-multiview-task-reached-ready',
      mvReady.status === 'ready' && typeof mvReady.destPath === 'string' && mvReady.destPath !== '',
      `taskId=${mvReady.taskId}，destPath=${mvReady.destPath}，归档失败原因=${mvReady.syncError === null ? '无' : mvReady.syncError}`,
    )
    add('j4-multiview-archive-had-no-error', mvReady.syncError === null, `syncError=${String(mvReady.syncError)}`)

    // 应用自己的资产库 HTTP 面：该资产下必须出现名为「多视角」的目录引用。
    const mvFolder = await waitFor(
      evaluate,
      `(async () => {
        const res = await fetch('/omnimux/assets/library/detail?id=' + encodeURIComponent(${JSON.stringify(archivedAsset.id)}))
        const body = await res.json().catch(() => null)
        const files = Array.isArray(body?.asset?.files) ? body.asset.files : []
        const folder = files.find((f) => {
          const name = String(f?.original_name || f?.real_path || '')
          return name === ${JSON.stringify('多视角')} && (f?.kind === undefined || f?.kind === 'directory')
        })
        if (!folder) return { ok: false, why: 'folder-missing:' + files.map((f) => String(f?.original_name || '') + '#' + String(f?.kind)).join('|') }
        return { ok: true, fileId: folder.id, kind: folder.kind ?? null, name: folder.original_name ?? null, fileCount: files.length }
      })()`,
      60_000,
      '资产下的「多视角」目录引用',
    )
    add(
      'j4-multiview-folder-attached-to-avatar-asset',
      typeof mvFolder.fileId === 'string' && mvFolder.fileId !== '',
      `目录引用 id=${mvFolder.fileId}，kind=${String(mvFolder.kind)}，资产下共 ${mvFolder.fileCount} 个引用`,
    )

    const mvEntries = await evaluate(`(async () => {
      const res = await fetch('/omnimux/assets/library/files?id=' + encodeURIComponent(${JSON.stringify(archivedAsset.id)}) + '&file=' + encodeURIComponent(${JSON.stringify(mvFolder.fileId ?? '')}))
      const body = await res.json().catch(() => null)
      const entries = Array.isArray(body?.entries) ? body.entries : []
      return {
        httpStatus: res.status,
        count: entries.length,
        names: entries.map((e) => String(e?.name ?? e?.relative_path ?? '')),
        images: entries.filter((e) => /\.(png|jpe?g|webp)$/i.test(String(e?.name ?? e?.relative_path ?? ''))).length,
      }
    })()`)
    add(
      'j4-multiview-sheet-listed-inside-folder',
      mvEntries.httpStatus === 200 && mvEntries.images >= 1,
      `文件夹内 ${mvEntries.count} 项（图片 ${mvEntries.images}）：${mvEntries.names.join('、')}`,
    )

    // 真实界面：点开该资产 → 点进「多视角」文件夹 → 里面的图真的解码出来 → 就地在文件夹内取证。
    // 资产库的搜索框是防抖的：查询落地后会重取列表并收起浏览层，因此这里对
    // 「进入文件夹 → 断言 → 截图」做有限次重试，保证 J4 的截图确实是文件夹内部的画面，
    // 而不是浏览层被收起后的通用首页（那是冒充证据）。
    const openAssetBrowse = `(() => {
      if (document.querySelector('.omnimux-assets-browse')) return { ok: true, already: true }
      const cards = [...document.querySelectorAll('.omnimux-assets-card')]
      const hit = cards.find((c) => (c.textContent || '').includes(${NAME_LITERAL}))
      if (!hit) return { ok: false, why: 'asset-card-missing:' + cards.map((c) => (c.textContent || '').trim().slice(0, 16)).join('|') }
      hit.click()
      return { ok: true, already: false }
    })()`

    const enterFolder = `(() => {
      const browse = document.querySelector('.omnimux-assets-browse')
      if (!browse) return { ok: false, why: 'browse-missing' }
      const crumbs = [...browse.querySelectorAll('.omnimux-assets-crumb')].map((c) => (c.textContent || '').trim())
      if (crumbs.some((c) => c.indexOf(${JSON.stringify('多视角')}) !== -1)) return { ok: true, already: true }
      const cards = [...browse.querySelectorAll('.omnimux-assets-card')]
      const hit = cards.find((c) => (c.textContent || '').trim() === ${JSON.stringify('多视角')}
        || (c.getAttribute('aria-label') || '').trim() === ${JSON.stringify('多视角')})
      if (!hit) return { ok: false, why: 'folder-card-missing:' + cards.map((c) => (c.textContent || '').trim().slice(0, 16)).join('|') }
      const r = hit.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return { ok: false, why: 'folder-card-zero-size' }
      hit.click()
      return { ok: true, already: false, w: Math.round(r.width), h: Math.round(r.height) }
    })()`

    // 正几何必须落在视口内：元素可以布局出正宽高却整块在视口外（收起的分栏就是这样），
    // 那种状态下截图里什么都看不到——不能拿它当文件夹内景的证据。
    const inspectFolder = `(() => {
      const browse = document.querySelector('.omnimux-assets-browse')
      if (!browse) return { ok: false, why: 'browse-missing' }
      const r = browse.getBoundingClientRect()
      const onScreen = r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0
        && r.left < window.innerWidth && r.top < window.innerHeight
      if (!onScreen) {
        return { ok: false, why: 'browse-offscreen', rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], viewport: [window.innerWidth, window.innerHeight] }
      }
      const crumbs = [...browse.querySelectorAll('.omnimux-assets-crumb')].map((c) => (c.textContent || '').trim())
      if (!crumbs.some((c) => c.indexOf(${JSON.stringify('多视角')}) !== -1)) return { ok: false, why: 'not-inside-folder:' + crumbs.join('|') }
      const imgs = [...browse.querySelectorAll('img')]
      const decoded = imgs.filter((i) => i.complete && i.naturalWidth > 0)
      if (decoded.length === 0) return { ok: false, why: 'no-decoded-image:' + imgs.length }
      return { ok: true, decoded: decoded.length, total: imgs.length, crumbs: crumbs.join(' / '), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }
    })()`

    const bringAssetsPanelOnScreen = `(async () => {
      const wb = window.__omnimuxWorkbench
      if (wb && typeof wb.openWorkbench === 'function') {
        await wb.openWorkbench({ tabId: 'omnimux-assets:library', focus: 'split' })
        return { ok: true, via: 'openWorkbench' }
      }
      const entry = document.querySelector('[data-omnimux-assets-entry]')
      if (entry) { entry.click(); return { ok: true, via: 'sidebar-entry' } }
      return { ok: false, via: null }
    })()`

    const openResult = await evaluate(openAssetBrowse)
    add('j4-asset-card-opens-browse', openResult.ok === true, openResult.why ?? '已点开形象资产')

    let folderCard = null
    let insideImage = null
    let j4ShotVerified = false
    for (let attempt = 0; attempt < 4 && !j4ShotVerified; attempt += 1) {
      if (attempt > 0) {
        // 上一轮浏览层被收起（防抖重取），重开资产卡片再进一次。
        await evaluate(openAssetBrowse)
        await sleep(500)
      }
      // 分栏收起时先把它拉回可见区，否则断言与截图都取不到文件夹内景。
      const visible = await evaluate(inspectFolder).catch(() => null)
      if (!visible?.ok && String(visible?.why ?? '').startsWith('browse-offscreen')) {
        await evaluate(bringAssetsPanelOnScreen)
        await sleep(700)
      }
      const entered = await waitFor(evaluate, enterFolder, 20_000, '「多视角」文件夹卡片').catch(() => null)
      if (entered && !folderCard) folderCard = entered
      const inspected = await waitFor(evaluate, inspectFolder, 20_000, '「多视角」文件夹内的图片解码').catch(() => null)
      if (!inspected) continue
      insideImage = inspected
      // 断言通过后立刻取证，并复核「截图那一刻仍在文件夹内」。
      await screenshot('06-avatar-j4-multiview-folder')
      const stillInside = await evaluate(inspectFolder).catch(() => null)
      j4ShotVerified = Boolean(stillInside?.ok)
    }

    add(
      'j4-multiview-folder-card-clickable-in-ui',
      folderCard?.ok === true,
      folderCard ? `文件夹卡片 ${folderCard.w ?? '?'}×${folderCard.h ?? '?'}，已点击进入` : '未能进入「多视角」文件夹',
    )
    add(
      'j4-multiview-sheet-decoded-inside-folder-in-ui',
      insideImage?.ok === true && j4ShotVerified,
      insideImage
        ? `面包屑「${insideImage.crumbs}」，图 ${insideImage.total} 张，解码 ${insideImage.decoded} 张，浏览区视口内位置=[${insideImage.rect}]，截图时仍在文件夹内=${j4ShotVerified}`
        : '文件夹内未解码出图片',
    )

    // 取证之后把界面挪回数字人页：否则驱动收尾那张 app-home.png 与 J4 截图是同一帧，
    // 两张不同用途的证据无法互相区分（不是缺陷，但会让复核者无法判断哪张是哪张）。
    await evaluate(`(() => {
      const entry = document.querySelector('[data-omnimux-avatar-entry]')
      if (entry) { entry.click(); return true }
      return false
    })()`)
    await sleep(800)

  } catch (error) {
    add('j3-j4-section-error', false, error?.message ?? String(error))
  }

  io.writeFileSync(`${evidenceDir}/journey-result.json`, JSON.stringify({ assertions, shots }, null, 2))
  return { assertions }
}
