/**
 * 功能旅程：项目库 → 创作页 → 三栏可见（RC 右栏多会话挂载适配）。
 *
 * 修复前：上一个会话的隐藏右栏面板仍带 `data-sidebar-right-panel="fullscreen"`，
 * `host-fullscreen` 误判当前会话全屏，持续折叠中间会话栏；画布虽打开，中间栏却是空白。
 * 本旅程断言打开创作页后折叠键不存在、中间会话列宽 > 0 且不透明。
 */
import assert from 'node:assert/strict'

const sleepMs = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

async function evaluate(send, expression) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response?.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'evaluate failed')
  return response?.result?.value
}

async function waitFor(send, expression, { timeoutMs = 10000, intervalMs = 150 } = {}) {
  const started = Date.now()
  let last
  while (Date.now() - started < timeoutMs) {
    last = await evaluate(send, expression)
    if (last) return last
    await sleepMs(intervalMs)
  }
  return last
}

async function dismissRuntimeGuide(send) {
  await waitFor(send, `(() => {
    const candidates = [...document.querySelectorAll('button, a, [role="button"]')]
    const hit = candidates.find((el) => /Set up later|稍后在设置中|稍后设置/i.test((el.textContent || '').trim()))
    if (!hit) return false
    hit.click()
    return true
  })()`, { timeoutMs: 8000 })
  await sleepMs(800)
}

export default async ({ send, sleep, evidenceDir, io }) => {
  await dismissRuntimeGuide(send)

  const title = `QA 三栏可见 ${Date.now()}`
  const seed = await evaluate(send, `(async () => {
    const res = await fetch('/omnimux-workflow/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: ${JSON.stringify(title)} }),
    })
    return { status: res.status, body: await res.json() }
  })()`)
  io.writeFileSync(`${evidenceDir}/seed-project.json`, JSON.stringify(seed, null, 2))
  assert.equal(seed?.status, 200, '种子项目必须创建成功')
  const project = seed?.body?.project
  assert.ok(project?.id, '种子项目必须返回 id')

  const entryOpened = await waitFor(send, `(() => {
    const entry = document.querySelector('[data-dsh-omnimux-workflow-entry], .omnimux-workflow-entry')
    if (entry) { entry.click(); return true }
    window.__omnimuxWorkbench?.open?.({ tabId: 'omnimux-workflow:library', title: '项目' })
    return Boolean(document.querySelector('.omnimux-workflow-library-page'))
  })()`, { timeoutMs: 12000 })
  assert.equal(entryOpened, true, '必须能打开项目库')

  const folderClicked = await waitFor(send, `(() => {
    const card = document.querySelector('.omnimux-folder-open[aria-label=${JSON.stringify(title)}]')
    if (!card) return false
    card.click()
    return true
  })()`, { timeoutMs: 10000 })
  assert.equal(folderClicked, true, '项目文件夹卡片必须出现并可进入')

  const pageClicked = await waitFor(send, `(() => {
    const card = document.querySelector('.omnimux-page-card .omnimux-page-open')
    if (!card) return false
    card.click()
    return true
  })()`, { timeoutMs: 10000 })
  assert.equal(pageClicked, true, '项目详情必须渲染创作页卡片')

  const settled = await waitFor(send, `(async () => {
    const res = await fetch('/omnimux-workflow/api/projects/${project.id}')
    const body = await res.json()
    const boundSessionId = body?.project?.sessionId || null
    const tab = document.querySelector('[data-omnimux-canvas-tab]')
    const center = document.querySelector('[class*="centerCol"]')
    if (!boundSessionId || !tab || !center) return false
    const style = getComputedStyle(center)
    const rect = center.getBoundingClientRect()
    const visible = rect.width > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
      && !document.documentElement.hasAttribute('data-omnimux-conversation-collapsed')
    const host = tab.querySelector('.omnimux-workflow-canvas-root')
    const islandMounted = Boolean(host && host.childElementCount > 0)
    const stillLoading = Boolean(tab.querySelector('.omnimux-workflow-canvas-loading'))
    return visible && tab.getAttribute('data-visible') === 'true' && islandMounted && !stillLoading
      ? { boundSessionId, width: Math.round(rect.width), islandMounted }
      : false
  })()`, { timeoutMs: 20000 })

  const state = await evaluate(send, `(() => {
    const center = document.querySelector('[class*="centerCol"]')
    const style = center ? getComputedStyle(center) : null
    const rect = center ? center.getBoundingClientRect() : null
    return {
      collapsed: document.documentElement.hasAttribute('data-omnimux-conversation-collapsed'),
      center: center ? { width: Math.round(rect.width), opacity: style.opacity, visibility: style.visibility } : null,
      canvasVisible: document.querySelector('[data-omnimux-canvas-tab]')?.getAttribute('data-visible') || null,
      currentSessionId: window.__omnimuxWorkbench?.getSnapshot?.()?.sessionId ?? null,
      rightbarOpen: document.documentElement.getAttribute('data-omnimux-rightbar-open'),
      rightbarFullscreen: document.documentElement.getAttribute('data-omnimux-rightbar-fullscreen'),
      middleTextLength: center ? (center.innerText || '').trim().length : 0,
    }
  })()`)
  io.writeFileSync(`${evidenceDir}/three-column-state.json`, JSON.stringify({ title, projectId: project.id, settled, state }, null, 2))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  io.writeFileSync(`${evidenceDir}/project-page-three-column.png`, Buffer.from(shot.data, 'base64'))

  assert.ok(settled?.boundSessionId, '点击创作页后项目必须绑定会话')
  assert.equal(state?.currentSessionId, settled?.boundSessionId, '当前会话必须是项目绑定的会话')
  assert.equal(state?.collapsed, false, '中间会话栏不得处于折叠态')
  assert.ok(state?.center?.width > 0, '中间会话栏必须有可见宽度')
  assert.notEqual(state?.center?.opacity, '0', '中间会话栏不得透明')
  assert.ok(state?.middleTextLength > 0, '中间会话栏必须渲染出会话内容/输入区')
  assert.equal(state?.canvasVisible, 'true', '画布 tab 必须可见')
  assert.equal(state?.rightbarOpen, 'true', '右栏状态镜像必须标记当前会话已展开')
  assert.notEqual(state?.rightbarFullscreen, 'true', '当前画布是分栏态，不得镜像为全屏')

  return {
    assertions: [
      { name: 'project-seeded', pass: seed?.status === 200 && Boolean(project?.id) },
      { name: 'project-page-opened', pass: Boolean(settled?.boundSessionId) },
      { name: 'middle-column-visible', pass: state?.currentSessionId === settled?.boundSessionId && state?.collapsed === false && state?.center?.width > 0 && state?.center?.opacity !== '0' && state?.middleTextLength > 0 },
      { name: 'canvas-visible', pass: state?.canvasVisible === 'true' && Boolean(settled?.islandMounted) },
    ],
  }
}
