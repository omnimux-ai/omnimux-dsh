/**
 * Browser journey for the dynamic model settings card on the official Plugins page.
 * The app QA runner provides the authenticated page and screenshot evidence.
 */
import assert from 'node:assert/strict'

export default async function modelSettingsJourney({ send, sleep }) {
  const evaluate = async (expression) => {
    const reply = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    return reply?.result?.value
  }
  const waitFor = async (expression, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return true
      await sleep(200)
    }
    return false
  }
  const result = []
  const check = (name, pass, detail) => {
    assert.equal(Boolean(pass), true, detail || name)
    result.push({ name, pass: Boolean(pass), ...(detail ? { detail } : {}) })
  }

  try {
    check('more-menu-visible', await waitFor(`[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === '更多')`))
    await evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === '更多')?.click()`)
    check('official-plugins-menu-item-visible', await waitFor(`[...document.querySelectorAll('button, [role="menuitem"]')].some((item) => item.textContent.trim() === '插件')`))
    await evaluate(`[...document.querySelectorAll('button, [role="menuitem"]')].find((item) => item.textContent.trim() === '插件')?.click()`)
    check('model-settings-item-visible', await waitFor(`!!document.querySelector('[data-plugin-item="omnimux-model-settings"]')`))
    await evaluate(`document.querySelector('[data-plugin-item="omnimux-model-settings"] button')?.click()`)
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await sleep(500)
    check('catalog-sync-section-visible', await waitFor(`!!document.querySelector('[data-section="catalog-sync"]')`))
    check('model-groups-visible', await waitFor(`!!document.querySelector('[data-section="canvas-models"]')`))
    const observed = await evaluate(`(() => {
      const sync = document.querySelector('[data-section="catalog-sync"]')
      const card = document.querySelector('[data-section="canvas-models"]')
      return {
        syncText: sync?.textContent || '',
        modelRowCount: card?.querySelectorAll('.omnimux-models-card__row').length || 0,
        hasSyncButton: [...document.querySelectorAll('[data-section="catalog-sync"] button')]
          .some(button => button.textContent.includes('立即同步') || button.textContent.includes('Sync now')),
      }
    })()`)
    check('catalog-sync-button-visible', observed?.hasSyncButton === true, observed?.syncText)
    check('model-default-rows-rendered', Number(observed?.modelRowCount) >= 5, String(observed?.modelRowCount))
  } catch (error) {
    result.push({ name: 'journey-error', pass: false, detail: error instanceof Error ? error.message : String(error) })
  }
  return { assertions: result }
}
