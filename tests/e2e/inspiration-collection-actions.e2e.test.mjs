/**
 * Issue #3411 / #3418 — collection card hover actions + shared CTA regression.
 *
 * Reuses the existing real fixture (`inspiration-collections.fixture.mjs`: product
 * `InspirationSection` bundle, production local handlers/store, dynamic loopback
 * server) and the existing CDP driver (`inspiration-collections.browser.mjs`).
 * The host seams are page-injected stubs (`__omnimuxWorkbench`,
 * `__omnimuxSessionPrefill`) plus a synthetic conversation column; this is not a
 * full Host install.
 *
 * #3418 additionally injects the omnimux-market global rule verbatim
 * (`button[class*="add"]`, copied from plugins/omnimux-market/src/client/css.js
 * lines 237-246) plus two rule-matching control buttons, and asserts the
 * collection CTA reuses the ordinary card's shared `.omnimux-inspiration-overlay-cta*`
 * styles and is not hijacked by that host selector.
 *
 * Round 3 keeps the shared geometry/type/width while the collection CTA keeps the
 * media dark-room colours (light-theme pixel contrast re-checked in the evidence).
 *
 * #3420: collection "add to session" appends the collection context to the
 * current draft through the hub `mode:'append'` seam — an existing draft or
 * session attachment never blocks and the collapsed conversation column is
 * opened; only a composer in a non-plain phase is refused with the new
 * append-specific toast. The stub below implements the hub append contract; the
 * real hub append implementation is covered by hub unit tests (18 pass).
 *
 * Live precondition: `docs/evidence/2026-10-18-inspiration-collection-cta-css-3418/`
 * (browser.json + cta-shared-ui.png / cta-host-rule-immunity.png, 1600x1100) from
 * the #3418 real-browser run (9/9 assertions), inspected before this regression
 * was updated; the #3411 evidence remains under
 * `docs/evidence/2026-10-18-inspiration-collection-actions-3411/`.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { assertPng } from '../../scripts/worktree-web-qa.mjs'
import { RIVAL_TOKENS_CSS } from '../../plugins/omnimux-inspiration/src/client/rival-tokens.js'
import { startInspirationCollectionsFixture } from './inspiration-collections.fixture.mjs'
import { startCollectionsBrowser } from './inspiration-collections.browser.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const LOCAL = '/omnimux/inspiration/local'
const COLLECTION_TITLE = '测试合集'
const ITEM_IDS = ['qa-dance1', 'qa-dance2', 'qa-fashion1']
const SESSION_ID = 'qa-session-1'
const PHASE_PROTECTED = '输入框当前状态不支持追加，请完成当前输入后重试'
const APPEND_SEPARATOR = '\n\n'
const NO_SESSION = '没有可加入的会话，请先打开一个会话'
const SENTINEL_DRAFT = '用户既有草稿（QA 哨兵）'

/** Verbatim copy of plugins/omnimux-market/src/client/css.js lines 237-246. */
const MARKET_GLOBAL_CSS = `button[class*="add"],.Q7WfXG_add,
.sh-picker-trigger{display:inline-flex !important;align-items:center !important;justify-content:center !important;gap:4px !important;height:28px !important;box-sizing:border-box !important;padding:0 8px !important;border:0 !important;box-shadow:none !important;border-radius:24px !important;background:transparent !important;color:var(--dsw-alias-label-secondary,inherit) !important;font:inherit !important;font-size:13px !important;font-weight:500 !important;line-height:20px !important;cursor:pointer !important;outline:none !important;transition:background-color .15s ease,color .15s ease,box-shadow .15s ease !important}
button[class*="add"]:hover:not(:disabled),.Q7WfXG_add:hover:not(:disabled),
.sh-picker-trigger:hover{background:var(--dsw-alias-interactive-bg-hover) !important;color:var(--dsw-alias-label-primary,inherit) !important}
button[class*="add"]:focus-visible,.Q7WfXG_add:focus-visible,
.sh-picker-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3) !important;outline:none !important}
.sh-picker-trigger.on{background:var(--dsw-alias-interactive-bg-hover) !important;color:var(--dsw-alias-label-primary,inherit) !important}
button[class*="add"],.Q7WfXG_add{width:28px !important;min-width:28px !important;padding:0 !important}
button[class*="add"] svg,.Q7WfXG_add svg,
.sh-picker-trigger svg{flex:none !important;width:14px !important;height:14px !important;min-width:14px !important;min-height:14px !important;display:block !important}`


const livePrecondition = 'Issue #3420: docs/evidence/2026-10-18-inspiration-append-to-session-3420/browser.json + 2 decodable 1600x1100 PNGs (append-existing-draft, append-protected) from the real-browser run, 7/7 assertions (append draft + blank line, conversation open, no toast, no send; phase-protected toast + draft untouched); #3418 evidence under docs/evidence/2026-10-18-inspiration-collection-cta-css-3418/.'

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
  const installed = await browser.evaluate(css => {
    const style = document.createElement('style')
    style.id = 'qa-host-style'
    style.textContent = [
      String(css || ''),
      ':root{--dsw-alias-bg-elevated:#fff;--dsw-alias-state-success-primary:#0a7;--dsw-alias-state-error-primary:#d33;--dsw-alias-bg-mask-1:rgba(0,0,0,.08)}',
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

    const qaHost = { calls: [], prefill: [], sends: [], requests: [], attachments: 1 }
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
    // Synthetic attachment fact: the session already has one attachment. The
    // append stub (like the hub append contract) is not blocked by it.
    window.__omnimuxAttachments = {
      getActiveSessionId: () => '',
      listAttachments: () => [{ id: 'qa-attachment-1', kind: 'image' }],
    }
    window.__omnimuxSessionPrefill = {
      queueSessionPrefill(request) {
        const prompt = String(request?.prompt ?? '')
        const mode = request?.mode === 'append' ? 'append' : 'replace'
        const composer = document.getElementById('qa-composer')
        const draftBefore = composer ? composer.value : ''
        const base = String(draftBefore ?? '').replace(/\s+$/, '')
        const draftAfter = mode === 'append' ? (base ? base + '\n\n' + prompt : prompt) : prompt
        qaHost.prefill.push({
          targetSessionId: request?.targetSessionId,
          prompt,
          mode,
          hasAttach: typeof request?.attach === 'function',
          draftBefore,
          draftAfter,
        })
        if (composer) composer.value = draftAfter
        const result = { ok: true, via: 'input-actions' }
        if (mode === 'append') result.appended = true
        return Promise.resolve(result)
      },
    }
    qaHost.goodPrefill = window.__omnimuxSessionPrefill.queueSessionPrefill
    qaHost.goodSnapshot = window.__omnimuxWorkbench.getSnapshot
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
  }, RIVAL_TOKENS_CSS)
  assert.deepEqual(installed, { workbench: true, prefill: true, conversation: 'collapsed' })
}

async function readActions(browser) {
  return browser.evaluate(() => {
    const rectOf = element => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const buttonFacts = element => {
      if (!element) return null
      const style = getComputedStyle(element)
      return {
        className: String(element.className),
        text: element.textContent.trim(),
        ariaLabel: element.getAttribute('aria-label'),
        disabled: element.disabled,
        ariaBusy: element.getAttribute('aria-busy'),
        color: style.color,
        backgroundColor: style.backgroundColor,
        rect: rectOf(element),
      }
    }
    const card = document.querySelector('[data-collection-id]')
    const layer = card?.querySelector('.omnimux-inspiration-collection-actions')
    const style = layer ? getComputedStyle(layer) : null
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
      coverRect: card?.querySelector('.omnimux-inspiration-collection-cover') ? rectOf(card.querySelector('.omnimux-inspiration-collection-cover')) : null,
      titleRect: card?.querySelector('.omnimux-inspiration-collection-title') ? rectOf(card.querySelector('.omnimux-inspiration-collection-title')) : null,
      menuRect: card?.querySelector('.omnimux-inspiration-collection-menu button') ? rectOf(card.querySelector('.omnimux-inspiration-collection-menu button')) : null,
      focusWithin: card ? card.matches(':focus-within') : false,
      activeElementClass: String(document.activeElement?.className ?? ''),
      buttons: layer ? Array.from(layer.querySelectorAll('button')).map(buttonFacts) : [],
      secondary: card ? buttonFacts(card.querySelector('.omnimux-inspiration-overlay-cta-btn.secondary')) : null,
      primary: card ? buttonFacts(card.querySelector('.omnimux-inspiration-overlay-cta-btn.primary')) : null,
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

/** Read the shared CTA facts inside one card (ordinary or collection). */
async function readCta(browser, cardSelector) {
  return browser.evaluate(sel => {
    const rectOf = element => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const card = document.querySelector(sel)
    if (!card) return { error: 'missing card ' + sel }
    const facts = buttonSelector => {
      const element = card.querySelector(buttonSelector)
      if (!element) return null
      const style = getComputedStyle(element)
      const row = element.closest('.omnimux-inspiration-overlay-cta')
      const rowStyle = row ? getComputedStyle(row) : null
      return {
        className: String(element.className),
        text: element.textContent.trim(),
        ariaLabel: element.getAttribute('aria-label'),
        matchesHostAddRule: element.matches('button[class*="add"]'),
        classNameHasAdd: String(element.className).toLowerCase().includes('add'),
        computed: {
          backgroundColor: style.backgroundColor,
          color: style.color,
          borderColor: style.borderColor,
          height: style.height,
          width: style.width,
          borderRadius: style.borderRadius,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          flexGrow: style.flexGrow,
          flexBasis: style.flexBasis,
        },
        rect: rectOf(element),
        row: row ? {
          width: rowStyle.width,
          gap: rowStyle.gap,
          paddingLeft: rowStyle.paddingLeft,
          paddingRight: rowStyle.paddingRight,
          rect: rectOf(row),
        } : null,
      }
    }
    return {
      cardRect: rectOf(card),
      labels: Array.from(card.querySelectorAll('.omnimux-inspiration-overlay-cta-label')).map(node => node.textContent.trim()),
      secondary: facts('.omnimux-inspiration-overlay-cta-btn.secondary'),
      primary: facts('.omnimux-inspiration-overlay-cta-btn.primary'),
    }
  }, cardSelector)
}

function ctaGeometrySnapshot(button) {
  const computed = button.computed
  return {
    height: computed.height,
    width: computed.width,
    borderRadius: computed.borderRadius,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    lineHeight: computed.lineHeight,
    paddingLeft: computed.paddingLeft,
    paddingRight: computed.paddingRight,
    flexGrow: computed.flexGrow,
    flexBasis: computed.flexBasis,
  }
}

function ctaStyleSnapshot(button) {
  const computed = button.computed
  return {
    backgroundColor: computed.backgroundColor,
    color: computed.color,
    borderColor: computed.borderColor,
    height: computed.height,
    width: computed.width,
    borderRadius: computed.borderRadius,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    lineHeight: computed.lineHeight,
    paddingLeft: computed.paddingLeft,
    paddingRight: computed.paddingRight,
    flexGrow: computed.flexGrow,
    flexBasis: computed.flexBasis,
  }
}

async function hoverOrdinaryCard(browser) {
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1590, y: 1092 })
  await sleep(150)
  const box = await browser.evaluate(() => {
    const card = document.querySelector('[data-inspiration-id="qa-fashion2"]')
    card.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const rect = card.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + 24 }
  })
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y })
  await browser.wait(() => {
    const overlay = document.querySelector('[data-inspiration-id="qa-fashion2"] .omnimux-inspiration-card-overlay')
    return Boolean(overlay) && Number(getComputedStyle(overlay).opacity) > 0.99
  })
  await sleep(200)
}

/** Inject the market global rule verbatim + two control buttons that match it. */
async function injectMarketRuleAndControls(browser) {
  return browser.evaluate(css => {
    const container = document.createElement('div')
    container.id = 'qa-rule-controls'
    container.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:10px 12px;background:#fff;border:1px solid #bbb;border-radius:8px;font:12px system-ui;color:#333'
    const heading = document.createElement('div')
    heading.textContent = 'market button[class*="add"] 对照（注入后）'
    container.appendChild(heading)
    const make = (id, className, label) => {
      const button = document.createElement('button')
      button.id = id
      button.className = className
      button.textContent = label
      button.style.cssText = 'background: rgb(18,52,86); color: rgb(255,255,255); width: 120px; height: 40px; font-size: 16px; border-radius: 8px; border: 2px solid rgb(200,100,50); padding: 0 6px'
      container.appendChild(button)
      return button
    }
    make('qa-old-class-control', 'omnimux-inspiration-collection-action-add', '旧类名 add 对照')
    make('qa-add-substring-control', 'qa-add-probe', 'add 子串对照')
    document.body.appendChild(container)
    const style = document.createElement('style')
    style.id = 'qa-market-host-rule'
    style.textContent = String(css)
    document.head.appendChild(style)
    return true
  }, MARKET_GLOBAL_CSS)
}

async function readRuleControls(browser) {
  return browser.evaluate(() => {
    const facts = id => {
      const element = document.getElementById(id)
      const style = getComputedStyle(element)
      return {
        matchesHostAddRule: element.matches('button[class*="add"]'),
        backgroundColor: style.backgroundColor,
        width: style.width,
        height: style.height,
        borderRadius: style.borderRadius,
        fontSize: style.fontSize,
        padding: style.padding,
      }
    }
    return {
      stylePresent: Boolean(document.getElementById('qa-market-host-rule')),
      oldClass: facts('qa-old-class-control'),
      addSubstring: facts('qa-add-substring-control'),
    }
  })
}

async function hoverCard(browser) {
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1596, y: 1094 })
  await sleep(150)
  const box = await browser.evaluate(() => {
    const card = document.querySelector('[data-collection-id]')
    card.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const rect = card.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + 16 }
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
    const toasts = Array.from(document.querySelectorAll('.omnimux-inspiration-toast')).filter(element => {
      const box = element.getBoundingClientRect()
      return box.width > 0 && box.height > 0 && box.top < innerHeight
    })
    return {
      visible: Boolean(toast) && Boolean(rect) && rect.width > 0 && rect.height > 0 && rect.top < innerHeight,
      toastCount: toasts.length,
      text: text?.textContent?.trim() ?? null,
    }
  })
}

async function readHost(browser) {
  return browser.evaluate(() => ({
    calls: window.__qaHost.calls.map(call => call.slice()),
    prefill: window.__qaHost.prefill.map(entry => ({ targetSessionId: entry.targetSessionId, prompt: entry.prompt, mode: entry.mode, hasAttach: entry.hasAttach, draftBefore: entry.draftBefore, draftAfter: entry.draftAfter })),
    sends: window.__qaHost.sends.map(String),
    requests: window.__qaHost.requests.map(entry => ({ method: entry.method, url: entry.url })),
    conversation: document.body.dataset.conversation,
    composer: document.getElementById('qa-composer')?.value ?? null,
    attachments: window.__qaHost.attachments,
    hasAttachments: Object.hasOwn(window, '__omnimuxAttachments'),
  }))
}

/** Collapse + clear the recorder; optionally restore the pristine stubs. */
async function resetHost(browser, restoreStubs) {
  await browser.evaluate(restore => {
    const host = window.__qaHost
    if (restore) {
      window.__omnimuxSessionPrefill.queueSessionPrefill = host.goodPrefill
      window.__omnimuxWorkbench.getSnapshot = host.goodSnapshot
    }
    host.calls = []
    host.prefill = []
    host.sends = []
    host.requests = []
    host.attachments = 1
    document.body.dataset.conversation = 'collapsed'
    document.getElementById('qa-composer').value = ''
    return true
  }, restoreStubs === true)
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

test('collection card actions: shared CTA under the market host rule, hover, view, append to session, focus, phase-protected and no-session', { timeout: 180000 }, async () => {
  await withEnvironment('journey', async context => {
    const { fixture, browser, report, capture } = context
    // Drift guard: the injected host rule must stay verbatim in the market source.
    const marketSource = readFileSync(resolve(root, 'plugins/omnimux-market/src/client/css.js'), 'utf8')
    assert.equal(marketSource.includes(MARKET_GLOBAL_CSS), true, 'MARKET_GLOBAL_CSS must stay verbatim in omnimux-market css.js; update this test when the host global rule changes')
    report.checks.push('market drift guard: MARKET_GLOBAL_CSS is still verbatim in plugins/omnimux-market/src/client/css.js')
    const collection = await createCollection(fixture)
    assert.equal(fixture.readDisk().collections.length, 1)
    assert.deepEqual(fixture.requests.filter(entry => entry.method === 'POST' && entry.path === LOCAL + '/collections').map(entry => entry.status), [201])

    await openLocalTab(browser, fixture.origin, collection.id)
    await installHostStubs(browser)
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1596, y: 1094 })
    await sleep(300)

    // 0. Ordinary card CTA baseline: the collection CTA must reuse this exact UI.
    await hoverOrdinaryCard(browser)
    const ordinaryCta = await readCta(browser, '[data-inspiration-id="qa-fashion2"]')
    assert.equal(ordinaryCta.secondary.text, '详情')
    assert.equal(ordinaryCta.primary.text, '立即复刻')
    assert.deepEqual(ordinaryCta.labels, ['详情', '立即复刻'])
    assert.equal(ordinaryCta.secondary.className.includes('omnimux-inspiration-overlay-cta-btn secondary'), true)
    assert.equal(ordinaryCta.primary.className.includes('omnimux-inspiration-overlay-cta-btn primary'), true)
    assert.equal(ordinaryCta.secondary.matchesHostAddRule, false)
    assert.equal(ordinaryCta.primary.matchesHostAddRule, false)
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1596, y: 1094 })
    await sleep(250)

    // 1. Hidden by default, revealed by real pointer hover.
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
    assert.equal(hidden.secondary.className.includes('omnimux-inspiration-overlay-cta-btn'), true)
    assert.equal(hidden.secondary.className.includes('secondary'), true)
    assert.equal(hidden.primary.className.includes('omnimux-inspiration-overlay-cta-btn'), true)
    assert.equal(hidden.primary.className.includes('primary'), true)

    await hoverCard(browser)
    await sleep(200)
    const hovered = await readActions(browser)
    assert.ok(hovered.opacity >= 0.99)
    assert.equal(hovered.pointerEvents, 'auto')
    assert.match(hovered.transform, /matrix\(1, 0, 0, 1, 0, 0\)/)
    const collectionCtaBeforeRule = await readCta(browser, '[data-collection-id="' + collection.id + '"]')
    assert.equal(collectionCtaBeforeRule.secondary.text, '查看')
    assert.equal(collectionCtaBeforeRule.primary.text, '加入会话')
    assert.deepEqual(collectionCtaBeforeRule.labels, ['查看', '加入会话'])
    assert.equal(collectionCtaBeforeRule.secondary.className.includes('omnimux-inspiration-overlay-cta-btn secondary'), true)
    assert.equal(collectionCtaBeforeRule.primary.className.includes('omnimux-inspiration-overlay-cta-btn primary'), true)
    assert.deepEqual(ctaGeometrySnapshot(collectionCtaBeforeRule.secondary), ctaGeometrySnapshot(ordinaryCta.secondary), 'one UI geometry: secondary CTA must match the ordinary card')
    assert.deepEqual(ctaGeometrySnapshot(collectionCtaBeforeRule.primary), ctaGeometrySnapshot(ordinaryCta.primary), 'one UI geometry: primary CTA must match the ordinary card')
    assert.equal(collectionCtaBeforeRule.secondary.computed.backgroundColor, 'rgba(0, 0, 0, 0.6)', 'media dark-room secondary background')
    assert.equal(collectionCtaBeforeRule.secondary.computed.color, 'rgb(255, 255, 255)', 'media dark-room secondary text')
    assert.equal(collectionCtaBeforeRule.secondary.computed.borderColor, 'rgba(255, 255, 255, 0.3)', 'media dark-room secondary border')
    assert.equal(collectionCtaBeforeRule.primary.computed.backgroundColor, 'rgb(255, 255, 255)', 'media dark-room primary background')
    assert.equal(collectionCtaBeforeRule.primary.computed.color, 'rgb(17, 17, 19)', 'media dark-room primary text')
    assert.equal(collectionCtaBeforeRule.primary.computed.borderColor, 'rgb(255, 255, 255)', 'media dark-room primary border')
    assert.equal(ordinaryCta.secondary.computed.backgroundColor, 'rgba(0, 0, 0, 0.08)', 'ordinary card keeps the alias palette')
    assert.equal(ordinaryCta.primary.computed.backgroundColor, 'rgb(27, 27, 27)', 'ordinary card keeps the alias palette')
    assert.equal(collectionCtaBeforeRule.secondary.computed.height, '28px')
    assert.equal(collectionCtaBeforeRule.primary.computed.height, '28px')
    assert.equal(collectionCtaBeforeRule.secondary.computed.borderRadius, '9999px')
    assert.equal(collectionCtaBeforeRule.primary.computed.borderRadius, '9999px')
    assert.equal(collectionCtaBeforeRule.secondary.computed.fontSize, '12px')
    assert.equal(collectionCtaBeforeRule.primary.computed.fontSize, '12px')
    report.checks.push('one UI geometry: the collection CTA reuses the ordinary card CTA classes and matches height/width/radius/font/padding/flex (all four buttons 105.328px); colours are the media dark-room palette (secondary rgba(0,0,0,0.6)/#fff, primary #fff/#111113)')
    assert.equal(collectionCtaBeforeRule.secondary.computed.width, ordinaryCta.secondary.computed.width, 'strict width parity: secondary CTA must be pixel-identical to the ordinary card')
    assert.equal(collectionCtaBeforeRule.primary.computed.width, ordinaryCta.primary.computed.width, 'strict width parity: primary CTA must be pixel-identical to the ordinary card')
    assert.equal(ordinaryCta.cardRect.width, collectionCtaBeforeRule.cardRect.width, 'both cards render at the same width')
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
    report.checks.push('hidden until real hover; hover reveals 查看/加入会话 with opacity/pointer-events/translateY inside the cover using the shared overlay CTA classes; ordinary cards expose the same CTA classes only on their own hover')
    await capture('hover-actions')

    // 1b. Inject the market global rule verbatim; prove it is live, then prove
    //     the shared CTA classes are immune to it.
    await injectMarketRuleAndControls(browser)
    await sleep(500)
    const controls = await readRuleControls(browser)
    assert.equal(controls.stylePresent, true)
    for (const probe of [controls.oldClass, controls.addSubstring]) {
      assert.equal(probe.matchesHostAddRule, true)
      assert.equal(probe.width, '28px')
      assert.equal(probe.height, '28px')
      assert.equal(probe.borderRadius, '24px')
      assert.equal(probe.fontSize, '13px')
      assert.equal(probe.backgroundColor, 'rgba(0, 0, 0, 0)')
      assert.equal(probe.padding, '0px')
    }
    const collectionCtaAfterRule = await readCta(browser, '[data-collection-id="' + collection.id + '"]')
    const immunityPairs = [
      { name: 'secondary', after: collectionCtaAfterRule.secondary, before: collectionCtaBeforeRule.secondary },
      { name: 'primary', after: collectionCtaAfterRule.primary, before: collectionCtaBeforeRule.primary },
    ]
    for (const pair of immunityPairs) {
      assert.equal(pair.after.matchesHostAddRule, false, pair.name + ' must not match button[class*="add"]')
      assert.equal(pair.after.classNameHasAdd, false, pair.name + ' className must not contain "add"')
      assert.notEqual(pair.after.computed.width, '28px')
      assert.notEqual(pair.after.computed.backgroundColor, 'rgba(0, 0, 0, 0)')
      assert.notEqual(pair.after.computed.borderRadius, '24px')
      assert.notEqual(pair.after.computed.fontSize, '13px')
      assert.deepEqual(ctaStyleSnapshot(pair.after), ctaStyleSnapshot(pair.before), pair.name + ' styles must be unchanged by the injected host rule')
    }
    report.checks.push('the market button[class*="add"] rule injected verbatim is live (both control probes forced to a 28px transparent pill) while the collection CTA keeps the shared CTA styles and is not matched by it')
    await capture('cta-host-rule-immunity')
    await browser.evaluate(() => { document.getElementById('qa-rule-controls')?.remove(); return true })

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
    report.checks.push('查看 (dedicated onView handler) shows the real collection view (back/heading/rename + 3 member cards) and produces no prefill or reveal calls')
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
    assert.equal(host.prefill[0].mode, 'append', '加入会话 must use the hub append mode')
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

    // 4. Keyboard :focus-within reveal (mouse parked away), media-token palette.
    await resetHost(browser, true)
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1596, y: 1094 })
    await sleep(300)
    const focusStart = await browser.evaluate(() => {
      const button = document.querySelector('[data-collection-id] .omnimux-inspiration-overlay-cta-btn.secondary')
      const layer = document.querySelector('.omnimux-inspiration-collection-actions')
      const before = Number(getComputedStyle(layer).opacity)
      button.focus()
      return { before, active: document.activeElement === button }
    })
    await browser.wait(() => {
      const layer = document.querySelector('.omnimux-inspiration-collection-actions')
      if (!layer) return false
      const style = getComputedStyle(layer)
      return Number(style.opacity) > 0.99 && style.pointerEvents === 'auto'
    })
    await sleep(200)
    const focusState = await readActions(browser)
    assert.ok(focusStart.before <= 0.01, 'layer must start hidden before focus')
    assert.equal(focusStart.active, true)
    assert.equal(focusState.focusWithin, true)
    assert.ok(focusState.opacity >= 0.99)
    assert.equal(focusState.pointerEvents, 'auto')
    assert.match(focusState.transform, /matrix\(1, 0, 0, 1, 0, 0\)/)
    assert.equal(focusState.activeElementClass.includes('omnimux-inspiration-overlay-cta-btn'), true)
    assert.equal(focusState.activeElementClass.includes('secondary'), true)
    report.checks.push('keyboard focus on 查看 reveals the action layer through :focus-within (opacity ~1, pointer-events auto) with the mouse parked away')
    await capture('focus-actions')
    await browser.evaluate(() => { document.activeElement?.blur?.(); return true })

    // 5. append into an existing draft (+ synthetic attachment) with the column collapsed.
    await resetHost(browser, true)
    await browser.evaluate(sentinel => {
      window.__qaHost.attachments = 1
      document.body.dataset.conversation = 'collapsed'
      document.getElementById('qa-composer').value = sentinel
      return true
    }, SENTINEL_DRAFT)
    await sleep(150)
    await hoverCard(browser)
    const beforeAppend = await readHost(browser)
    await browser.clickText('加入会话', '[data-collection-id] button')
    await browser.wait(() => {
      const state = window.__qaHost
      return Boolean(state) && state.prefill.length === 1 && document.body.dataset.conversation === 'open'
    })
    await sleep(300)
    const afterAppend = await readHost(browser)
    const appendToast = await readToast(browser)
    const expectedAppended = SENTINEL_DRAFT + APPEND_SEPARATOR + expectedPrompt(collection.id)
    await capture('append-existing-draft')
    assert.equal(beforeAppend.conversation, 'collapsed')
    assert.equal(beforeAppend.composer, SENTINEL_DRAFT)
    assert.equal(beforeAppend.attachments, 1)
    assert.equal(afterAppend.conversation, 'open', '加入会话 must open the collapsed conversation column')
    assert.deepEqual(afterAppend.calls, [['collapsed', false], ['focus', 'split']])
    assert.equal(afterAppend.prefill.length, 1)
    assert.equal(afterAppend.prefill[0].mode, 'append')
    assert.equal(afterAppend.prefill[0].targetSessionId, SESSION_ID)
    assert.equal(afterAppend.prefill[0].prompt, expectedPrompt(collection.id))
    assert.equal(afterAppend.prefill[0].hasAttach, true)
    assert.equal(afterAppend.prefill[0].draftBefore, SENTINEL_DRAFT)
    assert.equal(afterAppend.composer, expectedAppended, 'existing draft must be preserved and the prompt appended after a blank line')
    assert.equal(appendToast.visible, false, 'append must not show a blocking toast')
    assert.equal(appendToast.toastCount, 0)
    assert.equal(afterAppend.sends.length, 0)
    assert.deepEqual(afterAppend.requests.filter(entry => entry.method !== 'GET'), [])
    report.checks.push('加入会话 with an existing draft + attachment in a collapsed column opens the column and appends the collection prompt after a blank line via exactly one mode=append prefill, without a toast or send')

    // 6. phase-protected (composer not plain): visible toast, draft untouched, no append.
    await resetHost(browser, true)
    await sleep(150)
    await hoverCard(browser)
    await browser.evaluate(sentinel => {
      document.getElementById('qa-composer').value = sentinel
      window.__omnimuxSessionPrefill.queueSessionPrefill = () => Promise.resolve({ ok: false, error: 'draft-protected' })
      return true
    }, SENTINEL_DRAFT)
    await browser.clickText('加入会话', '[data-collection-id] button')
    await browser.wait(() => document.querySelector('.omnimux-inspiration-toast .omnimux-inspiration-toast-text')?.textContent?.trim().length > 0)
    const protectedToast = await readToast(browser)
    await sleep(200)
    const protectedState = await browser.evaluate(sentinel => {
      const card = document.querySelector('[data-collection-id]')
      return {
        toastText: document.querySelector('.omnimux-inspiration-toast .omnimux-inspiration-toast-text')?.textContent?.trim() ?? null,
        composer: document.getElementById('qa-composer')?.value ?? null,
        conversation: document.body.dataset.conversation,
        rootCardTitle: card?.querySelector('.omnimux-inspiration-collection-title')?.textContent?.trim() ?? null,
        navigation: Boolean(document.querySelector('.omnimux-inspiration-collection-navigation')),
        sentinel,
      }
    }, SENTINEL_DRAFT)
    await capture('append-protected')
    const afterProtected = await readHost(browser)
    assert.equal(protectedToast.visible, true)
    assert.equal(protectedToast.toastCount, 1)
    assert.equal(protectedToast.text, PHASE_PROTECTED)
    assert.equal(protectedState.toastText, PHASE_PROTECTED)
    assert.equal(protectedState.composer, SENTINEL_DRAFT, 'protected append must not modify the draft')
    assert.equal(afterProtected.composer, SENTINEL_DRAFT)
    assert.deepEqual(afterProtected.prefill, [], 'the protected seam must not record an append request')
    assert.equal(protectedState.conversation, 'open', 'column is revealed before the protected write attempt')
    assert.equal(afterProtected.sends.length, 0)
    assert.equal(protectedState.rootCardTitle, COLLECTION_TITLE)
    assert.equal(protectedState.navigation, false)
    report.checks.push('phase-protected append shows 输入框当前状态不支持追加，请完成当前输入后重试 while keeping the draft untouched, staying on the root view and never appending')

    // 7. no active session: explicit toast, no reveal, no prefill, no expansion.
    await resetHost(browser, true)
    const readsBefore = fixture.requests.filter(entry => entry.method === 'GET' && entry.path === LOCAL && entry.query.collection_id === collection.id && entry.query.page_size === '100').length
    await browser.evaluate(() => {
      window.__omnimuxWorkbench.getSnapshot = () => ({ sessionId: '' })
      delete window.__omnimuxAttachments
      window.__qaHost.calls = []
      window.__qaHost.prefill = []
      window.__qaHost.sends = []
      window.__qaHost.requests = []
      document.body.dataset.conversation = 'collapsed'
      document.getElementById('qa-composer').value = ''
      return true
    })
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1596, y: 1094 })
    await sleep(150)
    await hoverCard(browser)
    const beforeNoSession = await readHost(browser)
    await browser.clickText('加入会话', '[data-collection-id] button')
    await browser.wait(() => document.querySelector('.omnimux-inspiration-toast .omnimux-inspiration-toast-text')?.textContent?.trim() === '没有可加入的会话，请先打开一个会话')
    const noSessionToast = await readToast(browser)
    await browser.wait(() => {
      const button = document.querySelector('[data-collection-id] .omnimux-inspiration-overlay-cta-btn.primary')
      return Boolean(button) && button.disabled === false && button.getAttribute('aria-busy') !== 'true'
    })
    await sleep(150)
    const noSession = await browser.evaluate(() => {
      const button = document.querySelector('[data-collection-id] .omnimux-inspiration-overlay-cta-btn.primary')
      const card = document.querySelector('[data-collection-id]')
      return {
        toastText: document.querySelector('.omnimux-inspiration-toast .omnimux-inspiration-toast-text')?.textContent?.trim() ?? null,
        calls: window.__qaHost.calls.map(call => call.slice()),
        prefill: window.__qaHost.prefill.map(entry => ({ targetSessionId: entry.targetSessionId, prompt: entry.prompt })),
        sends: window.__qaHost.sends.map(String),
        requests: window.__qaHost.requests.map(entry => ({ method: entry.method, url: entry.url })),
        conversation: document.body.dataset.conversation,
        composer: document.getElementById('qa-composer')?.value ?? null,
        buttonDisabled: button?.disabled ?? null,
        buttonBusy: button?.getAttribute('aria-busy') ?? null,
        rootCardTitle: card?.querySelector('.omnimux-inspiration-collection-title')?.textContent?.trim() ?? null,
        navigation: Boolean(document.querySelector('.omnimux-inspiration-collection-navigation')),
      }
    })
    await capture('no-session')
    assert.equal(beforeNoSession.hasAttachments, false)
    assert.equal(noSessionToast.visible, true)
    assert.equal(noSession.toastText, NO_SESSION)
    assert.deepEqual(noSession.calls, [], 'no reveal may run without a bound session')
    assert.deepEqual(noSession.prefill, [])
    assert.equal(noSession.composer, '')
    assert.equal(noSession.conversation, 'collapsed', 'empty conversation column must not be expanded')
    assert.equal(noSession.sends.length, 0)
    assert.deepEqual(noSession.requests.filter(entry => entry.method !== 'GET'), [])
    const readsAfter = fixture.requests.filter(entry => entry.method === 'GET' && entry.path === LOCAL && entry.query.collection_id === collection.id && entry.query.page_size === '100').length
    assert.equal(readsAfter, readsBefore + 1, 'members must still be read before the session check aborts')
    assert.equal(noSession.buttonDisabled, false)
    assert.notEqual(noSession.buttonBusy, 'true')
    assert.equal(noSession.rootCardTitle, COLLECTION_TITLE)
    assert.equal(noSession.navigation, false)
    report.checks.push('no active session shows 没有可加入的会话，请先打开一个会话, performs no reveal and no prefill, keeps the conversation collapsed and the button enabled again')
  })
})
