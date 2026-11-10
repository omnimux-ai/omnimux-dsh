export default async function stagedSaveJourney({ send, sleep, evidenceDir, io }) {
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
  const result = []
  const check = (name, pass, detail) => {
    result.push({ name, pass: Boolean(pass), ...(detail ? { detail } : {}) })
  }
  try {
    check('more-menu-visible', await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '更多')`))
    await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '更多')?.click()`)
    check('plugins-menu-item-visible', await waitFor(`[...document.querySelectorAll('button, [role="menuitem"]')].some((b) => b.textContent.trim() === '插件')`))
    await evaluate(`[...document.querySelectorAll('button, [role="menuitem"]')].find((b) => b.textContent.trim() === '插件')?.click()`)
    check('omnimux-card-visible', await waitFor(`!!document.querySelector('[data-plugin-package="omnimux"]')`))
    await evaluate(`(() => {
      const card = document.querySelector('[data-plugin-package="omnimux"]')
      const open = card ? [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === 'omnimux') : null
      open?.click()
    })()`)
    check('omnimux-detail-visible', await waitFor(`!!document.querySelector('[data-plugin-detail="omnimux"]')`))
    check('reasoning-select-visible', await waitFor(`!!document.querySelector('#omnimux-defaultTextReasoning')`))
    const before = await evaluate(`(() => ({
      value: document.querySelector('#omnimux-defaultTextReasoning')?.textContent?.trim() || '',
      savebar: !!document.querySelector('.omnimux-settings-savebar'),
    }))()`)
    check('no-savebar-before-edit', before.savebar === false, JSON.stringify(before))
    await evaluate(`document.querySelector('#omnimux-defaultTextReasoning')?.click()`)
    check('reasoning-menu-visible', await waitFor(`document.querySelectorAll('[role="menuitem"]').length > 1`))
    const picked = await evaluate(`(() => {
      const current = document.querySelector('#omnimux-defaultTextReasoning')?.textContent?.trim() || ''
      const labels = new Set(['低', '中', '高', '最高', 'Low', 'Medium', 'High', 'Max'])
      const items = [...document.querySelectorAll('[role="menuitem"]')]
      const target = items.find((item) => labels.has(item.textContent.trim()) && item.textContent.trim() !== current)
      const label = target?.textContent?.trim() || ''
      target?.click()
      return label
    })()`)
    check('reasoning-option-picked', typeof picked === 'string' && picked.length > 0, String(picked))
    check('savebar-visible-after-edit', await waitFor(`!!document.querySelector('.omnimux-settings-savebar')`))
    const afterEdit = await evaluate(`(() => ({
      label: document.querySelector('.omnimux-settings-savebar__label')?.textContent || '',
      stillDetail: !!document.querySelector('[data-plugin-detail="omnimux"]'),
      value: document.querySelector('#omnimux-defaultTextReasoning')?.textContent?.trim() || '',
    }))()`)
    if (evidenceDir && io?.writeFileSync) io.writeFileSync(`${evidenceDir}/debug-after-edit.json`, JSON.stringify({ before, picked, afterEdit }, null, 2))
    check('savebar-copy', afterEdit.label.includes('未保存') || afterEdit.label.includes('Unsaved'), JSON.stringify(afterEdit))
    check('page-does-not-reload-on-edit', afterEdit.stillDetail === true && afterEdit.value !== before.value, JSON.stringify({ before, afterEdit, picked }))
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    if (screenshot?.data && evidenceDir && io?.writeFileSync) io.writeFileSync(`${evidenceDir}/staged-save-dirty.png`, Buffer.from(screenshot.data, 'base64'))
    await evaluate(`(() => {
      const bar = document.querySelector('.omnimux-settings-savebar')
      const save = bar ? [...bar.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存' || b.textContent.trim() === 'Save') : null
      save?.click()
    })()`)
    const cleared = await waitFor(`!document.querySelector('.omnimux-settings-savebar')`, 30000)
    const afterSave = await evaluate(`(() => ({
      url: location.href,
      bar: !!document.querySelector('.omnimux-settings-savebar'),
      label: document.querySelector('.omnimux-settings-savebar__label')?.textContent || '',
      detail: !!document.querySelector('[data-plugin-detail="omnimux"]'),
      text: document.body.innerText.slice(0, 120),
    }))()`)
    result.push({ name: 'savebar-cleared-after-save', pass: Boolean(cleared), detail: JSON.stringify(afterSave) })
    const detailMounted = await waitFor(`!!document.querySelector('[data-plugin-detail="omnimux"]')`, 30000)
    result.push({ name: 'detail-still-mounted-after-save', pass: Boolean(detailMounted), detail: JSON.stringify(afterSave) })
  } catch (error) {
    result.push({ name: 'journey-error', pass: false, detail: error instanceof Error ? error.message : String(error) })
  }
  return { assertions: result }
}
