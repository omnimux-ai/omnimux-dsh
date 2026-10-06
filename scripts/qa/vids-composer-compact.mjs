/**
 * @file scripts/qa/vids-composer-compact.mjs
 * @description 生成面板「紧凑合成器卡片」的真实浏览器验收（收起/展开两态 + 布局与移除项）。
 *
 *   node scripts/worktree-app-qa.mjs --journey=scripts/qa/vids-composer-compact.mjs
 *
 * 判定只认真实 DOM 几何与计算样式：元素必须可见且有正尺寸，隐藏元素不算通过。
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const COMPOSER_PROBE = `(() => {
  const rectOf = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
    }
  }
  const host = document.querySelector('[data-omnimux-host="clip.editor.generate"]')
  const drawer = document.querySelector('.gvids-drawer')
  const extra = document.querySelector('.gvids-composer-extra')
  const popover = document.querySelector('.gvids-param-popover')
  const input = document.querySelector('.gvids-input-area')
  return {
    hasHost: Boolean(host),
    composerState: drawer ? drawer.getAttribute('data-vids-composer') : null,
    toggle: rectOf(document.querySelector('[data-vids-composer-toggle]')),
    chips: Array.from(document.querySelectorAll('[data-vids-mode]')).map((el) => ({
      mode: el.getAttribute('data-vids-mode'),
      active: el.getAttribute('data-active'),
      box: rectOf(el),
    })),
    input: rectOf(input),
    extra: rectOf(extra),
    attachRow: rectOf(document.querySelector('.gvids-attach-row')),
    popoverOpen: popover ? popover.getAttribute('data-open') : null,
    capsule: rectOf(document.querySelector('[data-vids-param-summary]')),
    capsuleText: document.querySelector('[data-vids-param-summary]')?.textContent?.trim() || null,
    clear: rectOf(document.querySelector('[data-vids-composer-clear]')),
    send: rectOf(document.querySelector('[data-vids-submit]')),
    paramSelects: Array.from(document.querySelectorAll('[data-vids-param]')).map((el) => el.getAttribute('data-vids-param')),
    modeStripVisible: rectOf(document.querySelector('.gvids-mode-strip'))?.visible === true,
    submitReasonRow: rectOf(document.querySelector('.gvids-submit-reason')),
  }
})()`

export default async function vidsComposerCompact({ send, evidenceDir, io }) {
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
    // 打开剪辑窗口：优先真实入口，入口不在场时退回工作台接口（如实记录）。
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

    // 官方空态：点「创建并进入编辑器」这类按钮进入编辑器。
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
    add('ac0b-project-ready', Boolean(created?.ok), `空态处理：${JSON.stringify(created)}`)

    // 官方首次引导浮层会盖住编辑器，取证前先跳过（不改变任何编辑状态）。
    await evaluate(`(() => {
      const skip = Array.from(document.querySelectorAll('button')).find((b) => /跳过|Skip/i.test((b.textContent || '').trim()))
      if (skip) { skip.click(); return true }
      return false
    })()`)
    await sleep(600)

    await waitFor(`(() => ({ ok: Boolean(document.querySelector('[data-vids-composer-toggle]')) }))()`, 20000, '生成面板紧凑卡片挂载')
    await sleep(500)

    const collapsed = await evaluate(COMPOSER_PROBE)
    await screenshot('01-composer-collapsed')

    add('ac1-default-collapsed', collapsed?.composerState === 'collapsed', `默认态：${collapsed?.composerState}`)
    add(
      'ac1-collapsed-input-visible',
      Boolean(collapsed?.input?.visible) && collapsed.input.h <= 60,
      `收起态输入行：${JSON.stringify(collapsed?.input)}`,
    )
    add(
      'ac1-collapsed-extras-hidden',
      collapsed?.extra === null || collapsed.extra.visible === false,
      `收起态不显示设置区：${JSON.stringify(collapsed?.extra)}`,
    )
    add(
      'ac1-chips-complete',
      Array.isArray(collapsed?.chips) && collapsed.chips.length === 4 && collapsed.chips.every((c) => c.box?.visible),
      `模式芯片：${JSON.stringify(collapsed?.chips?.map((c) => c.mode))}`,
    )

    // 点展开箭头 → 展开
    await evaluate(`(() => { document.querySelector('[data-vids-composer-toggle]').click(); return true })()`)
    await sleep(600)
    const expanded = await evaluate(COMPOSER_PROBE)
    await screenshot('02-composer-expanded')

    add('ac2-toggle-expands', expanded?.composerState === 'expanded', `点击箭头后：${expanded?.composerState}`)
    add('ac2-extras-visible', expanded?.extra?.visible === true, `设置区可见：${JSON.stringify(expanded?.extra)}`)
    add('ac3-capsule-visible', expanded?.capsule?.visible === true, `参数胶囊：${expanded?.capsuleText}`)
    add('ac3-clear-and-send', expanded?.clear?.visible === true && expanded?.send?.visible === true, `清除 ${JSON.stringify(expanded?.clear)} / 发送 ${JSON.stringify(expanded?.send)}`)
    add(
      'ac3-param-hooks-present',
      Array.isArray(expanded?.paramSelects) && expanded.paramSelects.length === 3,
      `参数选择器：${JSON.stringify(expanded?.paramSelects)}`,
    )
    add('ac3-capsule-collapsed-by-default', expanded?.popoverOpen === 'false', `参数弹层默认关闭：${expanded?.popoverOpen}`)

    // 点胶囊 → 参数选择器展开
    await evaluate(`(() => { document.querySelector('[data-vids-param-summary]').click(); return true })()`)
    await sleep(400)
    const withParams = await evaluate(COMPOSER_PROBE)
    await screenshot('03-param-popover')
    add('ac3-capsule-opens-params', withParams?.popoverOpen === 'true', `参数弹层：${withParams?.popoverOpen}`)

    // 移除项：模式说明行与常驻提示行不再可见
    add('ac4-mode-strip-removed', withParams?.modeStripVisible === false, `模式说明行可见性：${withParams?.modeStripVisible}`)
    add(
      'ac4-submit-reason-row-removed',
      withParams?.submitReasonRow === null || withParams.submitReasonRow.visible === false,
      `常驻提示行：${JSON.stringify(withParams?.submitReasonRow)}`,
    )

    // 再点箭头 → 收起
    await evaluate(`(() => { document.querySelector('[data-vids-composer-toggle]').click(); return true })()`)
    await sleep(600)
    const recollapsed = await evaluate(COMPOSER_PROBE)
    await screenshot('04-composer-recollapsed')
    add('ac4-toggle-recollapses', recollapsed?.composerState === 'collapsed', `再次收起：${recollapsed?.composerState}`)

    // 点输入框 → 自动展开
    await evaluate(`(() => {
      const input = document.querySelector('.gvids-input-area')
      if (!input) return false
      input.focus()
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
      return true
    })()`)
    await sleep(600)
    const afterFocus = await evaluate(COMPOSER_PROBE)
    add('ac2-input-focus-expands', afterFocus?.composerState === 'expanded', `聚焦输入后：${afterFocus?.composerState}`)
  } catch (error) {
    add('journey-completed', false, `旅程中断：${error.message}`)
  }

  return { assertions, shots }
}
