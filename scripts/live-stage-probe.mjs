import assert from 'node:assert/strict'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'

export const STAGE_ASSERTIONS = ['active-content-selection', 'idempotent-open', 'chat-clears-selection', 'restore']
export const PROBE_ASSERTIONS = ['initial-session-restored', 'initial-workbench-restored']

export function assertPng(bytes) {
  const data = Buffer.from(bytes)
  assert.ok(data.length > 32, 'Screenshot PNG is empty')
  let decoded
  try { decoded = PNG.sync.read(data, { checkCRC: true }) } catch (error) { throw new Error(`Screenshot PNG cannot decode: ${error.message}`) }
  assert.ok(decoded.width > 0 && decoded.height > 0, 'Screenshot PNG has empty dimensions')
  assert.equal(decoded.data.length, decoded.width * decoded.height * 4, 'Screenshot PNG pixels do not match dimensions')
  return { width: decoded.width, height: decoded.height }
}

export function saveProbeScreenshot(screenshot, destination) {
  if (screenshot instanceof Uint8Array || Buffer.isBuffer(screenshot)) {
    assertPng(screenshot); writeFileSync(destination, screenshot, { mode: 0o600 }); return destination
  }
  const source = typeof screenshot === 'string' ? screenshot : screenshot?.path || screenshot?.screenshot
  assert.ok(source, 'Missing stage screenshot')
  copyFileSync(source, destination)
  assertPng(readFileSync(destination))
  return destination
}

/** Runs in the page; only the real public workbench snapshot is accepted. */
export function readStageState(target, sidebarSelectors) {
  const wb = window.__omnimuxWorkbench
  const snapshot = wb?.getSnapshot()
  const context = wb?.getUiContext()
  const rendered = (node) => {
    if (node.closest('[aria-hidden="true"]')) return false
    for (let parent = node; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent)
      if (css.visibility === 'hidden' || css.display === 'none' || css.opacity === '0') return false
    }
    return true
  }
  const visible = (node) => {
    const box = node.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0 || box.right <= 0 || box.bottom <= 0 || box.left >= innerWidth || box.top >= innerHeight || !rendered(node)) return false
    const x = (Math.max(0, box.left) + Math.min(innerWidth, box.right)) / 2
    const y = (Math.max(0, box.top) + Math.min(innerHeight, box.bottom)) / 2
    const hit = document.elementFromPoint(x, y)
    return Boolean(hit && node.contains(hit))
  }
  const content = [...document.querySelectorAll(target.content)].filter(visible)
  const entries = target.selector ? [...document.querySelectorAll(target.selector)].filter(visible) : []
  const selected = sidebarSelectors.flatMap((selector) => [...document.querySelectorAll(selector)]
    .filter((node) => visible(node) && node.getAttribute('data-active') === 'true').map(() => selector))
  const layoutNodes = [document.getElementById('root'), ...entries, ...content].filter(Boolean)
  const hasVisible = (selector) => Boolean(selector && [...document.querySelectorAll(selector)].some(visible))
  const pendingStatus = target.status && content.some((node) => [...node.querySelectorAll(target.status)]
    .some((status) => rendered(status) && !target.allowedStatusTexts?.includes(status.textContent.trim())))
  return {
    sessionId: snapshot?.sessionId,
    hasState: Boolean(snapshot?.state),
    contextSessionId: context?.sessionId,
    activeTab: context?.surface?.tabId,
    active: Boolean(wb?.isActive(target.tabId)),
    openedTabs: context?.surface?.openedTabs?.map((tab) => tab.id) || [],
    panelOpen: snapshot?.state?.panelOpen,
    focus: context?.surface?.focus,
    sidebarCollapsed: Boolean(document.querySelector('[data-sidebar-collapsed="true"]')),
    layout: layoutNodes.map((node) => {
      const r = node.getBoundingClientRect()
      return [r.x, r.y, r.width, r.height]
    }),
    transitioning: layoutNodes.some((node) => {
      for (let parent = node; parent; parent = parent.parentElement) {
        if (parent.getAnimations().some((animation) => animation.playState === 'running')) return true
      }
      return false
    }),
    entryCount: entries.length, selected,
    contentCount: content.length,
    contentLength: content.reduce((length, node) => length + node.innerText.trim().length, 0),
    loadingOnly: Boolean(pendingStatus) || hasVisible(target.loading) || (content.length > 0 && content.every((node) => /^(加载中[.…]*|loading[.…]*)$/i.test(node.innerText.trim()))),
    visibleErrors: content.flatMap((node) => [...(node.closest('[role="region"]') || node).querySelectorAll(['[role="alert"]', '[data-error]', '[class$="-error"]', target.error].filter(Boolean).join(','))])
      .filter((node) => visible(node) && node.innerText.trim()).length,
  }
}

export function assertStageState(state, target, sessionId) {
  assert.ok(state.hasState && state.sessionId, 'Missing real session/workbench snapshot; select a workspace and open a QA session first')
  assert.equal(state.sessionId, sessionId, 'Active session changed during the probe')
  assert.equal(state.contextSessionId, sessionId, 'Viewport context belongs to another session')
  if (target.adapter !== 'community-tab') assert.equal(state.entryCount, 1, `${target.stage}: missing or duplicate sidebar entry`)
  assert.ok(state.panelOpen && state.active, `${target.stage}: sidebar click did not activate the Tab`)
  assert.equal(state.activeTab, target.tabId, `${target.stage}: wrong active Tab`)
  if (target.adapter === 'community-tab') {
    assert.equal(state.selected?.length, 0, `${target.stage}: community Tab must not claim a sidebar Stage`)
    assert.equal(state.openedTabs?.filter(id => id === target.tabId).length, 1, `${target.stage}: community Tab must be uniquely opened`)
  } else assert.ok(state.selected?.length === 1 && state.selected[0] === target.selector, `${target.stage}: sidebar selection must be unique`)
  assert.equal(state.contentCount, 1, `${target.stage}: content root missing, hidden or duplicated`)
  assert.ok(state.contentLength > 0 && !state.loadingOnly, `${target.stage}: empty or loading-only content`)
  assert.equal(state.visibleErrors, 0, `${target.stage}: visible content error`)
}

/** Browser operations are passed by the selected transport adapter. */
export async function runStageProbe(browser, { targets, sidebarSelectors = targets.map((t) => t.selector).filter(Boolean), evidenceDir, onProgress = () => {} }) {
  assert.ok(targets.length > 0, 'Zero stage targets')
  const result = { targets: [], assertions: [], screenshots: [] }
  const record = (name, pass, detail) => {
    result.assertions.push({ name, pass, detail, at: new Date().toISOString() })
    onProgress(result)
    assert.ok(pass, `${name}: ${detail}`)
  }
  const read = (target) => browser.js(`(${readStageState.toString()})(${JSON.stringify(target)}, ${JSON.stringify(sidebarSelectors)})`)
  const until = async (predicate, message) => {
    const deadline = Date.now() + 12_000
    while (Date.now() < deadline) {
      if (await predicate()) return
      await new Promise((done) => setTimeout(done, 150))
    }
    throw new Error(message)
  }
  await until(() => browser.js('Boolean(window.__omnimuxWorkbench?.getSnapshot()?.sessionId)'), 'No active QA session; select a workspace and create/open a session before verify:live')
  const initial = await read(targets[0])
  const initialTabs = new Set(initial.openedTabs)
  const waitForStage = async (target) => {
    let last
    let previousLayout
    let lastAssertionError
    await until(async () => {
      last = await read(target)
      assert.equal(last.sessionId, initial.sessionId, 'Active session changed; stop UI operations')
      // AppFrame may auto-collapse the rail when GUI focus shrinks its own box.
      if (last.panelOpen && last.active && last.sidebarCollapsed) {
        await browser.click('button[aria-label="打开侧边栏"]')
        previousLayout = undefined
        return false
      }
      const layout = JSON.stringify(last.layout)
      const stable = !last.transitioning && layout === previousLayout
      previousLayout = layout
      try {
        assertStageState(last, target, initial.sessionId)
        lastAssertionError = null
        return stable
      } catch (error) {
        lastAssertionError = error
        return false
      }
    }, `${target.stage}: visible Stage assertions did not settle`).catch((error) => {
      throw new Error(`${error.message}; last assertion: ${lastAssertionError?.message || 'layout still changing'}; state: ${JSON.stringify(last)}`)
    })
  }
  const clickEntry = async (target) => {
    assert.equal((await read(target)).sessionId, initial.sessionId, 'Active session changed; stop UI operations')
    if (target.adapter === 'community-tab') {
      await browser.js(`(async () => {
        const wb = window.__omnimuxWorkbench;
        if (wb.getSnapshot()?.sessionId !== ${JSON.stringify(initial.sessionId)}) throw new Error('Active session changed; stop UI operations');
        const service = await wb.waitForService();
        if (!service.getTab(${JSON.stringify(target.tabId)})) throw new Error('Community Tab is not registered');
        await wb.open({tabId: ${JSON.stringify(target.tabId)}});
      })()`)
      return
    }
    if (await browser.js('Boolean(document.querySelector(\'[data-sidebar-collapsed="true"]\'))')) {
      await browser.click('button[aria-label="打开侧边栏"]')
    }
    let previous
    await until(async () => {
      const box = await browser.js(`(() => { const node=document.querySelector(${JSON.stringify(target.selector)}); if(!node) return null; const r=node.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; })()`)
      const stable = box && box[2] > 0 && box[3] > 0 && JSON.stringify(box) === JSON.stringify(previous)
      previous = box
      return stable && (await read(target)).entryCount === 1
    }, `${target.stage}: sidebar entry geometry is not stable`)
    assert.equal((await read(target)).sessionId, initial.sessionId, 'Active session changed; stop UI operations')
    await browser.click(target.selector)
  }
  try {
    for (const target of targets) {
      if (target.adapter !== 'community-tab') await browser.waitForElement(target.selector, { timeout: 12 })
      await clickEntry(target)
      await waitForStage(target)
      const state = await read(target)
      assertStageState(state, target, initial.sessionId)
      record(`${target.stage}:active-content-selection`, true, state)
      if (result.targets.length) {
        const previous = result.targets.at(-1)
        record(`${target.stage}:tabs-coexist`, state.openedTabs.includes(previous.tabId), previous.tabId)
      }
      await clickEntry(target)
      await waitForStage(target)
      const repeated = await read(target)
      assertStageState(repeated, target, initial.sessionId)
      record(`${target.stage}:idempotent-open`, repeated.openedTabs.filter((id) => id === target.tabId).length === 1, target.tabId)
      const screenshot = await browser.captureScreenshot()
      assertStageState(await read(target), target, initial.sessionId)
      const destination = join(evidenceDir, `${target.stage}.png`)
      saveProbeScreenshot(screenshot, destination)
      result.screenshots.push(destination)
      result.targets.push({ stage: target.stage, tabId: target.tabId })
      onProgress(result)
      await browser.js(`(() => {
        const wb = window.__omnimuxWorkbench;
        if (wb.getSnapshot()?.sessionId !== ${JSON.stringify(initial.sessionId)}) throw new Error('Active session changed; stop UI operations');
        wb.closePanel();
      })()`)
      await until(async () => !(await read(target)).panelOpen, `${target.stage}: panel failed to close`)
      const closed = await read(target)
      record(`${target.stage}:chat-clears-selection`, !closed.active && closed.selected.length === 0 && closed.openedTabs.includes(target.tabId), closed)
      await clickEntry(target)
      await waitForStage(target)
      assertStageState(await read(target), target, initial.sessionId)
      record(`${target.stage}:restore`, true, target.tabId)
    }
    return result
  } catch (error) {
    result.assertions.push({ name: 'browser-probe', pass: false, detail: error.message, at: new Date().toISOString() })
    onProgress(result)
    throw error
  } finally {
    const restored = await browser.js(`(async () => {
      const wb = window.__omnimuxWorkbench;
      const service = await wb.waitForService();
      const scope = {sessionId: ${JSON.stringify(initial.sessionId)}};
      if (wb.getSnapshot()?.sessionId !== scope.sessionId) return false;
      for (const tab of ${JSON.stringify(targets.filter((t) => !initialTabs.has(t.tabId)).map((t) => t.tabId))}) service.closeTab(tab, scope);
      if (${JSON.stringify(initial.activeTab || null)}) service.activateTab(${JSON.stringify(initial.activeTab || null)}, scope);
      wb.setFocus(${JSON.stringify(initial.focus || 'chat')});
      return true;
    })()`)
    record('initial-session-restored', restored, 'Restoration is forbidden after a session change')
    if (initial.sidebarCollapsed && !(await browser.js('Boolean(document.querySelector(\'[data-sidebar-collapsed="true"]\'))'))) {
      assert.equal((await read(targets[0])).sessionId, initial.sessionId, 'Active session changed; stop UI operations')
      await browser.click('button[aria-label="收起侧边栏"]')
    }
    const after = await read(targets[0])
    record('initial-workbench-restored', after.sessionId === initial.sessionId
      && (after.activeTab || null) === (initial.activeTab || null)
      && after.focus === initial.focus
      && JSON.stringify([...after.openedTabs].sort()) === JSON.stringify([...initialTabs].sort()), after)
  }
}
