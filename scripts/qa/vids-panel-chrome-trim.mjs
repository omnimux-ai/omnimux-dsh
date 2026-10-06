/**
 * @file scripts/qa/vids-panel-chrome-trim.mjs
 * @description 生成面板去除无意义外壳（标题栏 / 空生成记录行）的真机验收。
 *
 *   node scripts/worktree-app-qa.mjs --journey=scripts/qa/vids-panel-chrome-trim.mjs
 *
 * 判定只认真实 DOM 几何与计算样式：元素必须可见且有正尺寸，隐藏元素不算通过。
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const PROBE = `(() => {
  const rectOf = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
    }
  }
  const stage = document.querySelector('.omnimux-vids-stage')
  const header = document.querySelector('.gvids-header')
  const feed = document.querySelector('.gvids-feed')
  const drawer = document.querySelector('.gvids-drawer')
  return {
    stageVisible: rectOf(stage)?.visible === true,
    header: rectOf(header),
    headerInDom: Boolean(header),
    feedInDom: Boolean(feed),
    feed: rectOf(feed),
    feedEmpty: feed ? feed.getAttribute('data-empty') : null,
    feedHeaderVisible: rectOf(document.querySelector('.gvids-feed-header'))?.visible === true,
    wizardBtnVisible: rectOf(document.querySelector('.gvids-wizard-btn'))?.visible === true,
    badgeVisible: rectOf(document.querySelector('.gvids-badge'))?.visible === true,
    composerState: drawer ? drawer.getAttribute('data-vids-composer') : null,
    chipsVisible: Array.from(document.querySelectorAll('[data-vids-mode]')).every((el) => rectOf(el)?.visible === true),
    bodyHasRecordWord: (stage ? stage.textContent : '').includes('生成记录'),
    bodyHasBetaWord: (stage ? stage.textContent : '').includes('内测版'),
  }
})()`

export default async function vidsPanelChromeTrim({ send, evidenceDir, io }) {
  const assertions = []
  const shots = []
  const add = (name, pass, detail) => assertions.push({ name, pass: pass === true, detail })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return result?.result?.value
  }
  const screenshot = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    io.writeFileSync(`${evidenceDir}/${name}.png`, Buffer.from(shot?.data ?? '', 'base64'))
    shots.push(name)
  }
  const waitFor = async (expression, timeoutMs, label) => {
    const deadline = Date.now() + timeoutMs
    let last
    for (;;) {
      try {
        last = await evaluate(expression)
      } catch (error) {
        last = { error: error.message }
      }
      if (last && last.ok) return last
      if (Date.now() > deadline) throw new Error(`等待超时：${label}（最后一次：${JSON.stringify(last)}）`)
      await sleep(200)
    }
  }

  try {
    const opened = await waitFor(
      `(() => {
        const entry = document.querySelector('[data-omnimux-google-vids-entry]')
        if (entry) { entry.click(); return { ok: true, via: 'entry' } }
        if (typeof window.__omnimuxWorkbench?.openWorkbench === 'function') {
          window.__omnimuxWorkbench.openWorkbench({ tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' })
          return { ok: true, via: 'workbench-api' }
        }
        return { ok: false }
      })()`,
      20000,
      '剪辑窗口入口可用',
    )
    add('ac0-open-clip', Boolean(opened?.ok), `打开方式：${opened?.via}`)

    await waitFor(`(() => ({ ok: Boolean(document.querySelector('.openreel-studio-root')) }))()`, 45000, '剪辑外壳渲染')

    const created = await evaluate(`(() => {
      const fallback = document.querySelector('.openreel-studio-fallback')
      if (!fallback) return { ok: true, needed: false }
      const buttons = Array.from(fallback.querySelectorAll('button')).filter((b) => (b.textContent || '').trim())
      const target = buttons[buttons.length - 1]
      if (!target) return { ok: false, needed: true }
      target.click()
      return { ok: true, needed: true, clicked: target.textContent.trim() }
    })()`)
    if (created?.needed) {
      await waitFor(`(() => ({ ok: Boolean(document.querySelector('[style*="grid-area: stage"]')) }))()`, 45000, '编辑器四区渲染')
      await sleep(1200)
    }

    await evaluate(`(() => {
      const skip = Array.from(document.querySelectorAll('button')).find((b) => /跳过|Skip/i.test((b.textContent || '').trim()))
      if (skip) { skip.click(); return true }
      return false
    })()`)
    await sleep(600)

    await waitFor(`(() => ({ ok: Boolean(document.querySelector('[data-vids-composer-toggle]')) }))()`, 20000, '生成面板挂载')
    await sleep(600)

    const collapsed = await evaluate(PROBE)
    await screenshot('01-panel-collapsed')

    add('ac1-stage-visible', collapsed?.stageVisible === true, `面板可见：${collapsed?.stageVisible}`)
    add(
      'ac1-header-absent',
      collapsed?.header === null && collapsed?.headerInDom === false,
      `标题栏：${JSON.stringify(collapsed?.header)} / 在 DOM：${collapsed?.headerInDom}`,
    )
    add(
      'ac1-header-text-absent',
      collapsed?.bodyHasBetaWord === false && collapsed?.wizardBtnVisible !== true,
      `面板内「内测版」字样：${collapsed?.bodyHasBetaWord} / 向导按钮：${collapsed?.wizardBtnVisible}`,
    )
    add(
      'ac2-feed-state-matches-records',
      collapsed?.feedInDom === true && (collapsed?.feedEmpty === 'true') === (collapsed?.feed?.visible !== true),
      `生成记录块：empty=${collapsed?.feedEmpty} 可见=${collapsed?.feed?.visible}`,
    )
    // 空态隐藏的真实性：把 data-empty 切到 true，容器必须真的不可见且标题行不可见（验证 CSS 规则本身生效）
    const emptyProbe = await evaluate(`(() => {
      const feed = document.querySelector('.gvids-feed')
      if (!feed) return { ok: false }
      const before = feed.getAttribute('data-empty')
      feed.setAttribute('data-empty', 'true')
      const r = feed.getBoundingClientRect()
      const cs = getComputedStyle(feed)
      const header = document.querySelector('.gvids-feed-header')
      const hr = header ? header.getBoundingClientRect() : null
      const hidden = r.width === 0 || r.height === 0 || cs.display === 'none'
      const headerHidden = !hr || hr.width === 0 || hr.height === 0
      return { ok: true, hidden, headerHidden, before }
    })()`)
    await sleep(300)
    await screenshot('03-panel-forced-empty')
    await evaluate(`(() => {
      const feed = document.querySelector('.gvids-feed')
      if (feed) feed.setAttribute('data-empty', ${JSON.stringify(emptyProbe?.before ?? 'false')})
      return true
    })()`)
    add('ac2-empty-state-hides-block', emptyProbe?.hidden === true, `空态容器不可见：${emptyProbe?.hidden}`)
    add('ac2-empty-state-hides-header', emptyProbe?.headerHidden === true, `空态标题行不可见：${emptyProbe?.headerHidden}`)
    add('ac4-default-collapsed', collapsed?.composerState === 'collapsed', `默认态：${collapsed?.composerState}`)
    add('ac5-chips-visible', collapsed?.chipsVisible === true, `四模式芯片可见：${collapsed?.chipsVisible}`)

    // 展开态复检：移除头部后，收起/展开契约与紧凑布局仍成立
    await evaluate(`(() => { document.querySelector('[data-vids-composer-toggle]').click(); return true })()`)
    await sleep(600)
    const expanded = await evaluate(PROBE)
    await screenshot('02-panel-expanded')
    add('ac4-toggle-expands', expanded?.composerState === 'expanded', `点击箭头后：${expanded?.composerState}`)
    add('ac4-header-still-absent', expanded?.headerInDom === false, `展开态标题栏在 DOM：${expanded?.headerInDom}`)
    add('ac4-feed-state-stable', expanded?.feedEmpty === collapsed?.feedEmpty, `展开态生成记录状态：${expanded?.feedEmpty}（收起态 ${collapsed?.feedEmpty}）`)
  } catch (error) {
    add('journey-completed', false, `旅程中断：${error.message}`)
  }

  return { assertions, shots }
}
