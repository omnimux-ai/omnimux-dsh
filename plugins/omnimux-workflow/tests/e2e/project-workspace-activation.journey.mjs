/**
 * 旅程：初始化状态创建第一个项目，验证「项目 = 工作区 = 会话 cwd」且画布自动出现。
 *
 * 运行：node scripts/worktree-app-qa.mjs --mode=ui \
 *   --journey=plugins/omnimux-workflow/tests/e2e/project-workspace-activation.journey.mjs
 * 证据：docs/evidence/2026-11-11-project-workspace-activation/
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

async function waitFor(send, expression, { timeoutMs = 15000, intervalMs = 150 } = {}) {
  const started = Date.now()
  let last
  while (Date.now() - started < timeoutMs) {
    last = await evaluate(send, expression)
    if (last) return last
    await sleepMs(intervalMs)
  }
  return last
}

export default async ({ send, evidenceDir, io }) => {
  const title = `QA 初始化项目 ${Date.now()}`

  const openedLibrary = await waitFor(send, `(() => {
    const entry = document.querySelector('[data-dsh-omnimux-workflow-entry], .omnimux-workflow-entry')
    if (entry) { entry.click(); return true }
    window.__omnimuxWorkbench?.open?.({ tabId: 'omnimux-workflow:library', title: '项目' })
    return Boolean(document.querySelector('.omnimux-workflow-library-body'))
  })()`)
  assert.equal(openedLibrary, true, '项目库必须能打开')

  const baseline = await waitFor(send, `(() => {
    const body = document.querySelector('.omnimux-workflow-library-body')
    if (!body) return false
    return {
      cards: document.querySelectorAll('.omnimux-folder').length,
      canvasTabs: document.querySelectorAll('[data-omnimux-canvas-tab]').length,
      legacyCache: localStorage.getItem('omnimux:latest-active-canvas'),
    }
  })()`)
  io.writeFileSync(`${evidenceDir}/activation-baseline.json`, JSON.stringify({ title, baseline }, null, 2))
  assert.equal(baseline?.cards, 0, '初始化状态的项目库必须为空')
  assert.equal(baseline?.canvasTabs, 0, '初始化状态不得有任何创作画布 tab')

  const submitted = await waitFor(send, `(() => {
    const row = document.querySelector('.omnimux-workflow-library-action-row')
    const button = row && [...row.querySelectorAll('button')].find((item) => item.textContent.trim() === '新建项目')
    if (!button) return false
    button.click()
    return true
  })()`)
  assert.equal(submitted, true, '项目库必须有「新建项目」入口')

  const filled = await waitFor(send, `(() => {
    const input = document.querySelector('#omnimux-new-local-project-name')
    if (!input) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(title)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return input.value === ${JSON.stringify(title)}
  })()`)
  assert.equal(filled, true, '新建项目弹窗必须能填名称')

  const confirmed = await evaluate(send, `(() => {
    const dialog = document.querySelector('[role="dialog"]')
    const button = dialog && [...dialog.querySelectorAll('button')].find((item) => item.textContent.trim() === '创建项目')
    if (!button || button.disabled) return false
    button.click()
    return true
  })()`)
  assert.equal(confirmed, true, '新建项目弹窗必须能提交')

  await waitFor(send, `(async () => {
    const res = await fetch('/omnimux-workflow/api/projects')
    const body = await res.json()
    return Boolean((body.projects || []).find((item) => item.title === ${JSON.stringify(title)}))
  })()`, { timeoutMs: 30000 })
  await sleepMs(3000)
  const diag = await evaluate(send, `(async () => {
    const res = await fetch('/omnimux-workflow/api/projects')
    const body = await res.json()
    const project = (body.projects || []).find((item) => item.title === ${JSON.stringify(title)}) || null
    const tab = document.querySelector('[data-omnimux-canvas-tab]')
    const host = document.querySelector('[data-omnimux-canvas-tab] .omnimux-workflow-canvas-root')
    const loading = document.querySelector('[data-omnimux-canvas-tab] .omnimux-workflow-canvas-loading')
    const ws = window.__omnimuxWorkflow?.workspaces?.list?.getSnapshot?.()
    const workspaces = ws?.items || ws?.workspaces || []
    const snapshot = window.__omnimuxWorkflow?.sessions?.list?.getSnapshot?.()
    const rows = Object.values(snapshot?.byId || {})
    const sessionId = snapshot?.current || null
    const session = rows.find((row) => project?.path && row?.cwd === project.path) || null
    return {
      projectPath: project?.path || null,
      pages: project?.pages?.length ?? null,
      projectKeys: project ? Object.keys(project).sort() : [],
      workspacePaths: workspaces.map((item) => item.path),
      workspaceMatched: Boolean(project?.path && workspaces.some((item) => item.path === project.path)),
      sessionId: sessionId || null,
      sessionCwd: session?.cwd || null,
      sessionCount: rows.length,
      cwdMatches: Boolean(session && project && session.cwd === project.path),
      tabVisible: tab?.getAttribute('data-visible') || null,
      hostPresent: Boolean(host),
      loading: Boolean(loading),
      errorBanner: document.querySelector('.omnimux-workflow-library-error')?.textContent?.trim() || '',
    }
  })()`)
  const ready = diag && diag.workspaceMatched && diag.cwdMatches && diag.tabVisible === 'true' && !diag.loading
  io.writeFileSync(`${evidenceDir}/activation-result.json`, JSON.stringify({ title, ready, diag }, null, 2))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  io.writeFileSync(`${evidenceDir}/activation-project-canvas.png`, Buffer.from(shot.data, 'base64'))


  assert.equal(diag?.workspaceMatched, true, '项目必须登记为工作区')
  assert.equal(diag?.cwdMatches, true, '必须存在 cwd 等于项目路径的会话')
  assert.equal(diag?.tabVisible, 'true', '新建项目后创作画布必须可见')

  return {
    assertions: [
      { name: 'library-empty-in-initial-state', pass: baseline?.cards === 0 && baseline?.canvasTabs === 0 },
      { name: 'project-created-through-ui', pass: Boolean(diag?.projectPath) },
      { name: 'project-registered-as-workspace', pass: diag?.workspaceMatched === true },
      { name: 'session-cwd-equals-project-path', pass: diag?.cwdMatches === true },
      { name: 'canvas-tab-visible-after-create', pass: diag?.tabVisible === 'true' },
    ],
  }
}