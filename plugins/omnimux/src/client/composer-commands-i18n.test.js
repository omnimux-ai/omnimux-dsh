import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  isZhLocale,
  getActiveLang,
  splitBilingualDescription,
  resolveCommandDisplayName,
  resolveCommandDescription,
  resolveRawCommandName,
  scoreCommandCandidate,
  enhanceCommandCandidates,
  wrapCommandUi,
  normalizeCommandContribution,
  repairRegisteredCommandContributions,
  installCommandsI18n,
  patchPrimitivesReferenceIcon,
  renderLibraryIcon,
  renderGoalIcon,
  renderPlanIcon,
  renderCompactIcon,
  renderPermissionIcon,
  renderFeedbackIcon,
  renderExportIcon,
  syncMenuIcons,
  installMenuIconsAutoSync,
  ensurePlacementStyles,
  shouldPlaceMenuBelow,
  syncMenuPlacement,
  syncAllComposerMenus,
  installMenuAutoSync,
  COMMAND_ICONS,
  COMMAND_I18N,
  ZH_NAME_TO_RAW,
} from './composer-commands-i18n.js'

test('isZhLocale & getActiveLang', () => {
  assert.equal(isZhLocale(null), true)
  assert.equal(isZhLocale({}), true)
  assert.equal(isZhLocale({ getSnapshot: () => ({ active: 'zh-CN' }) }), true)
  assert.equal(isZhLocale({ getSnapshot: () => ({ active: 'zh' }) }), true)
  assert.equal(isZhLocale({ getSnapshot: () => ({ active: 'en-US' }) }), false)
  assert.equal(isZhLocale({ getSnapshot: () => ({ active: 'en' }) }), false)
  assert.equal(getActiveLang({ getSnapshot: () => ({ active: 'en' }) }), 'en')
  assert.equal(getActiveLang({ getSnapshot: () => ({ active: 'zh-Hans' }) }), 'zh')
})

test('splitBilingualDescription splits slash copy', () => {
  assert.equal(splitBilingualDescription('添加文件 / Add files', 'zh'), '添加文件')
  assert.equal(splitBilingualDescription('添加文件 / Add files', 'en'), 'Add files')
  assert.equal(splitBilingualDescription('从资产库添加 / Add from library', 'zh'), '从资产库添加')
  assert.equal(splitBilingualDescription('从资产库添加 / Add from library', 'en'), 'Add from library')
  assert.equal(splitBilingualDescription('纯中文描述', 'zh'), '纯中文描述')
  assert.equal(splitBilingualDescription('Pure English', 'en'), 'Pure English')
})

test('vector icon renderers return valid SVG elements', () => {
  const icons = [
    renderLibraryIcon(16, 'custom-class'),
    renderGoalIcon(16),
    renderPlanIcon(16),
    renderCompactIcon(16),
    renderPermissionIcon(16),
    renderFeedbackIcon(16),
    renderExportIcon(16),
  ]
  for (const icon of icons) {
    assert.equal(icon.type, 'svg')
    assert.equal(icon.props.width, 16)
    assert.equal(icon.props.height, 16)
    assert.equal(icon.props['aria-hidden'], true)
  }
  assert.equal(icons[0].props.className, 'custom-class')
})

test('patchPrimitivesReferenceIcon enhances ReferenceIcon and restores cleanly', () => {
  let originalCalledWith = null
  const originalRefIcon = (props) => {
    originalCalledWith = props
    return { type: 'original-icon', kind: props.kind }
  }
  const fakePrimitives = {
    ReferenceIcon: originalRefIcon,
  }

  const unpatch = patchPrimitivesReferenceIcon(fakePrimitives)
  assert.notEqual(fakePrimitives.ReferenceIcon, originalRefIcon)

  // 1. Custom command icons render custom SVGs
  const library = fakePrimitives.ReferenceIcon({ kind: 'add-from-library', size: 16 })
  assert.equal(library.type, 'svg')

  const plan = fakePrimitives.ReferenceIcon({ kind: 'plan', size: 16 })
  assert.equal(plan.type, 'svg')

  const goal = fakePrimitives.ReferenceIcon({ kind: 'goal', size: 16 })
  assert.equal(goal.type, 'svg')

  // 2. Original reference kinds pass through to originalRefIcon
  const session = fakePrimitives.ReferenceIcon({ kind: 'session', size: 16 })
  assert.equal(session.type, 'original-icon')
  assert.equal(originalCalledWith.kind, 'session')

  // 3. Unpatch restores original
  unpatch()
  assert.equal(fakePrimitives.ReferenceIcon, originalRefIcon)

  // 4. Handles proxy objects with read-only getters
  let backingRefIcon = originalRefIcon
  const getterPrimitives = {}
  Object.defineProperty(getterPrimitives, 'ReferenceIcon', {
    get: () => backingRefIcon,
    configurable: true,
  })
  const unpatchGetter = patchPrimitivesReferenceIcon(getterPrimitives)
  assert.equal(typeof getterPrimitives.ReferenceIcon, 'function')
  assert.notEqual(getterPrimitives.ReferenceIcon, originalRefIcon)
  unpatchGetter()
})

test('resolveCommandDisplayName localizes command names on the left', () => {
  const zhLocale = { getSnapshot: () => ({ active: 'zh-CN' }) }
  const enLocale = { getSnapshot: () => ({ active: 'en-US' }) }

  // Chinese locale: left names become Chinese
  assert.equal(resolveCommandDisplayName('add-from-library', zhLocale), '从资产库添加')
  assert.equal(resolveCommandDisplayName('compact', zhLocale), '压缩历史')
  assert.equal(resolveCommandDisplayName('feedback', zhLocale), '会话反馈')
  assert.equal(resolveCommandDisplayName('permission', zhLocale), '权限预设')
  assert.equal(resolveCommandDisplayName('plan', zhLocale), '计划模式')
  assert.equal(resolveCommandDisplayName('goal', zhLocale), '任务目标')
  assert.equal(resolveCommandDisplayName('export', zhLocale), '导出日志')

  // English locale: left names stay canonical English
  assert.equal(resolveCommandDisplayName('add-from-library', enLocale), 'add-from-library')
  assert.equal(resolveCommandDisplayName('compact', enLocale), 'compact')
  assert.equal(resolveCommandDisplayName('plan', enLocale), 'plan')

  // Unknown command fallbacks to raw name
  assert.equal(resolveCommandDisplayName('unknown-cmd', zhLocale), 'unknown-cmd')
})

test('resolveRawCommandName reverses Chinese name to canonical name', () => {
  assert.equal(resolveRawCommandName('从资产库添加'), 'add-from-library')
  assert.equal(resolveRawCommandName('压缩历史'), 'compact')
  assert.equal(resolveRawCommandName('计划模式'), 'plan')
  assert.equal(resolveRawCommandName('add-from-library'), 'add-from-library')
  assert.equal(resolveRawCommandName('compact'), 'compact')
})

test('enhanceCommandCandidates binds icons to every candidate', () => {
  const allRows = [
    { name: 'add-from-library', description: '从资产库添加 / Add from library' },
    { name: 'compact', description: 'Compact older conversation history' },
    { name: 'plan', description: 'Enter or leave plan mode' },
    { name: 'goal', description: 'set or view the goal' },
  ]
  const zhLocale = { getSnapshot: () => ({ active: 'zh-CN' }) }

  const zhList = enhanceCommandCandidates(allRows, { query: '' }, zhLocale)
  assert.equal(zhList.length, 4)
  assert.equal(zhList[0].name, '从资产库添加')
  assert.equal(zhList[0].icon, 'add-from-library')
  assert.equal(zhList[1].name, '压缩历史')
  assert.equal(zhList[1].icon, 'compact')
  assert.equal(zhList[2].name, '计划模式')
  assert.equal(zhList[2].icon, 'plan')
  assert.equal(zhList[3].name, '任务目标')
  assert.equal(zhList[3].icon, 'goal')
})

test('scoreCommandCandidate handles Chinese name, English rawName, prefix, keyword and fuzzy queries', () => {
  const candidate = {
    name: '添加文件',
    rawName: 'add-from-library',
    icon: 'add-from-library',
    description: '从统一资产库选择素材',
  }

  // Exact Chinese name
  assert.equal(scoreCommandCandidate(candidate, '添加文件', 'zh'), 1000)
  // Exact English rawName
  assert.equal(scoreCommandCandidate(candidate, 'add-from-library', 'zh'), 1000)
  // Chinese prefix
  assert(scoreCommandCandidate(candidate, '添加', 'zh') > 500)
  // English prefix
  assert(scoreCommandCandidate(candidate, 'add', 'zh') > 400)
  // Keywords
  assert(scoreCommandCandidate(candidate, '素材', 'zh') > 0)
  assert(scoreCommandCandidate(candidate, 'sucai', 'zh') > 0)
  // Unmatched
  assert.equal(scoreCommandCandidate(candidate, 'xyz123', 'zh'), undefined)
})

test('wrapCommandUi hooks candidates, dispatch, matchSpace, matchEnter and unwraps names', async () => {
  const rawRows = [
    { name: 'add-from-library', description: '从资产库添加 / Add from library' },
    { name: 'compact', description: 'Compact older conversation history' },
    { name: 'plan', description: 'Enter or leave plan mode' },
  ]
  let dispatchedPick = null
  let matchedSpaceToken = null
  let matchedEnterLine = null

  const fakeCommandUi = {
    candidates: async (session, req) => rawRows,
    dispatch: (pick) => {
      dispatchedPick = pick
      return 'handled'
    },
    matchSpace: (session, token) => {
      matchedSpaceToken = token
      return { claim: token }
    },
    matchEnter: async (session, line) => {
      matchedEnterLine = line
      return 'handled'
    },
  }
  const fakeLocale = {
    getSnapshot: () => ({ active: 'zh-CN' }),
  }

  const dispose = wrapCommandUi(fakeCommandUi, fakeLocale)

  // 1. Test candidates yield Chinese names on left and icons
  const res = await fakeCommandUi.candidates({ sessionId: 's1' }, { query: '' })
  assert.equal(res[0].name, '从资产库添加')
  assert.equal(res[0].rawName, 'add-from-library')
  assert.equal(res[0].icon, 'add-from-library')
  assert.equal(res[1].name, '压缩历史')
  assert.equal(res[1].rawName, 'compact')
  assert.equal(res[1].icon, 'compact')

  // 2. Test dispatch unwraps Chinese name to rawName
  fakeCommandUi.dispatch({
    candidate: res[0],
    session: { sessionId: 's1' },
  })
  assert.equal(dispatchedPick.candidate.name, 'add-from-library')

  // 3. Test matchSpace maps "/从资产库添加 " to "/add-from-library"
  fakeCommandUi.matchSpace({ sessionId: 's1' }, '/从资产库添加')
  assert.equal(matchedSpaceToken, '/add-from-library')

  // 4. Test matchEnter maps "/计划模式 off" to "/plan off"
  await fakeCommandUi.matchEnter({ sessionId: 's1' }, '/计划模式 off')
  assert.equal(matchedEnterLine, '/plan off')

  // 5. Test dispose restores original methods
  dispose()
  assert.equal(fakeCommandUi.dispatch({ candidate: { name: '从资产库添加' } }), 'handled')
  assert.equal(dispatchedPick.candidate.name, '从资产库添加')
})

test('syncMenuIcons injects matching SVG icons to menu option buttons', () => {
  const dom = new JSDOM(`
    <div class="menu">
      <button role="option">
        <span class="iRJKyq_itemIcon" aria-hidden="true"></span>
        <span class="iRJKyq_itemName">压缩历史</span>
        <span class="iRJKyq_itemDescription">压缩较早的历史对话上下文</span>
      </button>
      <button role="option">
        <span class="iRJKyq_itemName">从资产库添加</span>
      </button>
      <button role="option">
        <span class="iRJKyq_itemName">未知命令</span>
      </button>
    </div>
  `)
  const doc = dom.window.document

  const patched = syncMenuIcons(doc)
  assert.equal(patched, 2)

  const buttons = doc.querySelectorAll('button[role="option"]')
  // Button 1: existing icon span had SVG injected
  const icon1 = buttons[0].querySelector('.iRJKyq_itemIcon')
  assert.ok(icon1)
  assert.ok(icon1.innerHTML.includes('<svg'))
  assert.equal(icon1.dataset.iconCommand, '压缩历史')

  // Button 2: missing icon span was automatically created before itemName
  const icon2 = buttons[1].querySelector('.iRJKyq_itemIcon')
  assert.ok(icon2)
  assert.ok(icon2.innerHTML.includes('<svg'))
  assert.equal(icon2.dataset.iconCommand, '从资产库添加')

  // Button 3: unknown command remains untouched
  const icon3 = buttons[2].querySelector('.iRJKyq_itemIcon')
  assert.equal(icon3, null)

  // Subsequent call is idempotent
  const secondRun = syncMenuIcons(doc)
  assert.equal(secondRun, 0)
})

test('installMenuIconsAutoSync observes DOM and cleans up', (t, done) => {
  const dom = new JSDOM(`<div id="root"></div>`)
  const doc = dom.window.document
  const cleanup = installMenuIconsAutoSync(doc)
  assert.equal(typeof cleanup, 'function')

  // Simulate menu row addition
  const root = doc.getElementById('root')
  const btn = doc.createElement('button')
  btn.setAttribute('role', 'option')
  btn.innerHTML = '<span class="iRJKyq_itemName">计划模式</span>'
  root.appendChild(btn)

  // Wait a tick
  setTimeout(() => {
    const icon = btn.querySelector('.iRJKyq_itemIcon')
    assert.ok(icon)
    assert.ok(icon.innerHTML.includes('<svg'))
    cleanup()
    done()
  }, 30)
})

test('ensurePlacementStyles injects idempotent placement CSS stylesheet into document head', () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`)
  const doc = dom.window.document

  ensurePlacementStyles(doc)
  const style1 = doc.getElementById('dsh-omnimux-menu-placement')
  assert.ok(style1)
  assert.ok(style1.textContent.includes('data-menu-placement="bottom"'))

  // Second run is idempotent
  ensurePlacementStyles(doc)
  const styles = doc.querySelectorAll('#dsh-omnimux-menu-placement')
  assert.equal(styles.length, 1)
})

test('shouldPlaceMenuBelow correctly identifies hero/bottom/middle states', () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div class="container Q7WfXG_hero">
      <div data-composer-card></div>
    </div>
    <div class="normal-session">
      <div id="bottom-card" data-composer-card></div>
    </div>
  </body></html>`)
  const win = dom.window
  win.innerHeight = 1000

  const heroCard = dom.window.document.querySelector('.Q7WfXG_hero [data-composer-card]')
  const bottomCard = dom.window.document.getElementById('bottom-card')

  // 1. Hero card in middle of screen (spaceBelow = 600 >= 220) -> true
  heroCard.getBoundingClientRect = () => ({ top: 300, bottom: 400, height: 100 })
  assert.equal(shouldPlaceMenuBelow(heroCard, null, win), true)

  // 2. Card at bottom of screen (spaceBelow = 50 < 220) -> false (keep above)
  bottomCard.getBoundingClientRect = () => ({ top: 850, bottom: 950, height: 100 })
  assert.equal(shouldPlaceMenuBelow(bottomCard, null, win), false)

  // 3. Normal session, but card in middle with spaceBelow > spaceAbove (top: 200, bottom: 300, spaceBelow: 700) -> true
  bottomCard.getBoundingClientRect = () => ({ top: 200, bottom: 300, height: 100 })
  assert.equal(shouldPlaceMenuBelow(bottomCard, null, win), true)

  // 4. Edge cases: null card or window
  assert.equal(shouldPlaceMenuBelow(null, null, win), false)
  assert.equal(shouldPlaceMenuBelow(heroCard, null, null), false)
})

test('syncMenuPlacement applies bottom placement in hero mode and restores in bottom mode', () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div class="Q7WfXG_hero">
      <div data-composer-card>
        <div class="overlayAnchor">
          <div data-trigger-menu class="iRJKyq_menu"></div>
        </div>
      </div>
    </div>
  </body></html>`)
  const doc = dom.window.document
  const win = dom.window
  win.innerHeight = 1000

  const card = doc.querySelector('[data-composer-card]')
  const anchor = doc.querySelector('.overlayAnchor')
  const menu = doc.querySelector('[data-trigger-menu]')

  // A. Hero mode with plenty of room below
  card.getBoundingClientRect = () => ({ top: 300, bottom: 420, height: 120 })
  const result1 = syncMenuPlacement(menu, doc)
  assert.equal(result1, true)
  assert.equal(card.dataset.menuPlacement, 'bottom')
  assert.equal(anchor.dataset.overlayPlacement, 'bottom')
  assert.equal(menu.dataset.placement, 'bottom')
  assert.equal(menu.style.top, 'calc(100% + 4px)')
  assert.equal(menu.style.bottom, 'auto')
  assert.equal(menu.style.maxHeight, '320px')

  // B. Switch card to bottom mode (e.g. user scrolled or session with messages)
  card.getBoundingClientRect = () => ({ top: 880, bottom: 980, height: 100 })
  card.parentElement.className = 'normal-session' // remove hero class
  const result2 = syncMenuPlacement(menu, doc)
  assert.equal(result2, false)
  assert.equal(card.dataset.menuPlacement, undefined)
  assert.equal(anchor.dataset.overlayPlacement, undefined)
  assert.equal(menu.dataset.placement, undefined)
  assert.equal(menu.style.top, '')
  assert.equal(menu.style.bottom, '')
  assert.equal(menu.style.maxHeight, '')
})

test('syncAllComposerMenus updates icons, placement, and pre-tags card', () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
    <div class="Q7WfXG_hero">
      <div data-composer-card>
        <div class="overlayAnchor">
          <div data-trigger-menu>
            <button role="option">
              <span class="iRJKyq_itemName">从资产库添加</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </body></html>`)
  const doc = dom.window.document
  dom.window.innerHeight = 1000
  const card = doc.querySelector('[data-composer-card]')
  card.getBoundingClientRect = () => ({ top: 280, bottom: 400, height: 120 })

  const res = syncAllComposerMenus(doc)
  assert.equal(res.patchedIcons, 1)
  assert.equal(res.placedBelowCount, 1)
  assert.equal(card.dataset.menuPlacement, 'bottom')
})

test('installMenuAutoSync handles pointerdown on add button and cleans up', () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
    <div class="Q7WfXG_hero">
      <div data-composer-card>
        <button class="Q7WfXG_add" aria-label="指令"></button>
        <div class="overlayAnchor"></div>
      </div>
    </div>
  </body></html>`)
  const doc = dom.window.document
  dom.window.innerHeight = 1000
  const card = doc.querySelector('[data-composer-card]')
  card.getBoundingClientRect = () => ({ top: 280, bottom: 400, height: 120 })

  const cleanup = installMenuAutoSync(doc)
  assert.equal(typeof cleanup, 'function')

  const btn = doc.querySelector('.Q7WfXG_add')
  // Trigger pointerdown on add button
  const ev = new dom.window.Event('pointerdown', { bubbles: true })
  btn.dispatchEvent(ev)

  assert.equal(card.dataset.menuPlacement, 'bottom')
  const anchor = doc.querySelector('.overlayAnchor')
  assert.equal(anchor.dataset.overlayPlacement, 'bottom')

  cleanup()
})

/**
 * Minimal stand-in for the host CommandUiRuntime: it keeps registrations in a
 * `live.contributions` map and, exactly like `ui-commands/src/client/service.ts`
 * candidate synthesis, CALLS `contribution.description()`.
 */
function createHostLikeCommandUi() {
  const contributions = new Map()
  return {
    live: { contributions },
    register(contribution) {
      contributions.set(contribution.name, contribution)
      return () => {
        contributions.delete(contribution.name)
      }
    },
    async candidates(session, req) {
      const rows = [{ name: 'add-from-library', description: 'Add from library' }]
      for (const contribution of contributions.values()) {
        if (!contribution.available(session)) continue
        rows.push({ name: contribution.name, description: contribution.description() })
      }
      return req?.query ? rows.filter((row) => row.name.includes(req.query)) : rows
    },
    dispatch: () => 'handled',
    matchSpace: () => undefined,
    matchEnter: async () => undefined,
  }
}

const legacyFastContribution = () => ({
  name: 'fast',
  // The pre-0.1.5 shape: a plain string, not a resolver function.
  description: '快速模式',
  available: () => true,
  ui: { kind: 'popupSelect', options: async () => [], onSelect: () => {} },
})

const fakeZhLocale = { getSnapshot: () => ({ active: 'zh-CN' }) }

test('normalizeCommandContribution keeps the contract and is idempotent', () => {
  const legacy = legacyFastContribution()
  const normalized = normalizeCommandContribution(legacy)
  assert.equal(typeof normalized.description, 'function')
  assert.equal(normalized.description(), '快速模式')
  assert.equal(normalized.name, 'fast')
  assert.equal(normalized.ui, legacy.ui)
  // idempotent: a callable description is passed through by identity
  assert.equal(normalizeCommandContribution(normalized), normalized)
  // defensive: nothing here may throw on odd input
  assert.equal(normalizeCommandContribution(null), null)
  assert.equal(normalizeCommandContribution(undefined), undefined)
  assert.equal(normalizeCommandContribution('nope'), 'nope')
  const emptyDescription = normalizeCommandContribution({ name: 'x' })
  assert.equal(emptyDescription.description(), '')
})

test('the host call site really breaks on an unnormalized legacy contribution', async () => {
  // Pins the failure the fix exists for: a string description makes the host
  // throw TypeError and drops the whole `command` source.
  const commandUi = createHostLikeCommandUi()
  commandUi.register(legacyFastContribution())
  await assert.rejects(
    () => commandUi.candidates({ sessionId: 's1' }, { query: '' }),
    (error) => error instanceof TypeError && /description is not a function/u.test(error.message),
  )
})

test('wrapCommandUi normalizes contributions registered after the wrapper (composer + menu path)', async () => {
  const commandUi = createHostLikeCommandUi()
  const dispose = wrapCommandUi(commandUi, fakeZhLocale)

  const release = commandUi.register(legacyFastContribution())
  const stored = commandUi.live.contributions.get('fast')
  assert.equal(typeof stored.description, 'function')
  assert.equal(stored.description(), '快速模式')

  // The host's candidate synthesis must now complete instead of throwing, and
  // the enhanced rows keep the localized string shape the menu renders.
  const rows = await commandUi.candidates({ sessionId: 's1' }, { query: '' })
  assert.deepEqual(rows.map((row) => row.name), ['从资产库添加', 'fast'])
  assert.equal(rows[0].rawName, 'add-from-library')
  assert.equal(rows[0].description, '从统一资产库选择素材')
  assert.equal(typeof rows[1].description, 'string')

  // The contribution disposer still reaches the host registry
  release()
  assert.equal(commandUi.live.contributions.has('fast'), false)

  dispose()
  assert.equal(typeof commandUi.register, 'function')
  assert.equal(commandUi.live.contributions.size, 0)
})

test('wrapCommandUi repairs a contribution registered before the wrapper (load-order safety net)', async () => {
  const commandUi = createHostLikeCommandUi()
  // Registered first, so the wrapper cannot intercept it: only the repair
  // fallback inside the candidate path can save this pass.
  commandUi.register(legacyFastContribution())

  const dispose = wrapCommandUi(commandUi, fakeZhLocale)
  const rows = await commandUi.candidates({ sessionId: 's1' }, { query: '' })
  assert.deepEqual(rows.map((row) => row.name), ['从资产库添加', 'fast'])
  assert.equal(typeof commandUi.live.contributions.get('fast').description, 'function')
  dispose()
})

test('wrapCommandUi leaves compliant contributions and non-contract failures alone', async () => {
  const commandUi = createHostLikeCommandUi()
  const dispose = wrapCommandUi(commandUi, fakeZhLocale)

  const compliant = {
    name: 'model',
    description: () => '切换模型',
    available: () => true,
    ui: { kind: 'popupSelect', options: async () => [], onSelect: () => {} },
  }
  commandUi.register(compliant)
  assert.equal(commandUi.live.contributions.get('model'), compliant)

  const rows = await commandUi.candidates({ sessionId: 's1' }, { query: '' })
  assert.deepEqual(rows.map((row) => row.name), ['从资产库添加', 'model'])
  assert.equal(rows[1].description, '切换模型')

  // An unrelated host failure must still surface through the same channel it
  // always did (the localized pass is attempted once, then the raw pass runs).
  const brokenCommandUi = createHostLikeCommandUi()
  brokenCommandUi.candidates = async () => {
    throw new Error('command.list failed: internal')
  }
  const disposeBroken = wrapCommandUi(brokenCommandUi, fakeZhLocale)
  await assert.rejects(
    () => brokenCommandUi.candidates({ sessionId: 's1' }, { query: '' }),
    /command\.list failed: internal/u,
  )
  disposeBroken()
  dispose()
})