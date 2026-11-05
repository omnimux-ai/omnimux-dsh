/**
 * 功能旅程：项目库 → 创作页卡片 → 主区切会话 → 右侧画布出现（Issue #3928）。
 *
 * 修复前：sessions.open 在 DSH 0.1.7 已移除，点击只更新项目中「活跃创作页」，
 * 会话不切；画布 tab 又被右栏按「非前台会话」拒绝，界面毫无变化。
 * 这里按真实用户路径点击，断言「会话切过去 + 画布 tab 可见并挂载」。
 */
import assert from 'node:assert/strict'

const sleepMs = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

async function evaluate(send, expression) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response?.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'evaluate failed')
  }
  return response?.result?.value
}

async function waitFor(send, expression, { timeoutMs = 8000, intervalMs = 150 } = {}) {
  const started = Date.now()
  let last
  while (Date.now() - started < timeoutMs) {
    last = await evaluate(send, expression)
    if (last) return last
    await sleepMs(intervalMs)
  }
  return last
}

export default async ({ send, sleep, evidenceDir, io }) => {
  const title = `QA 打开创作页 ${Date.now()}`
  // 页面 console.error 是 handleOpenPage「静默失败」的唯一现场，一并留证。
  await evaluate(send, `(() => {
    window.__qaConsole = []
    if (!window.__qaConsoleHooked) {
      window.__qaConsoleHooked = true
      const original = console.error
      console.error = (...args) => {
        try { window.__qaConsole.push(args.map((item) => (item && item.message) || String(item))) } catch {}
        return original.apply(console, args)
      }
    }
    return true
  })()`)

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
  assert.equal(project?.pages?.length, 1, '种子项目必须自带一个创作页')

  const entryOpened = await waitFor(send, `(() => {
    const entry = document.querySelector('[data-dsh-omnimux-workflow-entry], .omnimux-workflow-entry')
    if (entry) {
      entry.click()
      return true
    }
    window.__omnimuxWorkbench?.open?.({ tabId: 'omnimux-workflow:library', title: '项目' })
    return Boolean(document.querySelector('.omnimux-workflow-library-page'))
  })()`, { timeoutMs: 12000 })
  assert.equal(entryOpened, true, '必须能打开项目库（侧栏入口或 workbench 缝）')

  const folderClicked = await waitFor(send, `(() => {
    const card = document.querySelector('.omnimux-folder-open[aria-label=${JSON.stringify(title)}]')
    if (!card) return false
    card.click()
    return true
  })()`, { timeoutMs: 10000 })
  assert.equal(folderClicked, true, '新建的项目文件夹卡片必须出现并可进入')

  const pageClicked = await waitFor(send, `(() => {
    const card = document.querySelector('.omnimux-page-card .omnimux-page-open')
    if (!card) return false
    card.click()
    return true
  })()`, { timeoutMs: 10000 })
  assert.equal(pageClicked, true, '项目详情必须渲染创作页卡片')

  // 点卡片后：项目绑定会话 → 主区切过去 → 右栏 seat 挂载 → 画布 tab 出现并挂载画布。
  // 这些步骤跨多个异步阶段（PATCH 绑定、会话挂载、右栏 seat、画布岛），整体轮询到最终一致。
  const settled = await waitFor(send, `(async () => {
    const res = await fetch('/omnimux-workflow/api/projects/${project.id}')
    const body = await res.json()
    const boundSessionId = body?.project?.sessionId || null
    const tab = document.querySelector('[data-omnimux-canvas-tab]')
    const currentSessionId = window.__omnimuxWorkbench?.getSnapshot?.()?.sessionId ?? null
    const host = document.querySelector('[data-omnimux-canvas-tab] .omnimux-workflow-canvas-root')
    // 只出现空挂载容器不算打开完成：画布岛渲染出节点、且 loading 占位消失才算。
    const islandMounted = Boolean(host && host.childElementCount > 0)
    const stillLoading = Boolean(document.querySelector('[data-omnimux-canvas-tab] .omnimux-workflow-canvas-loading'))
    const selection = (() => {
      try {
        const store = localStorage.getItem('dsh.sessions.current')
        return store ? JSON.parse(store)?.sessionId ?? null : null
      } catch {
        return null
      }
    })()
    const ready = Boolean(boundSessionId)
      && currentSessionId === boundSessionId
      && selection === boundSessionId
      && tab?.getAttribute('data-visible') === 'true'
      && islandMounted
      && !stillLoading
      && (window.__qaConsole || []).length === 0
    return ready ? { boundSessionId, currentSessionId, selection, islandMounted } : false
  })()`, { timeoutMs: 20000 })

  const state = await evaluate(send, `(async () => {
    const res = await fetch('/omnimux-workflow/api/projects/${project.id}')
    const body = await res.json()
    return {
      boundSessionId: body?.project?.sessionId || null,
      currentSessionId: window.__omnimuxWorkbench?.getSnapshot?.()?.sessionId ?? null,
      canvasTabs: document.querySelectorAll('[data-omnimux-canvas-tab]').length,
      canvasVisible: document.querySelector('[data-omnimux-canvas-tab]')?.getAttribute('data-visible') || null,
      canvasRoot: Boolean(document.querySelector('[data-omnimux-canvas-tab] .omnimux-workflow-canvas-root')?.childElementCount),
      canvasLoading: Boolean(document.querySelector('[data-omnimux-canvas-tab] .omnimux-workflow-canvas-loading')),
      errorText: (document.querySelector('.omnimux-workflow-library-error')?.textContent || '').trim(),
      consoleErrors: (window.__qaConsole || []).slice(-10),
    }
  })()`)
  io.writeFileSync(`${evidenceDir}/open-page-state.json`, JSON.stringify({ title, projectId: project.id, settled, state }, null, 2))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  io.writeFileSync(`${evidenceDir}/project-page-open-canvas.png`, Buffer.from(shot.data, 'base64'))

  assert.ok(settled?.boundSessionId, '点击创作页后项目必须绑定会话')
  assert.equal(settled?.currentSessionId, settled?.boundSessionId, '主区必须切到项目会话')
  assert.equal(state?.canvasVisible, 'true', '点击创作页后画布 tab 必须可见')
  assert.equal(state?.canvasRoot, true, '画布 tab 必须挂载画布宿主且画布岛已渲染')
  assert.equal(state?.canvasLoading, false, '画布加载占位必须消失')
  assert.equal(state?.errorText, '', '打开成功时不得出现页面错误横幅')
  assert.deepEqual(state?.consoleErrors, [], '打开链路不得产生 console.error')

  return {
    assertions: [
      { name: 'project-seeded', pass: seed?.status === 200 && project?.pages?.length === 1 },
      { name: 'session-switched-to-project', pass: Boolean(settled?.boundSessionId) && settled?.currentSessionId === settled?.boundSessionId },
      { name: 'canvas-tab-visible', pass: state?.canvasVisible === 'true' },
      { name: 'canvas-host-mounted', pass: state?.canvasRoot === true && state?.canvasLoading === false },
      { name: 'no-visible-error-banner', pass: state?.errorText === '' },
    ],
  }
}
