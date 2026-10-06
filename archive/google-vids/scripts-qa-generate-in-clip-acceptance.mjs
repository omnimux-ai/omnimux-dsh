/**
 * @file scripts/qa/generate-in-clip-acceptance.mjs
 * @description 生成能力并入视频剪辑窗口（Issue #3196）的真实浏览器验收模块。
 *
 * 作为 `scripts/worktree-app-qa.mjs` 的 journey 输入使用：
 *   node scripts/worktree-app-qa.mjs --journey=scripts/qa/generate-in-clip-acceptance.mjs
 * 该驱动在任务工作树内起完整应用（隔离环境 · 动态端口 · 测完即焚），本模块在真实浏览器内核里
 * 点击「Google Vids」侧栏入口，验证打开的是剪辑窗口而不是空白页，并逐区取证四区布局。
 *
 * 判定只认正几何与真实计算样式：HTTP 200、页面标题、合法空态都不算通过。
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const REGION_PROBE = `(() => {
  const rectOf = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
  }
  const byArea = (name) => document.querySelector('[style*="grid-area: ' + name + '"]')
  const host = document.querySelector('[data-omnimux-host="clip.editor.generate"]')
  const panel = host ? host.querySelector('.omnimux-vids-stage') : null
  const media = byArea('media')
  const stage = byArea('stage')
  const gen = byArea('gen')
  const timeline = byArea('timeline')
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    hasEditor: Boolean(document.querySelector('.openreel-studio-root')),
    productStage: document.documentElement.dataset.dshProductStage || null,
    host: rectOf(host),
    panel: rectOf(panel),
    regions: { gen: rectOf(gen), stage: rectOf(stage), media: rectOf(media), timeline: rectOf(timeline) },
    leftColumnProbe: (() => {
      // 官方左栏曾经是配置面板；并轨后它必须落在右缘，用「媒体面板的右边界贴近编辑器右边界」判定。
      const root = document.querySelector('.openreel-studio-root')
      if (!root || !media) return null
      const rr = root.getBoundingClientRect()
      const mr = media.getBoundingClientRect()
      return { gapToEditorRight: Math.round(rr.right - mr.right) }
    })(),
    gridScroll: (() => {
      // 容器比三列下限之和还窄时，允许横向滚动触达，而不是把右栏裁掉。
      const grid = document.querySelector('[style*="grid-area: gen"]')?.parentElement
      if (!grid) return null
      return { scrollWidth: grid.scrollWidth, clientWidth: grid.clientWidth }
    })(),
  }
})()`

export default async function generateInClipAcceptance({ send, evidenceDir, io }) {
  const assertions = []
  const shots = []
  const add = (name, pass, detail) => assertions.push({ name, pass: pass === true, detail })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    return result?.result?.value
  }

  const screenshot = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const bytes = Buffer.from(shot?.data ?? '', 'base64')
    io.writeFileSync(`${evidenceDir}/${name}.png`, bytes)
    shots.push(name)
    return bytes.length
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
    // 入口行由侧栏协调器挂载，只在该表面渲染会话侧栏时存在；两种打开方式都算数，
    // 但优先走真实入口点击，只有入口确实不在场时才退回工作台接口，并如实记录。
    const entryOrWorkbench = await waitFor(
      `(() => {
        const hasEntry = Boolean(document.querySelector('[data-omnimux-google-vids-entry]'))
        const hasWorkbench = typeof window.__omnimuxWorkbench?.openWorkbench === 'function'
        return { ok: hasEntry || hasWorkbench, hasEntry, hasWorkbench }
      })()`,
      30000,
      '生成入口或工作台接口出现',
    )
    add('ac0-entry-surface', true, `入口在场=${entryOrWorkbench.hasEntry}，工作台接口在场=${entryOrWorkbench.hasWorkbench}`)

    if (entryOrWorkbench.hasEntry) {
      const clicked = await evaluate(`(() => {
        const entry = document.querySelector('[data-omnimux-google-vids-entry]')
        if (!entry) return { ok: false }
        entry.click()
        return { ok: true }
      })()`)
      add('ac1-entry-click', Boolean(clicked?.ok), '点击侧栏生成入口')
    } else {
      const opened = await evaluate(`(async () => {
        const wb = window.__omnimuxWorkbench
        if (typeof wb?.openWorkbench !== 'function') return { ok: false }
        await wb.openWorkbench({ tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' })
        return { ok: true }
      })()`)
      add(
        'ac1-entry-click',
        Boolean(opened?.ok),
        '该验收表面不渲染会话侧栏（入口行不在场），改用工作台接口打开剪辑窗口',
      )
    }

    // 入口必须打开剪辑窗口，而不是空白页。
    await waitFor(
      `(() => ({ ok: Boolean(document.querySelector('.openreel-studio-root')) }))()`,
      45000,
      '剪辑窗口根节点出现',
    )
    await sleep(1500)

    // 剪辑页首次打开是「新建/打开项目」的空态；四区编辑器要项目就绪后才渲染。
    const created = await evaluate(`(() => {
      const fallback = document.querySelector('.openreel-studio-fallback')
      if (!fallback) return { ok: true, needed: false }
      const buttons = Array.from(fallback.querySelectorAll('button')).filter((b) => (b.textContent || '').trim())
      const primary = buttons[buttons.length - 1]
      if (!primary) return { ok: false, needed: true, labels: buttons.map((b) => b.textContent.trim()) }
      primary.click()
      return { ok: true, needed: true, clicked: primary.textContent.trim() }
    })()`)
    add('ac1b-project-ready', Boolean(created?.ok), `空态处理：${JSON.stringify(created)}`)

    if (created?.needed) {
      await waitFor(
        `(() => ({ ok: Boolean(document.querySelector('[style*="grid-area: stage"]')) }))()`,
        45000,
        '编辑器四区渲染',
      )
      await sleep(1200)
    }

    // 官方首次引导浮层会盖住编辑器，取证前先关掉它（跳过引导，不改变任何编辑状态）。
    const tourDismissed = await evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const skip = buttons.find((b) => /跳过|Skip/i.test((b.textContent || '').trim()))
      if (!skip) return { ok: true, present: false }
      skip.click()
      return { ok: true, present: true, label: skip.textContent.trim() }
    })()`)
    add('ac1c-tour-dismissed', Boolean(tourDismissed?.ok), `首次引导浮层处理：${JSON.stringify(tourDismissed)}`)
    await sleep(600)

    const first = await evaluate(REGION_PROBE)

    // 结构取证：四区选择器落空时，需要知道剪辑窗口此刻真正渲染了什么。
    const skeleton = await evaluate(`(() => {
      const root = document.querySelector('.openreel-studio-root')
      const host = root ? root.parentElement : document.body
      const out = []
      const walk = (el, depth) => {
        if (!el || out.length > 80 || depth > 8) return
        const style = el.getAttribute('style') || ''
        out.push('  '.repeat(depth) + el.tagName.toLowerCase()
          + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\\s+/).slice(0, 4).join('.') : '')
          + (style ? ' {' + style.slice(0, 90) + '}' : ''))
        for (const child of el.children) walk(child, depth + 1)
      }
      walk(host, 0)
      return out.join('\\n')
    })()`)
    io.writeFileSync(`${evidenceDir}/dom-skeleton.txt`, String(skeleton ?? ''))

    const inlineAreas = await evaluate(`(() => {
      const all = Array.from(document.querySelectorAll('[style*="grid-area"]'))
      return all.slice(0, 12).map((el) => ({
        tag: el.tagName.toLowerCase(),
        area: (el.getAttribute('style') || '').match(/grid-area:\\s*([^;]+)/)?.[1] || '',
        rect: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] })(),
      }))
    })()`)
    add('ac3-area-elements', Array.isArray(inlineAreas) && inlineAreas.length > 0, `带 grid-area 的元素：${JSON.stringify(inlineAreas)}`)
    add('ac1-editor-opened', Boolean(first?.hasEditor), '入口打开的是剪辑窗口（不是空白页）')
    add(
      'ac2-no-stage-takeover',
      first?.productStage == null,
      `入口不得抢占产品舞台（dshProductStage=${JSON.stringify(first?.productStage)}）`,
    )

    const regions = first?.regions ?? {}
    const order = ['gen', 'stage', 'media']
    const present = order.every((key) => regions[key] && regions[key].w > 0 && regions[key].h > 0)
    add('ac3-four-regions-present', present, `四区几何：${JSON.stringify(regions)}`)

    if (present) {
      add(
        'ac3-left-is-generate',
        regions.gen.x <= regions.stage.x && regions.gen.w >= 240,
        `生成列在最左且不塌陷（x=${regions.gen.x}, w=${regions.gen.w}）`,
      )
      add(
        'ac3-right-is-library',
        regions.media.x >= regions.stage.x + regions.stage.w - 2 && regions.media.w >= 240,
        `官方素材/属性面板在右缘且不塌陷（x=${regions.media.x}, w=${regions.media.w}）`,
      )
      add(
        'ac3-stage-not-crushed',
        regions.stage.w >= 240,
        `官方舞台保留最小可用宽度（w=${regions.stage.w}）`,
      )
      add(
        'ac3-bottom-is-timeline',
        regions.timeline.y >= regions.stage.y + regions.stage.h - 2 && regions.timeline.h > 0,
        `时间线在下方（y=${regions.timeline.y}, h=${regions.timeline.h}）`,
      )
      add(
        'ac3-right-column-reachable',
        (() => {
          const gap = first?.leftColumnProbe?.gapToEditorRight
          const scroll = first?.gridScroll
          if (gap == null) return false
          // 要么右栏完整落在编辑器内（间隙接近 0），要么容器过窄时可通过横向滚动触达。
          if (Math.abs(gap) <= 24) return true
          return Boolean(scroll && scroll.scrollWidth > scroll.clientWidth)
        })(),
        `右栏可触达（与编辑器右缘间隙 ${first?.leftColumnProbe?.gapToEditorRight}px，网格滚动宽 ${first?.gridScroll?.scrollWidth}/${first?.gridScroll?.clientWidth}）`,
      )
    }

    add(
      'ac4-generate-panel-mounted',
      Boolean(first?.host && first.host.w > 0 && first.panel && first.panel.w > 0 && first.panel.h > 0),
      `生成面板已挂进左列宿主容器（宿主 ${JSON.stringify(first?.host)}，面板 ${JSON.stringify(first?.panel)}）`,
    )

    await screenshot('01-generate-entry-clicked')
    await screenshot('02-four-regions')

    const leftShot = await evaluate(`(() => {
      const host = document.querySelector('[data-omnimux-host="clip.editor.generate"]')
      if (!host) return { ok: false }
      const r = host.getBoundingClientRect()
      return { ok: true, clip: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), scale: 1 } }
    })()`)
    if (leftShot?.ok) {
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: leftShot.clip })
      io.writeFileSync(`${evidenceDir}/03-left-generate-column.png`, Buffer.from(shot?.data ?? '', 'base64'))
      shots.push('03-left-generate-column')
    }

    // 窄窗口降级：不得出现零宽列或破版。
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1180,
      height: 820,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await sleep(800)
    const narrow = await evaluate(REGION_PROBE)
    const nr = narrow?.regions ?? {}
    add(
      'ac5-narrow-no-zero-width-column',
      Boolean(nr.gen && nr.stage && nr.media && nr.gen.w > 0 && nr.stage.w > 0 && nr.media.w > 0),
      `窄窗口三列宽度：gen=${nr.gen?.w}, stage=${nr.stage?.w}, media=${nr.media?.w}`,
    )
    await screenshot('04-narrow-window')
    await send('Emulation.clearDeviceMetricsOverride', {})
    await sleep(600)

    const restored = await evaluate(REGION_PROBE)
    add(
      'ac6-restored-after-narrow',
      Boolean(restored?.regions?.gen?.w > 0 && restored?.regions?.media?.w > 0),
      '恢复宽窗口后四区仍在',
    )
  } catch (error) {
    add('journey-error', false, error?.message ?? String(error))
  }

  io.writeFileSync(`${evidenceDir}/journey-result.json`, JSON.stringify({ assertions, shots }, null, 2))
  return { assertions }
}
