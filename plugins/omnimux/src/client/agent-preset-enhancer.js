/**
 * Agent-preset seat avatar enhancer.
 *
 * The official new-session composer renders its agent-preset picker as
 * `AgentPresetSeat`: a chip whose leading glyph is one fixed three-node outline
 * icon (`…_seatIcon`), plus a portaled `Menu` whose rows carry a two-to-three
 * line description (`…_itemDesc`). The chip therefore never says *which* expert
 * is selected, and the popup grows tall enough to read as a panel rather than a
 * picker.
 *
 * This module is an overlay — it never forks, replaces, or re-renders the
 * official seat. It marks the live DOM so `HUB_CSS` can tighten the rows, and
 * it injects one avatar per expert: the seat's 18px glyph and every menu row's
 * 20px avatar. Avatars come from `blobatar` — the same deterministic generator
 * the OmniMux profile face already uses — seeded by the preset id, so an expert
 * keeps the same face across reloads, across vehicles, and across a switch that
 * re-renders the chip.
 *
 * Official class names are hashed by the CSS-module build (`PnBhwW_seat`,
 * `PnBhwW_itemDesc`, …), so every selector here matches on a stable
 * `[class*=…]` suffix, on an ARIA role, or on the markers this module writes.
 */

import { blobatarUri } from 'blobatar/uri'

/* ── Markers written onto the official DOM ───────────────────────────────── */

/** Seat avatar `<img>` class — 18px, ringed. */
export const PRESET_SEAT_AVATAR_CLASS = 'omnimux-preset-seat-avatar'
/** Menu row avatar `<img>` class — 20px, ringed. */
export const PRESET_MENU_AVATAR_CLASS = 'omnimux-preset-menu-avatar'
/** Marks the portaled preset menu (its rows are the ones HUB_CSS tightens). */
export const PRESET_MENU_ATTR = 'data-omnimux-preset-menu'
/** Marks a preset row and records the resolved preset id on it. */
export const PRESET_ITEM_ATTR = 'data-omnimux-preset-item'
/** Marks a description node for hiding, for hosts whose CSS module renamed it. */
export const PRESET_DESC_ATTR = 'data-omnimux-preset-desc'
/** Marks the seat chip itself, so other chrome can find it without a class hash. */
export const PRESET_SEAT_ATTR = 'data-omnimux-preset-seat'
/** Marks the fixed outline glyph the avatar replaces. */
export const PRESET_ICON_HIDDEN_ATTR = 'data-omnimux-preset-icon-hidden'
/** Records the resolved preset id on an injected avatar. */
export const PRESET_ID_ATTR = 'data-omnimux-preset-id'
/** Host-published override bag: `window.__omnimuxPresetAvatars`. */
export const PRESET_AVATAR_HOST_KEY = '__omnimuxPresetAvatars'

/* ── Geometry (kept identical to the HUB_CSS block below) ─────────────────── */

/** Seat glyph box. */
export const SEAT_AVATAR_SIZE_PX = 18
/** Menu row avatar box. */
export const MENU_AVATAR_SIZE_PX = 20
/** Compact row height for a single-line preset option. */
export const MENU_ITEM_MIN_HEIGHT_PX = 36

/**
 * Known experts. `hue` is the only knob that varies: blobatar derives shape,
 * eyes, and the rest from the id, so two experts never share a face while each
 * one stays stable forever. Hues are spread around the wheel so adjacent rows
 * stay distinguishable in a list.
 */
export const AGENT_PRESET_AVATARS = Object.freeze({
  'tiktok-agent': Object.freeze({ hue: 320 }),
  'software-company': Object.freeze({ hue: 214 }),
  standard: Object.freeze({ hue: 246 }),
  cordis: Object.freeze({ hue: 280 }),
  'html-generator': Object.freeze({ hue: 28 }),
  'superpowers-zh': Object.freeze({ hue: 152 }),
  ptc: Object.freeze({ hue: 186 }),
  minimal: Object.freeze({ hue: 100 }),
  'daily-work': Object.freeze({ hue: 62 }),
})

/**
 * Display names that resolve to a preset id. The roster's names are localized
 * (`preset.yml` ships 中文, the OmniMux i18n patch rewrites a few), and the DOM
 * only ever exposes the rendered name — so both languages map here, and an
 * unknown name still gets a deterministic face seeded by its own text.
 */
export const AGENT_PRESET_NAMES = Object.freeze({
  '全能社媒操盘手': 'tiktok-agent',
  'Social Media Lead': 'tiktok-agent',
  'tiktok-agent': 'tiktok-agent',
  '软件开发团队': 'software-company',
  'Software Company': 'software-company',
  'software-company': 'software-company',
  '代码开发': 'standard',
  '标准模式': 'standard',
  CodeDev: 'standard',
  Standard: 'standard',
  standard: 'standard',
  '创造模式': 'cordis',
  '创作模式': 'cordis',
  'Creator Mode': 'cordis',
  cordis: 'cordis',
  HTML生成器: 'html-generator',
  'HTML Generator': 'html-generator',
  'html-generator': 'html-generator',
  'AI编程方法论专家': 'superpowers-zh',
  'Superpowers ZH': 'superpowers-zh',
  'superpowers-zh': 'superpowers-zh',
  'PTC 模式': 'ptc',
  'PTC Mode': 'ptc',
  ptc: 'ptc',
  '极简模式': 'minimal',
  Minimal: 'minimal',
  minimal: 'minimal',
  '日常工作': 'daily-work',
  WorkAssistant: 'daily-work',
  'daily-work': 'daily-work',
})

/**
 * Configured avatars, keyed by preset id or display name. A host (or a
 * deployment config) can pin a real image here; anything unset keeps its
 * deterministic blobatar. `globalThis.__omnimuxPresetAvatars` is read on every
 * resolve, so an injected config takes effect without re-mounting.
 * @type {Map<string, string>}
 */
const presetAvatarOverrides = new Map()

/** Every label that resolves to one preset id, so a config may key either form. */
const PRESET_ID_ALIASES = (() => {
  /** @type {Map<string, string[]>} */
  const index = new Map()
  for (const [name, id] of Object.entries(AGENT_PRESET_NAMES)) {
    const names = index.get(id) ?? []
    names.push(name)
    index.set(id, names)
  }
  return index
})()

/**
 * The configured avatar in effect for one expert, if any.
 * @param {Record<string, string>} overrides
 * @param {string} id resolved preset id
 * @param {string} label the label as it was rendered
 * @returns {string} the configured URI, or '' when the expert keeps its blobatar
 */
function configuredAvatarFor(overrides, id, label) {
  for (const key of [id, label, ...(PRESET_ID_ALIASES.get(id) ?? [])]) {
    const hit = overrides[key]
    if (typeof hit === 'string' && hit.trim()) return hit.trim()
  }
  return ''
}

/**
 * Pin a real avatar for one expert.
 * @param {string} key preset id or display name
 * @param {string} uri image URI (`data:` or `https:`)
 * @returns {boolean} true when the override was stored
 */
export function registerAgentPresetAvatar(key, uri) {
  const id = typeof key === 'string' ? key.trim() : ''
  const src = typeof uri === 'string' ? uri.trim() : ''
  if (!id || !src) return false
  presetAvatarOverrides.set(id, src)
  return true
}

/** Drop every runtime-pinned avatar; deterministic faces come back. */
export function clearAgentPresetAvatarOverrides() {
  presetAvatarOverrides.clear()
}

/**
 * Configured avatars in effect: anything the host published on
 * `globalThis.__omnimuxPresetAvatars`, overridden by runtime pins.
 * @returns {Record<string, string>}
 */
export function readAgentPresetAvatarOverrides() {
  /** @type {Record<string, string>} */
  const out = {}
  const published = globalThis[PRESET_AVATAR_HOST_KEY]
  if (published && typeof published === 'object') {
    for (const [key, value] of Object.entries(published)) {
      if (typeof value === 'string' && value.trim()) out[key] = value.trim()
    }
  }
  for (const [key, value] of presetAvatarOverrides) out[key] = value
  return out
}

/**
 * Resolve the preset id a rendered name belongs to. Unknown labels answer with
 * the label itself, which keeps them deterministic and collision-free.
 * @param {unknown} label
 * @returns {string} preset id ('' when the label is empty)
 */
export function resolveAgentPresetId(label) {
  const text = typeof label === 'string' ? label.trim() : ''
  if (!text) return ''
  return AGENT_PRESET_NAMES[text] ?? text
}

/**
 * The avatar for one expert.
 * @param {unknown} label preset id or rendered display name
 * @param {{ size?: number, overrides?: Record<string, string> }} [opts]
 * @returns {{ id: string, label: string, src: string } | null} null for an empty label
 */
export function resolveAgentPresetAvatar(label, opts = {}) {
  const text = typeof label === 'string' ? label.trim() : ''
  if (!text) return null
  const id = resolveAgentPresetId(text)
  const overrides = { ...readAgentPresetAvatarOverrides(), ...(opts.overrides ?? {}) }
  const configured = configuredAvatarFor(overrides, id, text)
  if (configured) return { id, label: text, src: configured }
  const spec = AGENT_PRESET_AVATARS[id] ?? {}
  const size = Number.isFinite(Number(opts.size)) && Number(opts.size) > 0
    ? Math.round(Number(opts.size))
    : MENU_AVATAR_SIZE_PX
  return {
    id,
    label: text,
    src: blobatarUri(id, {
      ...(spec.hue === undefined ? {} : { hue: spec.hue }),
      background: 'circle',
      size,
    }),
  }
}

/* ── Seat chip ───────────────────────────────────────────────────────────── */

/** Composer containers, in the order the seat is expected to appear in. */
const SEAT_SCOPES = Object.freeze([
  '[data-composer-card]',
  '[data-composer-seat]',
  '[class*="heroWorkspaceRow"]',
  '[data-phase]',
])

/**
 * Is this element the agent-preset chip? The chip is the only composer control
 * whose label span carries `seatLabel`, and the only `aria-haspopup` control
 * whose class ends in `seat`; the ModelSelect trigger (also a menu button) has
 * neither.
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function isAgentPresetSeatButton(el) {
  if (!el || typeof el.querySelector !== 'function') return false
  if (typeof el.hasAttribute === 'function' && el.hasAttribute(PRESET_SEAT_ATTR)) return true
  if (el.querySelector('[class*="seatLabel"]')) return true
  if (el.querySelector('[class*="seatIcon"]')) return true
  const cls = typeof el.getAttribute === 'function' ? el.getAttribute('class') ?? '' : ''
  const isSeatClass = /(^|[\s_-])seat($|[\s_-])/.test(cls)
  const hasPopup = typeof el.getAttribute === 'function' && el.getAttribute('aria-haspopup') === 'menu'
  return isSeatClass && hasPopup
}

/**
 * @param {ParentNode | null | undefined} root
 * @returns {Element | null}
 */
function findSeatIn(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return null
  for (const el of root.querySelectorAll('button')) {
    if (isAgentPresetSeatButton(el)) return el
  }
  return null
}

/**
 * The live agent-preset chip, preferring the composer over any other menu
 * button on the page.
 * @param {Document | undefined} doc
 * @returns {Element | null}
 */
export function findAgentPresetSeat(doc = globalThis.document) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  for (const scope of SEAT_SCOPES) {
    const root = doc.querySelector(scope)
    if (!root) continue
    const hit = findSeatIn(root)
    if (hit) return hit
  }
  return findSeatIn(doc)
}

/**
 * The expert name the chip currently shows. During the intro reveal the label
 * is split into one span per character; `textContent` reads through that.
 * @param {Element | null | undefined} seat
 * @returns {string}
 */
export function seatLabelText(seat) {
  if (!seat || typeof seat.querySelector !== 'function') return ''
  const label = seat.querySelector('[class*="seatLabel"]')
  const text = label?.textContent ?? ''
  return typeof text === 'string' ? text.trim() : ''
}

/**
 * Sync the chip's avatar to the expert it currently names. Writes only when the
 * source changed, so the mutation observer this module installs cannot loop.
 * @param {Document | undefined} doc
 * @param {Element | null} [seat]
 * @returns {{ id: string, label: string } | null} the synced expert, or null
 */
export function syncSeatAvatar(doc = globalThis.document, seat = findAgentPresetSeat(doc)) {
  if (!doc || !seat || typeof seat.querySelector !== 'function') return null
  const label = seatLabelText(seat)
  const resolved = resolveAgentPresetAvatar(label, { size: SEAT_AVATAR_SIZE_PX })
  if (!resolved) return null

  if (seat.getAttribute(PRESET_SEAT_ATTR) !== resolved.id) {
    seat.setAttribute(PRESET_SEAT_ATTR, resolved.id)
  }

  let avatar = seat.querySelector(`img.${PRESET_SEAT_AVATAR_CLASS}`)
  if (!avatar) {
    avatar = doc.createElement('img')
    avatar.setAttribute('class', PRESET_SEAT_AVATAR_CLASS)
    avatar.setAttribute('alt', '')
    avatar.setAttribute('aria-hidden', 'true')
    avatar.setAttribute('width', String(SEAT_AVATAR_SIZE_PX))
    avatar.setAttribute('height', String(SEAT_AVATAR_SIZE_PX))
    seat.insertBefore(avatar, seat.firstChild)
  }
  if (avatar.getAttribute('src') !== resolved.src) avatar.setAttribute('src', resolved.src)
  if (avatar.getAttribute(PRESET_ID_ATTR) !== resolved.id) {
    avatar.setAttribute(PRESET_ID_ATTR, resolved.id)
  }

  // The fixed outline glyph is hidden rather than removed: React owns this
  // subtree and would restore a deleted node, while a marked one stays hidden.
  const icon = seat.querySelector('[class*="seatIcon"]') ?? seat.querySelector('svg')
  if (icon && typeof icon.setAttribute === 'function' && !icon.hasAttribute(PRESET_ICON_HIDDEN_ATTR)) {
    icon.setAttribute(PRESET_ICON_HIDDEN_ATTR, '')
  }
  return { id: resolved.id, label: resolved.label }
}

/* ── Portaled picker menu ────────────────────────────────────────────────── */

/**
 * Is this row an agent-preset option? Rows of the preset menu carry both an
 * `…_itemName` and an `…_itemDesc` span. The composer's other portaled menu —
 * the slash/trigger candidate list — carries `…_itemDescription` instead, and
 * is deliberately excluded so its descriptions survive.
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function isAgentPresetMenuItem(el) {
  if (!el || typeof el.querySelector !== 'function') return false
  if (typeof el.getAttribute === 'function' && el.getAttribute('role') !== 'menuitem') return false
  if (el.querySelector('[class*="itemDescription"]')) return false
  if (!el.querySelector('[class*="itemDesc"]')) return false
  if (!el.querySelector('[class*="itemName"]')) return false
  return true
}

/**
 * Every portaled preset menu currently in the document.
 * @param {Document | undefined} doc
 * @returns {Array<{ menu: Element, items: Element[] }>}
 */
export function findAgentPresetMenus(doc = globalThis.document) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return []
  /** @type {Array<{ menu: Element, items: Element[] }>} */
  const found = []
  for (const menu of doc.querySelectorAll('[role="menu"]')) {
    const items = []
    for (const item of menu.querySelectorAll('[role="menuitem"]')) {
      if (isAgentPresetMenuItem(item)) items.push(item)
    }
    if (items.length > 0) found.push({ menu, items })
  }
  return found
}

/**
 * @param {Element} item
 * @returns {string}
 */
function menuItemName(item) {
  const name = item.querySelector('[class*="itemName"]')
  const text = name?.textContent ?? item.textContent ?? ''
  return typeof text === 'string' ? text.trim() : ''
}

/**
 * Add one row's avatar and markers.
 * @param {Document} doc
 * @param {Element} item
 * @returns {string} resolved preset id ('' when the row carried no name)
 */
function decorateMenuItem(doc, item) {
  const resolved = resolveAgentPresetAvatar(menuItemName(item), { size: MENU_AVATAR_SIZE_PX })
  if (!resolved) return ''

  if (item.getAttribute(PRESET_ITEM_ATTR) !== resolved.id) {
    item.setAttribute(PRESET_ITEM_ATTR, resolved.id)
  }

  const desc = item.querySelector('[class*="itemDesc"]')
  if (desc && typeof desc.setAttribute === 'function' && !desc.hasAttribute(PRESET_DESC_ATTR)) {
    desc.setAttribute(PRESET_DESC_ATTR, '')
  }

  let avatar = item.querySelector(`img.${PRESET_MENU_AVATAR_CLASS}`)
  if (!avatar) {
    avatar = doc.createElement('img')
    avatar.setAttribute('class', PRESET_MENU_AVATAR_CLASS)
    avatar.setAttribute('alt', '')
    avatar.setAttribute('aria-hidden', 'true')
    avatar.setAttribute('width', String(MENU_AVATAR_SIZE_PX))
    avatar.setAttribute('height', String(MENU_AVATAR_SIZE_PX))
    item.insertBefore(avatar, item.firstChild)
  }
  if (avatar.getAttribute('src') !== resolved.src) avatar.setAttribute('src', resolved.src)
  if (avatar.getAttribute(PRESET_ID_ATTR) !== resolved.id) {
    avatar.setAttribute(PRESET_ID_ATTR, resolved.id)
  }
  return resolved.id
}

/**
 * Inject avatars into every open preset menu and mark its rows compact.
 * @param {Document | undefined} doc
 * @returns {number} number of decorated rows
 */
export function syncMenuAvatars(doc = globalThis.document) {
  if (!doc) return 0
  let count = 0
  for (const { menu, items } of findAgentPresetMenus(doc)) {
    if (menu.getAttribute(PRESET_MENU_ATTR) !== 'true') menu.setAttribute(PRESET_MENU_ATTR, 'true')
    for (const item of items) {
      if (decorateMenuItem(doc, item)) count += 1
    }
  }
  return count
}

/* ── Install / teardown ──────────────────────────────────────────────────── */

/** @type {Document | null} */
let activeDoc = null
/** @type {MutationObserver | null} */
let observer = null
/** @type {(() => void) | null} */
let clickListener = null
/** Coalesces a mutation burst into one apply per microtask. */
let scheduled = false
/** Set while this module writes, so its own records are not re-processed. */
let applying = false

/**
 * One pass: sync the chip, then every open preset menu.
 * @param {Document | undefined} doc
 * @returns {{ seat: { id: string, label: string } | null, items: number }}
 */
export function applyAgentPresetAvatars(doc = globalThis.document) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return { seat: null, items: 0 }
  return { seat: syncSeatAvatar(doc), items: syncMenuAvatars(doc) }
}

/**
 * Install the enhancer: one debounced `MutationObserver` plus a capture-phase
 * click listener (the picker menu is portaled to `<body>`, so it arrives as a
 * mutation rather than as a child of the chip).
 * @param {Document | undefined} doc
 * @returns {() => void} disposer
 */
export function installAgentPresetAvatarEnhancer(doc = globalThis.document) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return () => {}
  uninstallAgentPresetAvatarEnhancer()
  activeDoc = doc

  const apply = () => {
    if (applying) return
    applying = true
    try {
      applyAgentPresetAvatars(activeDoc ?? doc)
    } finally {
      applying = false
    }
  }

  const schedule = () => {
    if (scheduled || applying) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      apply()
    })
  }

  const MutationObserverCtor = globalThis.MutationObserver
  if (typeof MutationObserverCtor === 'function') {
    observer = new MutationObserverCtor(schedule)
    const root = doc.documentElement ?? doc.body
    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-expanded', 'class'],
      })
    }
  }

  if (typeof doc.addEventListener === 'function') {
    clickListener = () => { schedule() }
    doc.addEventListener('click', clickListener, true)
  }

  apply()
  return uninstallAgentPresetAvatarEnhancer
}

/**
 * Remove every injected node and marker, and stop observing. Safe to call when
 * nothing was installed.
 */
export function uninstallAgentPresetAvatarEnhancer() {
  if (observer) {
    try { observer.disconnect() } catch { /* the observer is already dead */ }
    observer = null
  }
  const doc = activeDoc
  if (doc && clickListener && typeof doc.removeEventListener === 'function') {
    doc.removeEventListener('click', clickListener, true)
  }
  clickListener = null
  scheduled = false
  if (doc) clearInjectedAvatars(doc)
  activeDoc = null
}

/**
 * Sweep every marker and injected element this module can have written. Driven
 * by the document rather than by remembered references, so rows React recreated
 * while the enhancer was live are cleaned too.
 * @param {Document | undefined} doc
 */
export function clearInjectedAvatars(doc = globalThis.document) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return
  for (const node of doc.querySelectorAll(`img.${PRESET_SEAT_AVATAR_CLASS}, img.${PRESET_MENU_AVATAR_CLASS}`)) {
    node.remove()
  }
  const sweep = `[${PRESET_SEAT_ATTR}],[${PRESET_MENU_ATTR}],[${PRESET_ITEM_ATTR}],[${PRESET_DESC_ATTR}],[${PRESET_ICON_HIDDEN_ATTR}]`
  for (const el of doc.querySelectorAll(sweep)) {
    for (const attr of [
      PRESET_SEAT_ATTR,
      PRESET_MENU_ATTR,
      PRESET_ITEM_ATTR,
      PRESET_DESC_ATTR,
      PRESET_ICON_HIDDEN_ATTR,
    ]) {
      if (typeof el.removeAttribute === 'function') el.removeAttribute(attr)
    }
  }
}

/** Test-only: uninstall and drop runtime-pinned avatars. */
export function resetAgentPresetEnhancerForTests() {
  uninstallAgentPresetAvatarEnhancer()
  clearAgentPresetAvatarOverrides()
  delete globalThis[PRESET_AVATAR_HOST_KEY]
}

/**
 * Styles the enhancer depends on. `styles.js` interpolates this into `HUB_CSS`,
 * so the injected markers and the rules acting on them ship as one block and
 * cannot drift apart.
 *
 * Description hiding is scoped to the preset menu. A bare
 * `[class*="itemDesc"]` would also match the slash/trigger candidate menu's
 * `…_itemDescription` rows and strip descriptions from an unrelated composer
 * surface; `[data-omnimux-preset-desc]` plus the menu-scoped selector cover
 * every row of this menu instead.
 */
export const AGENT_PRESET_AVATAR_CSS = `
/* ── Agent preset seat: expert avatar, single-line picker rows, no descriptions ── */
[class*="AgentPresetSeat_itemDesc"],
[data-omnimux-preset-desc],
[data-omnimux-preset-menu] [class*="itemDesc"] {
  display: none !important;
}

/* The fixed three-node outline glyph yields to the expert's avatar. */
[data-omnimux-preset-icon-hidden] {
  display: none !important;
}

/* The row itself. Production ships hashed class names, so the row is matched by
   the marker this module writes; the unhashed name is kept for a build that
   renders it, with :not() guards so the prefixed name/label/description
   children never inherit the row's padding. */
[class*="AgentPresetSeat_item"]:not([class*="AgentPresetSeat_itemName"]):not([class*="AgentPresetSeat_itemDesc"]):not([class*="AgentPresetSeat_itemLabel"]),
[data-omnimux-preset-item] {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 8px !important;
  min-height: ${MENU_ITEM_MIN_HEIGHT_PX}px;
  max-width: 280px;
  padding: 8px 10px !important;
  box-sizing: border-box !important;
}

/* One line per expert: the name truncates instead of wrapping. */
[data-omnimux-preset-menu] [class*="itemName"] {
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* The active row keeps its check, pinned to the right edge of the row. */
[data-omnimux-preset-item] > [class*="check"],
[data-omnimux-preset-item] > svg {
  flex: none !important;
  margin-left: auto !important;
}

[data-omnimux-preset-item] > [class*="itemLabel"] {
  flex: 1 1 auto !important;
  min-width: 0;
}

.omnimux-preset-seat-avatar {
  width: ${SEAT_AVATAR_SIZE_PX}px;
  height: ${SEAT_AVATAR_SIZE_PX}px;
  border-radius: 50%;
  flex: none;
  display: block;
  object-fit: cover;
  background: var(--dsw-alias-bg-layer-2, transparent);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.28)), 0 1px 2px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.25));
}

.omnimux-preset-menu-avatar {
  width: ${MENU_AVATAR_SIZE_PX}px;
  height: ${MENU_AVATAR_SIZE_PX}px;
  border-radius: 50%;
  flex: none;
  display: block;
  object-fit: cover;
  background: var(--dsw-alias-bg-layer-2, transparent);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
}
`
