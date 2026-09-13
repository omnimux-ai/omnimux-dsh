/**
 * Tests for the agent-preset seat avatar enhancer.
 *
 * The fixtures mirror the official `AgentPresetSeat` DOM as the shipped client
 * renders it: hashed CSS-module class names, the chip's `seatLabel` / `seatIcon`
 * spans, and a portaled `Menu` whose rows carry `itemName` + `itemDesc`. The
 * slash/trigger candidate menu (`…_itemDescription`) is included as the
 * near-miss the enhancer must leave alone.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  AGENT_PRESET_AVATAR_CSS,
  AGENT_PRESET_AVATARS,
  MENU_AVATAR_SIZE_PX,
  MENU_ITEM_MIN_HEIGHT_PX,
  PRESET_AVATAR_HOST_KEY,
  PRESET_DESC_ATTR,
  PRESET_ICON_HIDDEN_ATTR,
  PRESET_ITEM_ATTR,
  PRESET_ID_ATTR,
  PRESET_MENU_ATTR,
  PRESET_MENU_AVATAR_CLASS,
  PRESET_SEAT_ATTR,
  PRESET_SEAT_AVATAR_CLASS,
  SEAT_AVATAR_SIZE_PX,
  applyAgentPresetAvatars,
  findAgentPresetSeat,
  installAgentPresetAvatarEnhancer,
  registerAgentPresetAvatar,
  resetAgentPresetEnhancerForTests,
  resolveAgentPresetAvatar,
  seatLabelText,
  uninstallAgentPresetAvatarEnhancer,
} from './agent-preset-enhancer.js'
import { HUB_CSS } from './styles.js'

const previousDocument = globalThis.document
const previousMutationObserver = globalThis.MutationObserver

afterEach(() => {
  resetAgentPresetEnhancerForTests()
  if (previousDocument === undefined) delete globalThis.document
  else globalThis.document = previousDocument
  if (previousMutationObserver === undefined) delete globalThis.MutationObserver
  else globalThis.MutationObserver = previousMutationObserver
})

const SEAT_HTML = `
  <div data-phase="hero">
    <div class="hf7Js2_composerHero">
      <div data-composer-card>
        <div data-composer-seat>
          <div class="hf7Js2_heroWorkspaceRow">
            <button type="button" class="hf7Js2_workspaceTrigger" aria-label="选择工作区" aria-haspopup="menu" aria-expanded="false">
              <span class="hf7Js2_triggerLabel">默认工作区</span>
            </button>
            <span class="PnBhwW_menuAnchor PnBhwW_root">
              <button type="button" class="PnBhwW_seat" aria-haspopup="menu" aria-expanded="false" title="切换专家">
                <svg class="PnBhwW_seatIcon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12"/></svg>
                <span class="PnBhwW_seatLabel">全能社媒操盘手</span>
                <svg class="PnBhwW_chevron" viewBox="0 0 14 14" aria-hidden="true"></svg>
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>`

/**
 * @param {{ name: string, description: string, selected?: boolean }} row
 * @returns {string}
 */
function presetRow(row) {
  const selected = row.selected === true
  return `
    <div class="Qw9kLm_itemWrap">
      <button type="button" role="menuitem" class="Qw9kLm_item${selected ? ' Qw9kLm_selected' : ''}">
        <span class="Qw9kLm_itemLabel">
          <span class="PnBhwW_item">
            <span class="PnBhwW_itemName">${row.name}</span>
            <span class="PnBhwW_itemDesc">${row.description}</span>
          </span>
        </span>
        ${selected ? '<svg class="Qw9kLm_check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8l4 4 6-7"/></svg>' : ''}
      </button>
    </div>`
}

/**
 * Append the portaled preset menu, exactly as the official Menu renders it.
 * @param {Document} doc
 * @returns {Element}
 */
function openPresetMenu(doc) {
  const menu = doc.createElement('div')
  menu.setAttribute('role', 'menu')
  menu.setAttribute('class', 'Qw9kLm_list Qw9kLm_portal')
  menu.innerHTML = `
    <div class="Qw9kLm_viewport" role="presentation">
      ${presetRow({ name: '全能社媒操盘手', description: '全域社媒爆款创作与矩阵运营增长。', selected: true })}
      ${presetRow({ name: '软件开发团队', description: 'SOP 多智能体软件交付团队：产品需求、架构拆解、工程实现与 QA 验收。' })}
      ${presetRow({ name: '代码开发', description: '全栈架构设计、代码编写与工程交付。' })}
    </div>`
  doc.body.appendChild(menu)
  return menu
}

/**
 * Append the composer's other portaled menu — the slash/trigger candidate list.
 * Its rows carry `itemDescription`, not `itemDesc`, and must survive untouched.
 * @param {Document} doc
 * @returns {Element}
 */
function openTriggerMenu(doc) {
  const menu = doc.createElement('div')
  menu.setAttribute('role', 'menu')
  menu.setAttribute('class', 'iRJKyq_menu')
  menu.innerHTML = `
    <div class="iRJKyq_viewport" role="presentation">
      <button type="button" role="menuitem" class="iRJKyq_item">
        <span class="iRJKyq_itemIcon" aria-hidden="true"></span>
        <span class="iRJKyq_itemName">/video</span>
        <span class="iRJKyq_itemDescription">生成一段视频</span>
      </button>
    </div>`
  doc.body.appendChild(menu)
  return menu
}

/**
 * A live document with the new-session composer.
 * @returns {{ dom: JSDOM, doc: Document }}
 */
function setup() {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${SEAT_HTML}</body></html>`)
  globalThis.document = dom.window.document
  globalThis.MutationObserver = dom.window.MutationObserver
  return { dom, doc: dom.window.document }
}

/** Let the enhancer's microtask-scheduled pass run. */
function flush() {
  return new Promise((resolve) => { setTimeout(resolve, 0) })
}

describe('agent preset avatars', () => {
  it('resolves one stable face per expert, from either the id or the rendered name', () => {
    const byName = resolveAgentPresetAvatar('全能社媒操盘手')
    const byId = resolveAgentPresetAvatar('tiktok-agent')

    assert.equal(byName.id, 'tiktok-agent')
    assert.equal(byName.src, byId.src, 'the localized name and the id must resolve to one face')
    assert.equal(resolveAgentPresetAvatar('tiktok-agent').src, byId.src, 'resolution must be deterministic')
    assert.match(byId.src, /^data:image\/svg\+xml,/, 'blobatar renders a percent-encoded SVG data URI')
    assert.equal(resolveAgentPresetAvatar(''), null)
    assert.equal(resolveAgentPresetAvatar('   '), null)
  })

  it('gives every known expert a distinct avatar', () => {
    const ids = ['tiktok-agent', 'software-company', 'standard', 'cordis', 'html-generator', 'superpowers-zh', 'ptc', 'minimal']
    assert.deepEqual(Object.keys(AGENT_PRESET_AVATARS).sort(), [...ids, 'daily-work'].sort())

    const sources = new Set(ids.map((id) => resolveAgentPresetAvatar(id).src))
    assert.equal(sources.size, ids.length, 'no two experts may share a face')
  })

  it('prefers a configured avatar over the deterministic one', () => {
    registerAgentPresetAvatar('cordis', 'data:image/png;base64,CONFIGURED')
    assert.equal(resolveAgentPresetAvatar('创造模式').src, 'data:image/png;base64,CONFIGURED')
    assert.equal(resolveAgentPresetAvatar('cordis').id, 'cordis')

    globalThis[PRESET_AVATAR_HOST_KEY] = { '软件开发团队': 'data:image/png;base64,HOST' }
    assert.equal(resolveAgentPresetAvatar('software-company').src, 'data:image/png;base64,HOST')
    assert.equal(resolveAgentPresetAvatar('standard').src.startsWith('data:image/svg+xml,'), true)
  })

  it('finds the preset chip, not the workspace picker beside it', () => {
    const { doc } = setup()
    const seat = findAgentPresetSeat(doc)

    assert.ok(seat, 'the chip must be found')
    assert.equal(seat.getAttribute('class'), 'PnBhwW_seat')
    assert.equal(seatLabelText(seat), '全能社媒操盘手')
  })

  it('renders the current expert as an 18px avatar on the chip and retires the fixed glyph', async () => {
    const { doc } = setup()
    installAgentPresetAvatarEnhancer(doc)

    const seat = findAgentPresetSeat(doc)
    const avatar = seat.querySelector(`img.${PRESET_SEAT_AVATAR_CLASS}`)
    assert.ok(avatar, 'the chip must carry an injected avatar')
    assert.equal(avatar.getAttribute('width'), String(SEAT_AVATAR_SIZE_PX))
    assert.equal(avatar.getAttribute('height'), String(SEAT_AVATAR_SIZE_PX))
    assert.equal(avatar.getAttribute('src'), resolveAgentPresetAvatar('tiktok-agent', { size: SEAT_AVATAR_SIZE_PX }).src)
    assert.equal(avatar.getAttribute(PRESET_ID_ATTR), 'tiktok-agent')
    assert.equal(seat.getAttribute(PRESET_SEAT_ATTR), 'tiktok-agent')
    assert.equal(seat.firstElementChild, avatar, 'the avatar leads the chip, before the label')
    assert.ok(seat.querySelector('[class*="seatIcon"]').hasAttribute(PRESET_ICON_HIDDEN_ATTR), 'the outline glyph yields')
    assert.equal(seatLabelText(seat), '全能社媒操盘手', 'the label itself is untouched')

    const again = applyAgentPresetAvatars(doc)
    assert.deepEqual(again, { seat: { id: 'tiktok-agent', label: '全能社媒操盘手' }, items: 0 })
    await flush()
    assert.equal(seat.querySelectorAll(`img.${PRESET_SEAT_AVATAR_CLASS}`).length, 1, 'a re-pass must not duplicate the avatar')
  })

  it('moves the chip avatar when the preset switches', async () => {
    const { doc } = setup()
    installAgentPresetAvatarEnhancer(doc)
    const seat = findAgentPresetSeat(doc)
    const before = seat.querySelector(`img.${PRESET_SEAT_AVATAR_CLASS}`).getAttribute('src')

    seat.querySelector('[class*="seatLabel"]').textContent = '软件开发团队'
    await flush()

    const after = seat.querySelector(`img.${PRESET_SEAT_AVATAR_CLASS}`)
    assert.notEqual(after.getAttribute('src'), before, 'the face must follow the switch')
    assert.equal(after.getAttribute('src'), resolveAgentPresetAvatar('software-company', { size: SEAT_AVATAR_SIZE_PX }).src)
    assert.equal(after.getAttribute(PRESET_ID_ATTR), 'software-company')
    assert.equal(seat.getAttribute(PRESET_SEAT_ATTR), 'software-company')
  })

  it('gives every picker row a 20px avatar, hides its description, and keeps the active check', async () => {
    const { doc } = setup()
    installAgentPresetAvatarEnhancer(doc)
    const menu = openPresetMenu(doc)
    await flush()

    assert.equal(menu.getAttribute(PRESET_MENU_ATTR), 'true')

    const rows = [...menu.querySelectorAll('[role="menuitem"]')]
    assert.equal(rows.length, 3)
    for (const row of rows) {
      const avatar = row.querySelector(`img.${PRESET_MENU_AVATAR_CLASS}`)
      assert.ok(avatar, `${row.textContent} must carry an avatar`)
      assert.equal(avatar.getAttribute('width'), String(MENU_AVATAR_SIZE_PX))
      assert.equal(avatar.getAttribute('height'), String(MENU_AVATAR_SIZE_PX))
      assert.equal(row.firstElementChild, avatar, 'the avatar leads the row')
      assert.ok(row.hasAttribute(PRESET_ITEM_ATTR))
      assert.ok(row.querySelector('[class*="itemDesc"]').hasAttribute(PRESET_DESC_ATTR), 'descriptions are marked hidden')
      assert.equal(row.querySelector('[class*="itemName"]').textContent.length > 0, true)
    }

    assert.deepEqual(rows.map((row) => row.getAttribute(PRESET_ITEM_ATTR)), ['tiktok-agent', 'software-company', 'standard'])
    const sources = new Set(rows.map((row) => row.querySelector(`img.${PRESET_MENU_AVATAR_CLASS}`).getAttribute('src')))
    assert.equal(sources.size, 3, 'each row shows its own expert')

    const active = rows[0]
    assert.ok(active.querySelector('svg[class*="check"]'), 'the active row keeps its check mark')
    assert.equal(rows[1].querySelector('svg[class*="check"]'), null)

    await flush()
    assert.equal(menu.querySelectorAll(`img.${PRESET_MENU_AVATAR_CLASS}`).length, 3, 'a re-pass must not duplicate row avatars')
  })

  it('leaves the slash/trigger candidate menu alone', async () => {
    const { doc } = setup()
    installAgentPresetAvatarEnhancer(doc)
    const triggerMenu = openTriggerMenu(doc)
    await flush()

    const row = triggerMenu.querySelector('[role="menuitem"]')
    assert.equal(row.hasAttribute(PRESET_ITEM_ATTR), false)
    assert.equal(row.querySelector('img'), null)
    assert.equal(row.querySelector('[class*="itemDescription"]').hasAttribute(PRESET_DESC_ATTR), false)
    assert.equal(triggerMenu.hasAttribute(PRESET_MENU_ATTR), false)
  })

  it('clears the observer and everything it injected on uninstall', async () => {
    const { doc } = setup()
    const uninstall = installAgentPresetAvatarEnhancer(doc)
    openPresetMenu(doc)
    await flush()
    assert.ok(doc.querySelectorAll(`img.${PRESET_SEAT_AVATAR_CLASS}, img.${PRESET_MENU_AVATAR_CLASS}`).length > 0)

    uninstall()

    assert.equal(doc.querySelectorAll(`img.${PRESET_SEAT_AVATAR_CLASS}, img.${PRESET_MENU_AVATAR_CLASS}`).length, 0)
    assert.equal(doc.querySelectorAll(`[${PRESET_ITEM_ATTR}]`).length, 0)
    assert.equal(doc.querySelectorAll(`[${PRESET_DESC_ATTR}]`).length, 0)
    assert.equal(doc.querySelectorAll(`[${PRESET_MENU_ATTR}]`).length, 0)
    assert.equal(doc.querySelectorAll(`[${PRESET_SEAT_ATTR}]`).length, 0)
    assert.equal(doc.querySelectorAll(`[${PRESET_ICON_HIDDEN_ATTR}]`).length, 0)
    assert.equal(doc.querySelector('[class*="seatIcon"]').getAttribute(PRESET_ICON_HIDDEN_ATTR), null)

    // The observer must be gone: a menu opened after teardown stays untouched.
    openPresetMenu(doc)
    openTriggerMenu(doc)
    await flush()
    assert.equal(doc.querySelectorAll(`img.${PRESET_MENU_AVATAR_CLASS}`).length, 0)
    assert.equal(doc.querySelectorAll(`img.${PRESET_SEAT_AVATAR_CLASS}`).length, 0)
  })

  it('installs over a re-rendered chip (panel switch) without leaking state', async () => {
    const { doc } = setup()
    installAgentPresetAvatarEnhancer(doc)
    const seat = findAgentPresetSeat(doc)
    seat.remove()
    const replacement = doc.createElement('div')
    replacement.innerHTML = SEAT_HTML
    doc.body.appendChild(replacement)
    await flush()

    const next = findAgentPresetSeat(doc)
    assert.notEqual(next, seat)
    assert.equal(next.querySelectorAll(`img.${PRESET_SEAT_AVATAR_CLASS}`).length, 1)
    assert.equal(doc.querySelectorAll(`img.${PRESET_SEAT_AVATAR_CLASS}`).length, 1, 'the removed chip takes its avatar with it')
    uninstallAgentPresetAvatarEnhancer()
    assert.equal(doc.querySelectorAll(`img.${PRESET_SEAT_AVATAR_CLASS}`).length, 0)
  })
})

describe('agent preset avatar styles', () => {
  it('ships the enhancer block inside HUB_CSS from one source', () => {
    assert.ok(AGENT_PRESET_AVATAR_CSS.length > 0)
    assert.ok(HUB_CSS.includes(AGENT_PRESET_AVATAR_CSS), 'HUB_CSS must embed the enhancer block verbatim')
  })

  it('hides every picker description without touching the trigger menu', () => {
    assert.match(AGENT_PRESET_AVATAR_CSS, /\[class\*="AgentPresetSeat_itemDesc"\][\s\S]*?display:\s*none\s*!important/)
    assert.match(AGENT_PRESET_AVATAR_CSS, /\[data-omnimux-preset-desc\][\s\S]*?display:\s*none\s*!important/)
    assert.match(AGENT_PRESET_AVATAR_CSS, /\[data-omnimux-preset-menu\] \[class\*="itemDesc"\]/)
    assert.doesNotMatch(
      AGENT_PRESET_AVATAR_CSS,
      /^\s*\[class\*="itemDesc"\]/m,
      'an unscoped [class*="itemDesc"] rule would also hide the slash menu descriptions',
    )
    assert.match(AGENT_PRESET_AVATAR_CSS, /\[data-omnimux-preset-icon-hidden\][\s\S]*?display:\s*none\s*!important/)
  })

  it('lays a picker row out as one compact line', () => {
    const rule = AGENT_PRESET_AVATAR_CSS.match(/\[class\*="AgentPresetSeat_item"\][^{]*\[data-omnimux-preset-item\]\s*\{([^}]*)\}/)
    assert.ok(rule, 'the single-line row rule must exist')
    assert.match(rule[1], /display:\s*flex\s*!important/)
    assert.match(rule[1], /flex-direction:\s*row\s*!important/)
    assert.match(rule[1], /align-items:\s*center\s*!important/)
    assert.match(rule[1], new RegExp(`min-height:\\s*${MENU_ITEM_MIN_HEIGHT_PX}px`))
    assert.ok(MENU_ITEM_MIN_HEIGHT_PX >= 36 && MENU_ITEM_MIN_HEIGHT_PX <= 38, 'row height stays in the 36-38px band')
    assert.match(AGENT_PRESET_AVATAR_CSS, /\[data-omnimux-preset-item\] > \[class\*="check"\][\s\S]*?margin-left:\s*auto\s*!important/)
  })

  it('draws both avatars as ringed circles from official tokens', () => {
    const seat = AGENT_PRESET_AVATAR_CSS.match(/\.omnimux-preset-seat-avatar\s*\{([^}]*)\}/)
    const row = AGENT_PRESET_AVATAR_CSS.match(/\.omnimux-preset-menu-avatar\s*\{([^}]*)\}/)
    assert.ok(seat && row)
    assert.match(seat[1], new RegExp(`width:\\s*${SEAT_AVATAR_SIZE_PX}px`))
    assert.match(seat[1], new RegExp(`height:\\s*${SEAT_AVATAR_SIZE_PX}px`))
    assert.match(row[1], new RegExp(`width:\\s*${MENU_AVATAR_SIZE_PX}px`))
    assert.match(row[1], new RegExp(`height:\\s*${MENU_AVATAR_SIZE_PX}px`))
    for (const [, body] of [seat, row]) {
      assert.match(body, /border-radius:\s*50%/)
      assert.match(body, /box-shadow:[^;]*var\(--dsw-alias-border-l2/)
    }
  })

  it('parses as real CSS', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>')
    const style = dom.window.document.createElement('style')
    style.textContent = AGENT_PRESET_AVATAR_CSS
    dom.window.document.head.appendChild(style)
    assert.ok(style.sheet.cssRules.length > 0, 'the enhancer block must parse into CSS rules')
  })
})
