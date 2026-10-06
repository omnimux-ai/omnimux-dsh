/**
 * @file scripts/qa/google-vids-archive.mjs
 * @description Google Vids 下线后的真机验收：剪辑窗口恢复纯剪辑，全应用无生成面板与入口。
 *
 *   node scripts/worktree-app-qa.mjs --journey=scripts/qa/google-vids-archive.mjs
 *
 * 判定只认真实 DOM 几何与计算样式：元素必须可见且有正尺寸。
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const PROBE = `(() => {
  const rectOf = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { w: Math.round(r.width), h: Math.round(r.height),
      visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' }
  }
  const byArea = (name) => document.querySelector('[style*="grid-area: ' + name + '"]')
  const gvidsClasses = Array.from(document.querySelectorAll('*'))
    .filter((el) => typeof el.className === 'string' && el.className.includes('gvids'))
  const vidsAttrs = Array.from(document.querySelectorAll('*'))
    .filter((el) => Array.from(el.attributes || []).some((a) => a.name.startsWith('data-vids')))
  const text = document.body ? document.body.innerText : ''
  return {
    stageArea: rectOf(byArea('stage')),
    mediaArea: rectOf(byArea('media')),
    timelineArea: rectOf(byArea('timeline')),
    gvidsCount: gvidsClasses.length,
    vidsAttrCount: vidsAttrs.length,
    hasGoogleVidsText: /Google Vids|内测版/.test(text),
    hasGeneratePanelText: /生成记录|描述要生成的画面与动作/.test(text),
    hasClipChrome: /Video Editor|Export|Player/.test(text),
    hasClipRoot: Boolean(document.querySelector('.openreel-studio-root')),
  }
})()`

export default async function googleVidsArchive({ send, evidenceDir, io }) {
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
        if (typeof window.__omnimuxWorkbench?.openWorkbench === 'function') {
          window.__omnimuxWorkbench.openWorkbench({ tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' })
          return { ok: true, via: 'workbench-api' }
        }
        const entry = document.querySelector('[data-omnimux-google-vids-entry]')
        if (entry) { entry.click(); return { ok: true, via: 'vids-entry' } }
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
      await waitFor(`(() => ({ ok: Boolean(document.querySelector('[style*="grid-area: stage"]')) }))()`, 45000, '编辑器区域渲染')
      await sleep(1500)
    }
    await evaluate(`(() => {
      const skip = Array.from(document.querySelectorAll('button')).find((b) => /跳过|Skip/i.test((b.textContent || '').trim()))
      if (skip) { skip.click(); return true }
      return false
    })()`)
    await sleep(800)

    const probe = await evaluate(PROBE)
    await screenshot('01-clip-without-generate')

    add('ac1-editor-mounted', probe?.hasClipRoot === true, `剪辑外壳：${probe?.hasClipRoot}`)
    add('ac1-stage-visible', probe?.stageArea?.visible === true, `中间舞台：${JSON.stringify(probe?.stageArea)}`)
    add(
      'ac1-stage-width-floor',
      (probe?.stageArea?.w ?? 0) >= 280,
      `中间舞台宽度必须守住可用下限（≥280），实测 ${probe?.stageArea?.w}`,
    )
    add('ac1-media-visible', probe?.mediaArea?.visible === true, `素材列：${JSON.stringify(probe?.mediaArea)}`)
    add('ac1-timeline-visible', probe?.timelineArea?.visible === true, `时间线：${JSON.stringify(probe?.timelineArea)}`)
    add('ac5-clip-chrome-present', probe?.hasClipChrome === true, `剪辑自带控件：${probe?.hasClipChrome}`)

    add('ac2-no-gvids-dom', probe?.gvidsCount === 0, `生成面板残留节点：${probe?.gvidsCount}`)
    add('ac2-no-vids-attrs', probe?.vidsAttrCount === 0, `生成面板残留属性：${probe?.vidsAttrCount}`)
    add('ac3-no-google-vids-text', probe?.hasGoogleVidsText === false, `页面是否出现 Google Vids/内测版：${probe?.hasGoogleVidsText}`)
    add('ac3-no-generate-panel-text', probe?.hasGeneratePanelText === false, `页面是否出现生成面板文案：${probe?.hasGeneratePanelText}`)
  } catch (error) {
    add('journey-completed', false, `旅程中断：${error.message}`)
  }

  return { assertions, shots }
}
