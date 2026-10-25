/**
 * @file journey-explore-removed.mjs
 * @description Issue #3785 旅程：证明自绘「探索」入口已移除、官方「更多」菜单仍完整、
 *   运行时注册项出现在「更多」菜单末尾且注销后消失。
 *
 * 产出（合同 run 目录，已在 request.artifactNames 预声明）：
 *   - explore-removed-observation.json
 *   - more-menu-baseline.png（展开「更多」菜单）
 *   - more-menu-runtime-item.png（注册运行时项后展开）
 *   - more-menu-after-unregister.png（注销后展开）
 *
 * 诊断纪律：页面探针自带 try/catch，异常以 `__probeError` 字段显式返回；宿主侧失败
 * 路径返回 `{ failed, saved, __probeError }` 信封，并让对应断言显式为 false（绝不降级
 * 成成功）。顶层兜底：任何异常记成 `fatal`，断言全 false，观察数据照常落盘。
 */
import { join } from 'node:path'

const BUILTIN_LABELS = ['应用', '视频剪辑', '产品库', '发布', '账号', '手机管理', '数据分析', '自动化', '任务表单', '社交采收']
const EXPECTED_SEPARATOR_BEFORE = ['产品库', '数据分析']
const RUNTIME_ITEM = { id: 'qa-runtime-probe', label: 'QA运行时项', iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="8" cy="8" r="5"/></svg>', tabId: 'qa:runtime' }
const ASSERTION_NAMES = ['explore-entry-absent', 'more-menu-ten-items-in-order', 'more-menu-separators-match',
  'runtime-item-appended-and-removed', 'observation-recorded']

const VISIBLE_HELPER = `const visible = el => {
  if (!el) return false;
  const box = el.getBoundingClientRect(), style = getComputedStyle(el);
  return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
};`

/** 自绘探索入口与探索样式的存在性（含样式表文本匹配，避免只看 DOM 节点）。 */
const EXPLORE_PROBE = `JSON.stringify((() => { try {
  const entry = document.getElementById('omnimux-explore-entry');
  const menu = document.getElementById('omnimux-explore-menu');
  const styleNode = document.getElementById('omnimux-sidebar-explore-styles');
  const classNodes = [...document.querySelectorAll('[class*="omnimux-explore"]')].map(el => (el.className || '').toString().slice(0, 80));
  const retiredClassNodes = classNodes.filter(name => name.includes('omnimux-explore-entry') || name.includes('omnimux-explore-menu'));
  let styleTextHits = 0;
  let retiredStyleTextHits = 0;
  for (const sheet of [...document.styleSheets]) {
    let rules = null;
    try { rules = sheet.cssRules } catch { rules = null }
    if (!rules) continue;
    for (const rule of [...rules]) {
      const text = rule.cssText || '';
      if (text.includes('omnimux-explore')) styleTextHits += 1;
      if (text.includes('omnimux-explore-entry') || text.includes('omnimux-explore-menu')) retiredStyleTextHits += 1;
    }
  }
  for (const node of [...document.querySelectorAll('style')]) {
    const text = node.textContent || '';
    if (text.includes('omnimux-explore')) styleTextHits += 1;
    if (text.includes('omnimux-explore-entry') || text.includes('omnimux-explore-menu')) retiredStyleTextHits += 1;
  }
  return {
    exploreEntryPresent: Boolean(entry),
    exploreMenuPresent: Boolean(menu),
    exploreStyleNodePresent: Boolean(styleNode),
    exploreClassNodeCount: classNodes.length,
    exploreClassNodes: classNodes.slice(0, 10),
    retiredEntryClassNodes: retiredClassNodes,
    exploreStyleTextHits: styleTextHits,
    retiredStyleTextHits: retiredStyleTextHits,
    starterGuideExploreClassNodeCount: classNodes.length - retiredClassNodes.length,
    sidebarGlobal: typeof window.__omnimuxSidebar === 'object' && window.__omnimuxSidebar !== null,
    registerExploreItemType: typeof window.__omnimuxSidebar?.registerExploreItem,
    navEntryIds: [...document.querySelectorAll('nav[aria-label] [id]')].map(el => el.id).slice(0, 20),
  };
} catch (error) { return { __probeError: String((error && error.message) || error) }; } })())`

const MENU_PROBE = `JSON.stringify((() => { try {
  ${VISIBLE_HELPER}
  const allMenus = [...document.querySelectorAll('[role="menu"]')];
  const menus = allMenus.filter(visible);
  const menu = menus.length ? menus[menus.length - 1] : null;
  const anchor = [...document.querySelectorAll('nav[aria-label] button[aria-haspopup="menu"]')].pop();
  if (!menu) return { menuFound: false, rows: [], allMenuCount: allMenus.length, anchorExpanded: anchor ? anchor.getAttribute('aria-expanded') : null };
  const rows = [...menu.querySelectorAll('button[role="menuitem"]')].map(button => {
    const wrap = button.parentElement;
    const ownSeparator = wrap ? wrap.querySelector(':scope > [role="separator"]') : null;
    const previous = wrap ? wrap.previousElementSibling : null;
    const previousSeparator = previous && previous.getAttribute('role') === 'separator' ? previous : null;
    const box = button.getBoundingClientRect();
    return { text: (button.textContent || '').trim(), visible: visible(button), separatorBefore: Boolean(ownSeparator || previousSeparator),
      rect: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } };
  });
  return { menuFound: true, allMenuCount: allMenus.length, anchorExpanded: anchor ? anchor.getAttribute('aria-expanded') : null,
    separatorCount: menu.querySelectorAll('[role="separator"]').length, rows };
} catch (error) { return { __probeError: String((error && error.message) || error) }; } })())`

const REGISTER_EXPR = `(() => { try {
  const api = window.__omnimuxSidebar;
  if (!api || typeof api.registerExploreItem !== 'function') return { registered: false, reason: 'no-api' };
  const dispose = api.registerExploreItem(${JSON.stringify(RUNTIME_ITEM)});
  window.__qaRuntimeDispose = typeof dispose === 'function' ? dispose : null;
  return { registered: true, disposer: typeof dispose === 'function' };
} catch (error) { return { __probeError: String((error && error.message) || error) }; } })()`

const INVALID_EXPR = `(() => { try {
  const api = window.__omnimuxSidebar;
  if (!api) return { __probeError: 'no-api' };
  const malformedCalls = [];
  for (const bad of [null, {}, { id: 'qa-bad', label: '', iconSvg: '<svg/>' }, { id: 'qa-bad2', label: 'x', iconSvg: '  ' }, { id: '   ', label: 'x', iconSvg: '<svg/>' }, { id: 42, label: 'x', iconSvg: '<svg/>' }]) {
    try { api.registerExploreItem(bad); malformedCalls.push(true); } catch (error) { malformedCalls.push('threw:' + error.message); }
  }
  let builtinConflict = null;
  try { api.registerExploreItem({ id: 'apps', label: '冲突', iconSvg: '<svg/>' }); builtinConflict = 'no-throw'; } catch (error) { builtinConflict = 'threw:' + error.message; }
  return { malformedCalls, builtinConflict };
} catch (error) { return { __probeError: String((error && error.message) || error) }; } })()`

const UNREGISTER_EXPR = `(() => { try {
  const dispose = window.__qaRuntimeDispose;
  if (typeof dispose === 'function') dispose();
  delete window.__qaRuntimeDispose;
  return { disposed: true };
} catch (error) { return { __probeError: String((error && error.message) || error) }; } })()`

const ANCHOR_CLICK_EXPR = `(() => { try {
  const el = document.querySelector('nav[aria-label] button[aria-haspopup="menu"]');
  if (!el) return { clicked: false, reason: 'no-anchor' };
  el.click();
  return { clicked: true };
} catch (error) { return { __probeError: String((error && error.message) || error) }; } })()`

export default async function journey({ send, sleep, evidenceDir, origin, io }) {
  const observations = { issue: '3785', origin, startedAt: new Date().toISOString(),
    builtinLabels: BUILTIN_LABELS, expectedSeparatorBefore: EXPECTED_SEPARATOR_BEFORE, runtimeItem: RUNTIME_ITEM,
    probeErrors: [], steps: [], screenshots: {} }
  const note = (scope, error) => {
    const detail = String((error && error.message) || error)
    observations.probeErrors.push({ probe: scope, error: detail })
    return detail
  }

  /** 每次求值都返回显式信封；异常不丢，作为 error 字段返回。 */
  const evaluate = async (expression, scope) => {
    let response
    try {
      response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    } catch (error) {
      return { failed: true, error: note(scope, error), value: null }
    }
    if (response?.exceptionDetails) {
      return { failed: true, error: note(scope, response.exceptionDetails.exception?.description || 'exceptionDetails'), value: null }
    }
    return { failed: false, error: null, value: response?.result?.value ?? null }
  }
  const probeJson = async (expression, scope) => {
    const result = await evaluate(expression, scope)
    if (result.failed) return { __probeError: result.error }
    if (typeof result.value !== 'string') return { __probeError: `${scope}: 非字符串返回值` }
    try {
      return JSON.parse(result.value)
    } catch (error) {
      return { __probeError: `${scope}: JSON 解析失败 ${note(scope, error)}` }
    }
  }
  const screenshot = async (name) => {
    let captured
    try {
      captured = await send('Page.captureScreenshot', { format: 'png' })
    } catch (error) {
      return { saved: false, error: note(`screenshot:${name}`, error) }
    }
    if (!captured?.data) return { saved: false, error: note(`screenshot:${name}`, '截图数据为空') }
    const bytes = Buffer.from(captured.data, 'base64')
    if (bytes.length < 32) return { saved: false, error: note(`screenshot:${name}`, '截图数据过短') }
    try {
      io.writeFileSync(join(evidenceDir, name), bytes)
    } catch (error) {
      return { saved: false, error: note(`screenshot:${name}`, error) }
    }
    observations.screenshots[name] = { path: join(evidenceDir, name), bytes: bytes.length }
    return { saved: true, error: null, bytes: bytes.length }
  }
  const pollMenu = async (timeoutMs) => {
    const deadline = Date.now() + timeoutMs
    let menu = { menuFound: false, rows: [] }
    while (Date.now() < deadline) {
      menu = await probeJson(MENU_PROBE, 'menu-probe')
      if (menu.menuFound && menu.rows?.length > 0) return menu
      await sleep(200)
    }
    return menu
  }
  /** 展开「更多」菜单（CDP 鼠标事件在真实应用里被遮罩挡住，用真实 click 事件）。 */
  const openMoreMenu = async () => {
    const state = await probeJson(MENU_PROBE, 'menu-probe')
    if (state.menuFound) return state
    await evaluate(ANCHOR_CLICK_EXPR, 'anchor-click')
    return pollMenu(5000)
  }
  const closeMoreMenu = async () => {
    const state = await probeJson(MENU_PROBE, 'menu-probe')
    if (!state.menuFound) return
    await evaluate(ANCHOR_CLICK_EXPR, 'anchor-click')
    await sleep(400)
  }

  let explore = { __probeError: 'not-run' }
  let menuBefore = { menuFound: false, rows: [] }
  let rowsBefore = []
  let tenInOrder = false
  let separatorsMatch = false
  let runtimeAppendedLast = false
  let runtimeRemoved = false
  let invalidNoop = false
  let shotsOk = false
  let fatal = null

  try {
    // 1. 自绘探索入口 / 探索样式
    explore = await probeJson(EXPLORE_PROBE, 'explore-probe')
    const exploreDeadline = Date.now() + 15000
    while (Date.now() < exploreDeadline && explore.sidebarGlobal !== true) {
      await sleep(500)
      explore = await probeJson(EXPLORE_PROBE, 'explore-probe')
    }
    observations.explore = explore
    observations.steps.push({ step: 'explore-probe', exploreEntryPresent: explore.exploreEntryPresent === true,
      exploreMenuPresent: explore.exploreMenuPresent === true, exploreStyleNodePresent: explore.exploreStyleNodePresent === true,
      exploreClassNodeCount: explore.exploreClassNodeCount ?? null, exploreStyleTextHits: explore.exploreStyleTextHits ?? null,
      registerExploreItemType: explore.registerExploreItemType ?? null, probeError: explore.__probeError ?? null })

    // 2. 官方「更多」菜单内置 10 项
    menuBefore = await openMoreMenu()
    await sleep(300)
    const shotBefore = await screenshot('more-menu-baseline.png')
    rowsBefore = (menuBefore.rows || []).map(row => row.text)
    const blockStart = rowsBefore.findIndex((text, index) => BUILTIN_LABELS.every((label, offset) => rowsBefore[index + offset] === label))
    const blockRows = blockStart >= 0 ? (menuBefore.rows || []).slice(blockStart, blockStart + BUILTIN_LABELS.length) : []
    tenInOrder = blockStart >= 0 && blockRows.length === BUILTIN_LABELS.length
    const blockSeparators = blockRows.filter(row => row.separatorBefore).map(row => row.text)
    separatorsMatch = tenInOrder && blockSeparators.length === EXPECTED_SEPARATOR_BEFORE.length
      && EXPECTED_SEPARATOR_BEFORE.every(label => blockSeparators.includes(label))
    observations.menuBefore = menuBefore
    observations.rowsBefore = rowsBefore
    observations.blockStart = blockStart
    observations.blockSeparators = blockSeparators
    observations.tenInOrder = tenInOrder
    observations.separatorsMatch = separatorsMatch
    observations.steps.push({ step: 'more-menu-before', rowCount: rowsBefore.length, blockStart, tenInOrder, separatorsMatch })

    // 3. 运行时注册 → 出现在末尾
    const registerProbe = await evaluate(REGISTER_EXPR, 'register')
    const registerResult = registerProbe.failed ? { __probeError: registerProbe.error } : registerProbe.value
    await closeMoreMenu()
    const menuRegistered = await openMoreMenu()
    await sleep(300)
    const shotRegistered = await screenshot('more-menu-runtime-item.png')
    const rowsRegistered = (menuRegistered.rows || []).map(row => row.text)
    runtimeAppendedLast = rowsRegistered.length === rowsBefore.length + 1 && rowsRegistered.at(-1) === RUNTIME_ITEM.label
    observations.register = registerResult
    observations.rowsRegistered = rowsRegistered
    observations.runtimeAppendedLast = runtimeAppendedLast
    observations.steps.push({ step: 'runtime-registered', registered: registerResult?.registered === true,
      rowCount: rowsRegistered.length, runtimeAppendedLast })

    // 3b. 与内置 id 冲突 / 非法输入：不注册、不抛错
    const invalidProbe = await evaluate(INVALID_EXPR, 'invalid-inputs')
    const invalidResult = invalidProbe.failed ? { __probeError: invalidProbe.error } : invalidProbe.value
    await closeMoreMenu()
    const menuAfterInvalid = await openMoreMenu()
    const rowsAfterInvalid = (menuAfterInvalid.rows || []).map(row => row.text)
    invalidNoop = Array.isArray(invalidResult?.malformedCalls) && invalidResult.malformedCalls.length === 6
      && invalidResult.malformedCalls.every(item => item === true)
      && invalidResult.builtinConflict === 'no-throw'
      && rowsAfterInvalid.length === rowsRegistered.length
    observations.invalid = invalidResult
    observations.rowsAfterInvalid = rowsAfterInvalid
    observations.invalidNoop = invalidNoop
    observations.steps.push({ step: 'invalid-inputs', malformedCalls: invalidResult?.malformedCalls ?? null,
      builtinConflict: invalidResult?.builtinConflict ?? null, rowCount: rowsAfterInvalid.length, invalidNoop })

    // 4. 注销 → 消失
    const unregisterProbe = await evaluate(UNREGISTER_EXPR, 'unregister')
    observations.unregister = unregisterProbe.failed ? { __probeError: unregisterProbe.error } : unregisterProbe.value
    await closeMoreMenu()
    const menuAfterUnregister = await openMoreMenu()
    await sleep(300)
    const shotAfterUnregister = await screenshot('more-menu-after-unregister.png')
    const rowsAfterUnregister = (menuAfterUnregister.rows || []).map(row => row.text)
    runtimeRemoved = rowsAfterUnregister.length === rowsBefore.length && !rowsAfterUnregister.includes(RUNTIME_ITEM.label)
    observations.rowsAfterUnregister = rowsAfterUnregister
    observations.runtimeRemoved = runtimeRemoved
    observations.steps.push({ step: 'runtime-unregistered', rowCount: rowsAfterUnregister.length, runtimeRemoved })

    shotsOk = Boolean(shotBefore.saved && shotRegistered.saved && shotAfterUnregister.saved)
  } catch (error) {
    fatal = note('journey', error)
  }

  observations.fatal = fatal
  observations.completedAt = new Date().toISOString()
  let observationWritten = false
  try {
    io.writeFileSync(join(evidenceDir, 'explore-removed-observation.json'), `${JSON.stringify(observations, null, 2)}\n`)
    observationWritten = true
  } catch (error) {
    observations.observationWriteError = note('observation-write', error)
  }
  observations.observationWritten = observationWritten

  const passes = {
    'explore-entry-absent': explore.exploreEntryPresent !== true && explore.exploreMenuPresent !== true
      && explore.exploreStyleNodePresent !== true && (explore.retiredStyleTextHits ?? 0) === 0
      && (explore.retiredEntryClassNodes?.length ?? 0) === 0 && !explore.__probeError,
    'more-menu-ten-items-in-order': tenInOrder,
    'more-menu-separators-match': separatorsMatch,
    'runtime-item-appended-and-removed': runtimeAppendedLast && runtimeRemoved && invalidNoop,
    'observation-recorded': shotsOk && !fatal && observationWritten === true,
  }
  return { assertions: ASSERTION_NAMES.map(name => ({ name, pass: passes[name] === true })) }
}
