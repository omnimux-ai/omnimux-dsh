/**
 * Browser journey for the local-CLI panel: the installed/known count is live,
 * it agrees with the cards' own disabled state, a model source is named, and an
 * explicit rescan keeps the page mounted.
 *
 * The QA runner supplies the authenticated page; this journey makes no model or
 * network requests beyond the panel's own local reads.
 */
import assert from 'node:assert/strict'

export default async function agentModelsLiveJourney({ send, sleep, evidenceDir, io }) {
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
    check('cli-panel-visible', await waitFor(`!!document.querySelector('.omx-agent-status')`))
    check('cli-rows-visible', await waitFor(`document.querySelectorAll('.omx-agent-card').length > 0`))

    const before = await evaluate(`(() => {
      const status = document.querySelector('.omx-agent-status')
      const cards = [...document.querySelectorAll('.omx-agent-card')]
      const source = document.querySelector('.omx-agent-source')
      return {
        text: status?.textContent?.trim() || '',
        installed: Number(status?.getAttribute('data-installed')),
        known: Number(status?.getAttribute('data-known')),
        installable: cards.filter((card) => card.disabled !== true).length,
        cards: cards.length,
        source: source?.getAttribute('data-source') || null,
      }
    })()`)

    assert.equal(before.known, 4, 'the panel always knows the four supported CLIs')
    assert.equal(before.cards, 4, 'every known CLI renders a card, installed or not')
    assert.equal(before.installed, before.installable, 'the installed count equals the cards the scan enabled')
    assert.match(before.text, /已安装 \d+ \/ 已知 4/, 'the status line names installed and known counts')
    assert.ok(before.source === null || before.source === 'live' || before.source === 'preset', 'a model source is one of the declared provenances')
    check('installed-count-matches-cards', before.installed === before.installable, JSON.stringify(before))
    check('count-line-names-both-totals', /已安装 \d+ \/ 已知 4/.test(before.text), before.text)
    check('model-source-declared', before.source === null || before.source === 'live' || before.source === 'preset', String(before.source))

    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    if (screenshot?.data && evidenceDir && io?.writeFileSync) {
      io.writeFileSync(`${evidenceDir}/cli-live-panel.png`, Buffer.from(screenshot.data, 'base64'))
    }

    await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === '重新扫描')
      button?.click()
    })()`)
    await sleep(800)
    const after = await evaluate(`(() => {
      const status = document.querySelector('.omx-agent-status')
      return {
        known: Number(status?.getAttribute('data-known')),
        detail: !!document.querySelector('[data-plugin-detail="omnimux"]'),
        text: status?.textContent?.trim() || '',
      }
    })()`)
    assert.equal(after.known, 4, 'an explicit rescan keeps the same known set')
    assert.equal(after.detail, true, 'the panel stays mounted through a rescan')
    check('rescan-keeps-panel', after.known === 4 && after.detail === true, JSON.stringify(after))
  } catch (error) {
    assertions.push({ name: 'journey-error', pass: false, detail: error instanceof Error ? error.message : String(error) })
  }
  return { assertions }
}