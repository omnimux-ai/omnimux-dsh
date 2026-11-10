import assert from 'node:assert/strict'

export default async function agentPanelLiveStateJourney({ send, sleep, evidenceDir, io }) {
  const evaluate = async (expression) => {
    const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    return reply?.result?.value
  }
  const waitFor = async (expression, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return true
      await sleep(200)
    }
    return false
  }
  const assertions = []
  const check = (name, pass, detail) => {
    assertions.push({ name, pass: Boolean(pass), ...(detail ? { detail } : {}) })
  }
  try {
    check('more-menu-visible', await waitFor(`[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === '更多')`))
    await evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === '更多')?.click()`)
    check('plugins-menu-item-visible', await waitFor(`[...document.querySelectorAll('button, [role="menuitem"]')].some((button) => button.textContent.trim() === '插件')`))
    await evaluate(`[...document.querySelectorAll('button, [role="menuitem"]')].find((button) => button.textContent.trim() === '插件')?.click()`)
    check('omnimux-card-visible', await waitFor(`!!document.querySelector('[data-plugin-package="omnimux"]')`))
    await evaluate(`(() => {
      const card = document.querySelector('[data-plugin-package="omnimux"]')
      const open = card ? [...card.querySelectorAll('button')].find((button) => button.textContent.trim() === 'omnimux') : null
      open?.click()
    })()`)
    check('omnimux-detail-visible', await waitFor(`!!document.querySelector('[data-plugin-detail="omnimux"]')`))
    check('cli-rows-visible', await waitFor(`document.querySelectorAll('.omx-agent-card').length > 0`))
    const before = await evaluate(`(() => {
      const status = document.querySelector('.omx-agent-status')
      const cards = [...document.querySelectorAll('.omx-agent-card')]
      return {
        text: status?.textContent?.trim() || '',
        installed: Number(status?.getAttribute('data-installed')),
        known: Number(status?.getAttribute('data-known')),
        installable: cards.filter((card) => card.disabled !== true).length,
        cards: cards.length,
      }
    })()`)
    assert.equal(before.known, 4, 'known set')
    assert.equal(before.cards, 4, 'card count')
    assert.equal(before.installed, before.installable, 'installed count matches enabled cards')
    assert.match(before.text, /已安装 \d+ \/ 已知 4/, 'status line')
    check('installed-count-matches-cards', before.installed === before.installable, JSON.stringify(before))
    check('count-line-names-both-totals', /已安装 \d+ \/ 已知 4/.test(before.text), before.text)

    if (before.installable > 0) {
      await evaluate(`(() => {
        const card = [...document.querySelectorAll('.omx-agent-card')].find((item) => item.disabled !== true)
        card?.click()
      })()`)
      check('model-source-visible', await waitFor(`!!document.querySelector('.omx-agent-source')`))
      const source = await evaluate(`document.querySelector('.omx-agent-source')?.getAttribute('data-source') || ''`)
      assert.ok(source === 'live' || source === 'preset', `declared provenance, got "${source}"`)
      check('model-source-declared', source === 'live' || source === 'preset', String(source))
    }

    await evaluate(`document.querySelector('.omx-agent-shell')?.scrollIntoView({ block: 'start' })`)
    await sleep(400)
    const rects = await evaluate(`(() => {
      const box = (selector) => {
        const node = document.querySelector(selector)
        if (!node) return null
        const rect = node.getBoundingClientRect()
        return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) }
      }
      return { viewport: window.innerHeight, status: box('.omx-agent-status'), source: box('.omx-agent-source') }
    })()`)
    const visible = rects.status !== null && rects.status.top >= 0 && rects.status.bottom <= rects.viewport
    assert.equal(visible, true, `the installed/known line is inside the captured viewport: ${JSON.stringify(rects.status)}`)
    check('count-line-in-viewport', visible, JSON.stringify(rects.status))
    if (rects.source !== null) {
      const sourceVisible = rects.source.top >= 0 && rects.source.bottom <= rects.viewport
      assert.equal(sourceVisible, true, `the model source label is inside the captured viewport: ${JSON.stringify(rects.source)}`)
      check('model-source-in-viewport', sourceVisible, JSON.stringify(rects.source))
    }
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    if (screenshot?.data && evidenceDir && io?.writeFileSync) {
      io.writeFileSync(`${evidenceDir}/cli-live-panel.png`, Buffer.from(screenshot.data, 'base64'))
    }

    const scanLabel = await evaluate(`[...document.querySelectorAll('button')].find((item) => item.textContent.trim() === '重新扫描')?.textContent || ''`)
    assert.equal(scanLabel.trim(), '重新扫描', 'explicit rescan exists')
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === '重新扫描')
      button?.click()
    })()`)
    await sleep(800)
    const after = await evaluate(`(() => {
      const status = document.querySelector('.omx-agent-status')
      return { known: Number(status?.getAttribute('data-known')), detail: !!document.querySelector('[data-plugin-detail="omnimux"]') }
    })()`)
    assert.equal(after.known, 4, 'rescan keeps known set')
    assert.equal(after.detail, true, 'panel mounted after rescan')
    check('rescan-keeps-panel', after.known === 4 && after.detail === true, JSON.stringify(after))
  } catch (error) {
    assertions.push({ name: 'journey-error', pass: false, detail: error instanceof Error ? error.message : String(error) })
  }
  return { assertions }
}
