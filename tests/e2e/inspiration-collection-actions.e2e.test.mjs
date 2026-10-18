/**
 * Issue #3411 — collection card hover actions: real-browser regression.
 *
 * Reuses the existing real fixture (`inspiration-collections.fixture.mjs`: product
 * `InspirationSection` bundle, production local handlers/store, dynamic loopback
 * server) and the existing CDP driver (`inspiration-collections.browser.mjs`).
 * The host seams are page-injected stubs (`__omnimuxWorkbench`,
 * `__omnimuxSessionPrefill`) plus a synthetic conversation column; this is not a
 * full Host install.
 *
 * Live precondition: the browser evidence in
 * `docs/evidence/2026-10-18-inspiration-collection-actions-3411/` (browser.json +
 * hover-actions / view-collection / add-to-session / draft-protected PNGs,
 * 1600x1100) from the stage-2 run, inspected before this regression was added.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { assertPng } from '../../scripts/worktree-web-qa.mjs'
import { startInspirationCollectionsFixture } from './inspiration-collections.fixture.mjs'
import { startCollectionsBrowser } from './inspiration-collections.browser.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const LOCAL = '/omnimux/inspiration/local'
const COLLECTION_TITLE = '测试合集'
const ITEM_IDS = ['qa-dance1', 'qa-dance2', 'qa-fashion1']
const SESSION_ID = 'qa-session-1'
const DRAFT_PROTECTED = '输入框已有内容，请先清空或新建会话后重试'
const SENTINEL_DRAFT = '用户既有草稿（QA 哨兵）'
const livePrecondition = 'Issue #3411: docs/evidence/2026-10-18-inspiration-collection-actions-3411/browser.json + 4 decodable 1600x1100 PNGs (hover-actions, view-collection, add-to-session, draft-protected), stage-2 run 15/15 assertions, inspected before this regression was added.'

async function settle(browser) {
  await browser.wait(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect()
      return rect.bottom > 0 && rect.top < innerHeight && rect.width > 0
    }
    return Array.from(document.querySelectorAll('[data-inspiration-id] img')).filter(visible).every(image => image.complete && image.naturalWidth > 0)
      && Array.from(document.querySelectorAll('.omnimux-inspiration-card-shimmer')).filter(visible).every(element => Number(getComputedStyle(element).opacity) <= 0.01)
  })
}

function makeCapture(browser, evidenceDir, report) {
  return async name => {
    const shot = await browser.send('Page.captureScreenshot', { format: 'png' })
    const bytes = Buffer.from(shot.data, 'base64')
    const dimensions = assertPng(bytes)
    assert.equal(dimensions.width, 1600)
    assert.equal(dimensions.height, 1100)
    writeFileSync(join(evidenceDir, name + '.png'), bytes)
    const record = { name: name + '.png', width: dimensions.width, height: dimensions.height, bytes: bytes.length }
    report.screenshots.push(record)
    return record
  }
}

async function createCollection(fixture) {
  const response = await fetch(fixture.origin + LOCAL + '/collections', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: COLLECTION_TITLE, item_ids: ITEM_IDS }),
  })
  const body = await response.json()
  assert.equal(response.status, 201)
  assert.equal(body.data.title, COLLECTION_TITLE)
  assert.deepEqual(body.data.item_ids, ITEM_IDS)
  return body.data
}

async function openLocalTab(browser, origin, collectionId) {
  await browser.send('Page.navigate', { url: origin })
  await browser.wait(() => Boolean(document.querySelector('[role="tab"]')))
  await browser.clickText('灵感库', '[role="tab"]')
  await browser.wait(id => Boolean(document.querySelector('[data-collection-id="' + id + '"]')), collectionId)
  await settle(browser)
}

/** Synthetic host seams; installed before any action is triggered. */
async function installHostStubs(browser) {
  const installed = await browser.evaluate(() => {
    const style = document.createElement('style')
    style.id = 'qa-host-style'
    style.textContent = [
      ':root{--dsw-alias-bg-elevated:#fff;--dsw-alias-state-success-primary:#0a7;--dsw-alias-state-error-primary:#d33;--dsw-alias-bg-mask-1:rgba(0,0,0,.08);--dsw-specific-media-overlay:linear-gradient(to top,rgba(0,0,0,.62),rgba(0,0,0,0));--dsw-specific-media-fg:#fff;--dsw-specific-media-pill-bg:rgba(0,0,0,.6)}',
      '#qa-conversation{position:fixed;top:0;right:0;height:100vh;box-sizing:border-box;display:flex;flex-direction:column;background:#fafafa;border-left:1px solid #ddd;z-index:40;font-family:system-ui;color:#1b1b1b}',
      'body[data-conversation="collapsed"] #qa-conversation{width:64px}',
      'body[data-conversation="open"] #qa-conversation{width:340px}',
      'body[data-conversation="collapsed"] #fixture-stage{width:calc(100% - 64px)}',
      'body[data-conversation="open"] #fixture-stage{width:calc(100% - 340px)}',
      '#qa-conversation .qa-collapsed-label{display:none;writing-mode:vertical-rl;margin:14px auto;font-size:12px;color:#555}',
      'body[data-conversation="collapsed"] #qa-conversation .qa-collapsed-label{display:block}',
      'body[data-conversation="collapsed"] #qa-conversation .qa-title,body[data-conversation="collapsed"] #qa-conversation .qa-body{display:none}',
      '#qa-conversation .qa-title{padding:12px 14px;font-size:13px;font-weight:600;border-bottom:1px solid #eee}',
      '#qa-conversation .qa-body{flex:1 1 auto;display:flex;flex-direction:column;gap:8px;min-height:0;padding:12px}',
      '#qa-conversation .qa-hint{font-size:11px;line-height:16px;color:#888}',
      '#qa-conversation #qa-composer{flex:1 1 auto;min-height:220px;box-sizing:border-box;width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;background:#fff;font:inherit;font-size:12px;line-height:18px;resize:none}',
      '#qa-conversation .qa-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '#qa-conversation .qa-draft-state{font-size:11px;color:#888}',
      '#qa-conversation #qa-send{padding:6px 14px;border-radius:8px;border:1px solid #1b1b1b;background:#1b1b1b;color:#fff;font-size:12px}',
    ].join('\n')
    document.head.appendChild(style)
    const pane = document.createElement('aside')
    pane.id = 'qa-conversation'
    pane.setAttribute('data-qa-host', 'synthetic-conversation')
    pane.innerHTML = [
      '<div class="qa-collapsed-label">会话</div>',
      '<div class="qa-title">会话 <span>草稿</span></div>',
      '<div class="qa-body">',
      '  <div class="qa-hint">合成会话宿主（QA 桩，非完整 Host 安装）</div>',
      '  <textarea id="qa-composer" aria-label="会话输入框（合成桩）" placeholder="输入你的问题…"></textarea>',
      '  <div class="qa-actions"><span class="qa-draft-state">草稿未发送</span><button id="qa-send" type="button">发送</button></div>',
      '</div>',
    ].join('')
    document.body.appendChild(pane)

    const qaHost = { calls: [], prefill: [], sends: [], requests: [] }
    window.__qaHost = qaHost
    document.body.dataset.conversation = 'collapsed'
    window.__omnimuxWorkbench = {
      getSnapshot: () => ({ sessionId: 'qa-session-1' }),
      setConversationCollapsed(value) {
        qaHost.calls.push(['collapsed', value])
        document.body.dataset.conversation = value ? 'collapsed' : 'open'
      },
      setFocus(value) { qaHost.calls.push(['focus', value]) },
    }
    window.__omnimuxSessionPrefill = {
      queueSessionPrefill(request) {
        const prompt = String(request?.prompt ?? '')
        qaHost.prefill.push({ targetSessionId: request?.targetSessionId, prompt })
        const composer = document.getElementById('qa-composer')
        if (composer) composer.value = prompt
        return Promise.resolve({ ok: true })
      },
    }
    document.getElementById('qa-send').addEventListener('click', () => { qaHost.sends.push('send-click') })
    const nativeFetch = window.fetch
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || ''
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase()
      qaHost.requests.push({ method, url })
      return nativeFetch(input, init)
    }
    return {
      workbench: typeof window.__omnimuxWorkbench.getSnapshot === 'function',
      prefill: typeof window.__omnimuxSessionPrefill.queueSessionPrefill === 'function',
      conversation: document.body.dataset.conversation,
    }
  })
  assert.deepEqual(installed, { workbench: true, prefill: true, conversation: 'collapsed' })
}

async function readActions(browser) {
  return browser.evaluate(() => {
    const rectOf = element => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const card = document.querySelector('[data-collection-id]')
    const layer = card?.querySelector('.omnimux-inspiration-collection-actions')
    const style = layer ? getComputedStyle(layer) : null
    const cover = card?.querySelector('.omnimux-inspiration-collection-cover')
    const title = card?.querySelector('.omnimux-inspiration-collection-title')
    const menu = card?.querySelector('.omnimux-inspiration-collection-menu button')
    return {
      card: Boolean(card),
      layer: Boolean(layer),
      role: layer?.getAttribute('role') ?? null,
      ariaLabel: layer?.getAttribute('aria-label') ?? null,
      ariaHidden: layer?.getAttribute('aria-hidden') ?? null,
      opacity: style ? Number(style.opacity) : null,
      pointerEvents: style ? style.pointerEvents : null,
      transform: style ? style.transform : null,
      rect: layer ? rectOf(layer) : null,
      coverRect: cover ? rectOf(cover) : null,
      titleRect: title ? rectOf(title) : null,
      menuRect: menu ? rectOf(menu) : null,
      buttons: layer ? Array.from(layer.querySelectorAll('button')).map(button => ({
        text: button.textContent.trim(),
        ariaLabel: button.getAttribute('aria-label'),
        disabled: button.disabled,
        rect: rectOf(button),
      })) : [],
    }
  })
}

async function waitActionsVisible(browser) {
  await browser.wait(() => {
    const layer = document.querySelector('[data-collection-id] .omnimux-inspiration-collection-actions')
    if (!layer) return false
    const style = getComputedStyle(layer)
    return Number(style.opacity) > 0.99 && style.pointerEvents === 'auto'
  })
}

async function hoverCard(browser) {
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1596, y: 1094 })
  await sleep(120)
  const box = await browser.evaluate(() => {
    const card = document.querySelector('[data-collection-id]')
    card.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const rect = card.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + Math.min(rect.height / 2, 160) }
  })
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y })
  await waitActionsVisible(browser)
  await sleep(200)
}

async function readToast(browser) {
  return browser.evaluate(() => {
    const toast = document.querySelector('.omnimux-inspiration-toast')
    const text = document.querySelector('.omnimux-inspiration-toast .omnimux-inspiration-toast-text')
    const rect = toast?.getBoundingClientRect()
    return {
      visible: Boolean(toast) && Boolean(rect) && rect.width > 0 && rect.height > 0 && rect.top < innerHeight,
      text: text?.textContent?.trim() ?? null,
    }
  })
}

async function readHost(browser) {
  return browser.evaluate(() => ({
    calls: window.__qaHost.calls.map(call => call.slice()),
    prefill: window.__qaHost.prefill.map(entry => ({ targetSessionId: entry.targetSessionId, prompt: entry.prompt })),
    sends: window.__qaHost.sends.map(entry => String(entry)),
    requests: window.__qaHost.requests.map(entry => ({ method: entry.method, url: entry.url })),
    conversation: document.body.dataset.conversation,
    composer: document.getElementById('qa-composer')?.value ?? null,
  }))
}

async function ordinaryAudit(browser) {
  return browser.evaluate(() => Array.from(document.querySelectorAll('.omnimux-inspiration-collection-surface [data-inspiration-id]')).map(card => ({
    id: card.dataset.inspirationId,
    hasActionsLayer: Boolean(card.querySelector('.omnimux-inspiration-collection-actions')),
    texts: Array.from(card.querySelectorAll('button')).map(button => button.textContent.trim()).filter(Boolean),
  })))
}

function expectedPrompt(collectionId) {
  return [
    '来源：OmniMux 灵感库 · 本地合集',
    '合集：' + COLLECTION_TITLE,
    '合集 ID：' + collectionId,
    '成员条数：3',
    '成员清单：',
    '1. 舞蹈参考一（成员 id：qa-dance1；平台：tiktok；类型：image）',
    '2. 舞蹈参考二（成员 id：qa-dance2；平台：tiktok；类型：image）',
    '3. 穿搭参考一（成员 id：qa-fashion1；平台：tiktok；类型：image）',
    '使用 inspiration_get 按上述 id 逐条读取（标题、正文/脚本、拆解、本地媒体路径）再回答问题。',
    '问题：',
  ].join('\n')
}

async function withEnvironment(name, run) {
  const parent = join(root, '.workbuddy/evidence/inspiration-collection-actions-regression')
  mkdirSync(parent, { recursive: true })
  const evidenceDir = mkdtempSync(join(parent, name + '-'))
  const report = { name, pass: false, livePrecondition, checks: [], screenshots: [], evidenceDir }
  let fixture, browser
  try {
    fixture = await startInspirationCollectionsFixture({ root, evidenceDir })
    browser = await startCollectionsBrowser(evidenceDir)
    report.identity = { sourceSha256: fixture.identity.sourceSha256, bundleSha256: fixture.identity.bundleSha256, head: fixture.identity.head }
    report.origin = fixture.origin
    report.browser = { kind: 'independent-headless-chromium-regression', pid: browser.pid, port: browser.port }
    await run({ fixture, browser, report, capture: makeCapture(browser, evidenceDir, report) })
    assert.equal(fixture.counters.blockedCapabilities, 0)
    assert.equal(fixture.counters.blockedExternalFetch, 0)
    assert.deepEqual(browser.consoleErrors, [])
    report.finalDisk = fixture.readDisk()
    report.pass = true
  } catch (error) {
    report.error = String(error.stack || error)
    if (browser) {
      try { await makeCapture(browser, evidenceDir, report)('failure') } catch {}
      try {
        report.failureDom = await browser.evaluate(() => ({
          collectionCard: document.querySelector('[data-collection-id]')?.outerHTML?.slice(0, 3000) ?? null,
          toast: document.querySelector('.omnimux-inspiration-toast')?.textContent ?? null,
          body: document.body.innerText.slice(0, 1200),
        }))
      } catch {}
    }
    throw error
  } finally {
    const cleanupErrors = []
    try { if (browser) report.browserCleanup = await browser.close() } catch (error) { cleanupErrors.push(error) }
    if (fixture) {
      report.requests = fixture.requests
      report.counters = fixture.counters
      try { report.fixtureCleanup = await fixture.close() } catch (error) { cleanupErrors.push(error) }
    }
    if (cleanupErrors.length) { report.pass = false; report.cleanupErrors = cleanupErrors.map(error => String(error)) }
    writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2))
    console.log('Collection actions regression evidence: ' + evidenceDir)
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Collection actions regression cleanup failed')
  }
}

test('collection card actions: hover, view, add to session and draft-protected failure', { timeout: 180000 }, async () => {
  await withEnvironment('journey', async context => {
    const { fixture, browser, report, capture } = context
    const collection = await createCollection(fixture)
    assert.equal(fixture.readDisk().collections.length, 1)
    assert.deepEqual(fixture.requests.filter(entry => entry.method === 'POST' && entry.path === LOCAL + '/collections').map(entry => entry.status), [201])

    await openLocalTab(browser, fixture.origin, collection.id)
    await installHostStubs(browser)
    await hoverCard(browser)

    // 1. Real hover reveals the action layer; ordinary cards stay clean.
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1596, y: 1094 })
    await sleep(300)
    const hidden = await readActions(browser)
    assert.equal(hidden.card, true)
    assert.equal(hidden.layer, true)
    assert.equal(hidden.role, 'group')
    assert.equal(hidden.ariaLabel, '合集操作')
    assert.equal(hidden.ariaHidden, null)
    assert.ok(hidden.opacity <= 0.01)
    assert.equal(hidden.pointerEvents, 'none')
    assert.match(hidden.transform, /matrix\(1, 0, 0, 1, 0, 4\)/)
    assert.deepEqual(hidden.buttons.map(button => button.text), ['查看', '加入会话'])
    assert.deepEqual(hidden.buttons.map(button => button.ariaLabel), ['查看', '加入会话'])
    assert.deepEqual(hidden.buttons.map(button => button.disabled), [false, false])
    await hoverCard(browser)
    const hovered = await readActions(browser)
    assert.ok(hovered.opacity >= 0.99)
    assert.equal(hovered.pointerEvents, 'auto')
    assert.match(hovered.transform, /matrix\(1, 0, 0, 1, 0, 0\)/)
    assert.equal(hovered.rect.y >= hovered.coverRect.y - 0.5, true)
    assert.equal(hovered.rect.y + hovered.rect.height <= hovered.coverRect.y + hovered.coverRect.height + 0.5, true)
    const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    assert.equal(overlaps(hovered.rect, hovered.titleRect), false)
    assert.equal(overlaps(hovered.rect, hovered.menuRect), false)
    for (const card of await ordinaryAudit(browser)) {
      assert.equal(card.hasActionsLayer, false, 'ordinary card ' + card.id + ' must not expose collection actions')
      assert.equal(card.texts.includes('查看'), false)
      assert.equal(card.texts.includes('加入会话'), false)
    }
    report.checks.push('hidden until real hover; hover reveals 查看/加入会话 with opacity/pointer-events/translateY transition inside the cover; ordinary cards have no such controls')
    await capture('hover-actions')

    // 2. 查看 enters the collection content view, no session side effects.
    await browser.clickText('查看', '[data-collection-id] button')
    await browser.wait(() => Boolean(document.querySelector('.omnimux-inspiration-collection-navigation')))
    await browser.wait(ids => {
      const actual = Array.from(document.querySelectorAll('.omnimux-inspiration-collection-surface [data-inspiration-id]'))
        .map(element => element.dataset.inspirationId).sort()
      return JSON.stringify(actual) === JSON.stringify(Array.from(ids).sort())
    }, ITEM_IDS)
    await settle(browser)
    assert.equal(await browser.evaluate(() => document.querySelector('.omnimux-inspiration-collection-heading')?.textContent?.trim()), COLLECTION_TITLE)
    assert.deepEqual(
      await browser.evaluate(() => Array.from(document.querySelectorAll('.omnimux-inspiration-collection-navigation button')).map(button => button.textContent.trim())),
      ['返回灵感库', '重命名'],
    )
    assert.deepEqual(
      await browser.evaluate(() => Array.from(document.querySelectorAll('.omnimux-inspiration-collection-surface [data-inspiration-id]')).map(element => element.dataset.inspirationId).sort()),
      Array.from(ITEM_IDS).sort(),
    )
    assert.equal(await browser.evaluate(() => document.querySelectorAll('.omnimux-inspiration-collection-surface [data-collection-id]').length), 0)
    let host = await readHost(browser)
    assert.equal(host.prefill.length, 0, '查看 must not prefill')
    assert.deepEqual(host.calls, [], '查看 must not reveal the conversation')
    assert.equal(host.conversation, 'collapsed')
    for (const card of await ordinaryAudit(browser)) assert.equal(card.hasActionsLayer, false)
    report.checks.push('查看 shows the real collection view (back/heading/rename + 3 member cards) and produces no prefill or reveal calls')
    await capture('view-collection')

    // 3. Back to the root, then 加入会话.
    await browser.clickText('返回灵感库', '.omnimux-inspiration-collection-navigation button')
    await browser.wait(id => Boolean(document.querySelector('[data-collection-id="' + id + '"]')), collection.id)
    await settle(browser)
    await hoverCard(browser)
    await browser.clickText('加入会话', '[data-collection-id] button')
    await browser.wait(() => {
      const state = window.__qaHost
      return Boolean(state) && state.prefill.length === 1 && document.getElementById('qa-composer')?.value === state.prefill[0].prompt
    })
    await browser.wait(() => document.body.dataset.conversation === 'open')
    host = await readHost(browser)
    assert.equal(host.prefill.length, 1)
    assert.equal(host.prefill[0].targetSessionId, SESSION_ID)
    assert.equal(host.prefill[0].prompt, expectedPrompt(collection.id))
    assert.equal(host.composer, expectedPrompt(collection.id))
    assert.equal(host.conversation, 'open')
    assert.deepEqual(host.calls, [['collapsed', false], ['focus', 'split']])
    assert.deepEqual(host.calls[0], ['collapsed', false])
    assert.deepEqual(host.calls[1], ['focus', 'split'])
    assert.equal(host.sends.length, 0)
    assert.deepEqual(host.requests.filter(entry => entry.method !== 'GET'), [])
    assert.deepEqual(host.requests.filter(entry => /(send|message|draft|turn|completion)/i.test(entry.url)), [])
    assert.equal(
      await browser.evaluate(() => document.getElementById('qa-conversation').getBoundingClientRect().width >= 300),
      true,
    )
    const memberRead = fixture.requests.filter(entry => entry.method === 'GET' && entry.path === LOCAL && entry.query.collection_id === collection.id && entry.query.page_size === '100')
    assert.equal(memberRead.length, 1)
    assert.deepEqual(memberRead[0].query, { page: '1', page_size: '100', projection: 'lean', collection_id: collection.id })
    assert.equal(memberRead[0].status, 200)
    report.checks.push('加入会话 reads the real lean member list, reveals the column (uncollapse + split focus), writes exactly one sourced prompt via the prefill seam to qa-session-1, never sends')
    await capture('add-to-session')

    // 4. draft-protected: visible toast, existing draft preserved, no navigation.
    const callsBefore = (await readHost(browser)).calls.length
    await browser.evaluate(sentinel => {
      document.getElementById('qa-composer').value = sentinel
      window.__omnimuxSessionPrefill.queueSessionPrefill = () => Promise.resolve({ ok: false, error: 'draft-protected' })
      return true
    }, SENTINEL_DRAFT)
    await hoverCard(browser)
    await browser.clickText('加入会话', '[data-collection-id] button')
    await browser.wait(() => document.querySelector('.omnimux-inspiration-toast .omnimux-inspiration-toast-text')?.textContent?.trim().length > 0)
    const toast = await readToast(browser)
    await sleep(200)
    const failure = await browser.evaluate(sentinel => {
      const card = document.querySelector('[data-collection-id]')
      return {
        toastText: document.querySelector('.omnimux-inspiration-toast .omnimux-inspiration-toast-text')?.textContent?.trim() ?? null,
        composer: document.getElementById('qa-composer')?.value ?? null,
        conversation: document.body.dataset.conversation,
        rootCardTitle: card?.querySelector('.omnimux-inspiration-collection-title')?.textContent?.trim() ?? null,
        navigation: Boolean(document.querySelector('.omnimux-inspiration-collection-navigation')),
        activeTab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? null,
        sentinel,
      }
    }, SENTINEL_DRAFT)
    await capture('draft-protected')
    const afterFailure = await readHost(browser)
    assert.equal(toast.visible, true)
    assert.equal(toast.text, DRAFT_PROTECTED)
    assert.equal(failure.toastText, DRAFT_PROTECTED)
    assert.equal(failure.composer, SENTINEL_DRAFT, 'existing draft must not be overwritten')
    assert.equal(failure.conversation, 'open')
    assert.equal(failure.rootCardTitle, COLLECTION_TITLE, 'must stay on the library root')
    assert.equal(failure.navigation, false, 'must not navigate into the collection view')
    assert.equal(failure.activeTab, '灵感库')
    assert.equal(afterFailure.prefill.length, 1, 'the failing seam must not record a second prefill')
    assert.equal(afterFailure.sends.length, 0)
    assert.deepEqual(afterFailure.calls.slice(callsBefore), [['collapsed', false], ['focus', 'split']])
    report.checks.push('draft-protected shows 输入框已有内容，请先清空或新建会话后重试 while keeping the sentinel draft, staying on the root view and never sending')
  })
})
