// 真机旅程（#3811）：侧栏无「数字人」常驻行、官方「更多」菜单有「AI网红工作室」、点击可打开。
import assert from 'node:assert/strict'
import { join } from 'node:path'

export default async function (ctx) {
  const { send, sleep, evidenceDir, io } = ctx
  try {
    return await run({ send, sleep, evidenceDir, io })
  } catch (error) {
    try { io.writeFileSync(join(evidenceDir, 'journey-failure.txt'), String(error?.stack ?? error)) } catch {}
    throw error
  }
}

async function run({ send, sleep, evidenceDir, io }) {
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  const wait = async (expression, label) => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(expression)) return
      await sleep(200)
    }
    throw new Error('view not ready: ' + label)
  }
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    io.writeFileSync(join(evidenceDir, name + '.png'), Buffer.from(r.data, 'base64'))
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })

  // 1. 侧栏不得再有「数字人」常驻行（展开态）。
  await wait(`document.querySelectorAll('[data-omnimux-avatar-entry]').length === 0 || Boolean(document.querySelector('[class*="sidebarCol"]'))`, '侧栏就绪')
  await sleep(800)
  const rail = await evaluate(`(() => ({
    hasOldRow: Boolean(document.querySelector('[data-omnimux-avatar-entry]')),
    hasOldClass: Boolean(document.querySelector('.omnimux-avatar-entry')),
    rowLabels: [...document.querySelectorAll('.omnimux-sidebar-nav-entry')].map(el => (el.textContent || '').trim()),
  }))()`)
  assert.equal(rail.hasOldRow, false, '「数字人」常驻行必须已退役')
  assert.equal(rail.hasOldClass, false, '常驻行样式类不得残留')
  assert.ok(!rail.rowLabels.includes('数字人'), '侧栏行里不得再出现「数字人」，实际：' + JSON.stringify(rail.rowLabels))
  await shot('sidebar-no-avatar-row')

  // 2. 打开官方「更多」菜单。
  const opened = await evaluate(`(() => {
    const hit = [...document.querySelectorAll('button')].find(el => (el.textContent || '').trim() === '更多')
    if (!hit) return { ok: false, why: 'more-button-missing' }
    hit.click()
    return { ok: true }
  })()`)
  assert.equal(opened.ok, true, '官方「更多」按钮缺失：' + opened.why)
  await wait(`Boolean(document.querySelector('[role="menu"]'))`, '「更多」菜单展开')

  const menu = await evaluate(`(() => {
    const menu = document.querySelector('[role="menu"]')
    return {
      items: [...menu.querySelectorAll('[role="menuitem"], button')].map(el => (el.textContent || '').trim()).filter(Boolean),
    }
  })()`)
  assert.ok(menu.items.includes('AI网红工作室'), '「更多」菜单必须含「AI网红工作室」，实际：' + JSON.stringify(menu.items))
  assert.ok(!menu.items.includes('数字人'), '菜单里不得再出现旧名称')
  await shot('more-menu-with-avatar')

  // 3. 点击打开工作台。
  const clicked = await evaluate(`(() => {
    const menu = document.querySelector('[role="menu"]')
    const hit = [...menu.querySelectorAll('[role="menuitem"], button')].find(el => (el.textContent || '').trim() === 'AI网红工作室')
    if (!hit) return { ok: false, why: 'item-missing' }
    hit.click()
    return { ok: true }
  })()`)
  assert.equal(clicked.ok, true, '菜单项点击失败：' + clicked.why)
  await wait(`(() => {
    const page = document.querySelector('.omx-avatar-page')
    if (!page) return false
    const r = page.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })()`, 'AI网红工作室页面挂载')

  const page = await evaluate(`(() => ({
    title: (document.querySelector('.omx-avatar-head-title')?.textContent || '').trim(),
    tabTitles: [...document.querySelectorAll('[role="tab"]')].map(el => (el.textContent || '').trim()),
  }))()`)
  assert.equal(page.title, 'AI网红工作室', '页面标题必须是新名称，实际「' + page.title + '」')
  assert.ok(page.tabTitles.includes('AI网红工作室'), 'Tab 标题必须是新名称，实际：' + JSON.stringify(page.tabTitles))
  await shot('avatar-page-renamed')

  return {
    assertions: [
      { name: '侧栏不再有数字人常驻行', pass: true },
      { name: '更多菜单含AI网红工作室且无旧名称', pass: true },
      { name: '菜单点击可打开工作台', pass: true },
      { name: '页面标题与Tab标题同步改名', pass: true },
    ],
  }
}
