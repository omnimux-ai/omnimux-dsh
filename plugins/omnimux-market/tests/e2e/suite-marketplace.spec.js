/**
 * E2E：技能市场「套件」完整用户旅程（浏览 → 详情 → 安装 → 回执）。
 *
 * - 数据真源：`plugins/omnimux-market/catalog/index.json`（直接读文件，不另造 fixture；
 *   6 条套件的技能/规则/Agent 数量与标题全部来自该文件）。
 * - 文案真源：`src/client/i18n.js` 的真实 ZH 字典（断言用户可见中文，不是 key）。
 * - 运行时：node:test + runInNewContext + 手写假 vdom（无 jsdom / 无 react-dom），
 *   从 SkillPlaza 整棵树出发，用真实点击（卡片 onClick / 安装按钮 onClick）推进旅程。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import catalog from '../../catalog/index.json' with { type: 'json' }
import * as SkillShelf from '../../src/client/skill-picker-logic.js'
import * as plazaUtils from '../../src/client/plaza/plazaUtils.js'

const clientDir = new URL('../../src/client/', import.meta.url)
const readClient = (name) => readFileSync(new URL(name, clientDir), 'utf8')
// require 锚定在 src/client/：skill-plaza.js 内的相对 require（./plaza/*.jsx）才能解析。
const clientRequire = createRequire(new URL('skill-plaza.js', clientDir))

const SUITES = catalog.items.filter((item) => item.kind === 'suite')
const SOCIAL = SUITES.find((item) => item.id === 'suite-social-content-team')

// 真实词典：直接从 i18n 片段求值取 lookup，断言用户可见中文。
const i18n = runInNewContext(`${readClient('i18n.js')}\n({ lookup })`, {
  React: {
    createContext: () => ({}),
    useContext: () => null,
    useState: (value) => [value, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
  },
})
const lookup = i18n.lookup

const h = (type, props, ...children) => ({
  type,
  props: props || {},
  children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false),
})

function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap((child) => nodes(child, predicate))
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flatMap((child) => nodes(child, predicate))]
}

const byClass = (node, className) => nodes(node, (n) => {
  const cls = n.props && n.props.className
  return typeof cls === 'string' && cls.split(' ').includes(className)
})
const texts = (node) => nodes(node, (n) => typeof n.children?.[0] === 'string').map((n) => n.children[0])

const OK_SESSIONS = { list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: '/work/current-project' } } }) } }
const defaultRespond = (action) => (action === 'search'
  ? { items: [], total: 0, hasMore: false, fallback: false }
  : {})

/** 真实套件对应的 suiteInstall 成功响应（数量取自目录真实长度）。 */
function installResponse(item, overrides = {}) {
  const counts = plazaUtils.resolveSuiteCounts(item)
  return {
    ok: true,
    id: item.id,
    already: false,
    partial: false,
    failed: [],
    skills: { total: counts.skills, installed: counts.skills, already: 0, failed: 0, items: [] },
    rules: { target: 'project', file: '/work/current-project/AGENTS.md', total: counts.rules, written: counts.rules, already: 0, failed: 0, items: [] },
    agents: { total: counts.agents, installed: counts.agents, already: 0, failed: 0, items: [] },
    ...overrides,
  }
}

/**
 * 假 vdom 运行时：按「帧」保存 hook 状态（plaza 一帧、套件模态一帧），
 * 点击事件触发的 setState 与后续重渲染读写同一批状态单元。
 */
function createPlaza(opts = {}) {
  const frames = new Map()
  const cursors = new Map()
  const plazaCells = []
  frames.set('plaza', plazaCells)
  let frame = 'plaza'
  let effects = []
  const calls = []

  const useState = (initial) => {
    const cells = frames.get(frame) || (frames.set(frame, []), frames.get(frame))
    const index = cursors.get(frame) || 0
    cursors.set(frame, index + 1)
    if (index >= cells.length) cells[index] = initial
    return [cells[index], (next) => { cells[index] = typeof next === 'function' ? next(cells[index]) : next }]
  }

  const render = runInNewContext(`${readClient('skill-plaza.js')}\nSkillPlaza`, {
    require: clientRequire,
    h,
    SkillShelf,
    fmt: (value) => String(value),
    Button: 'Button',
    Overlay: 'Overlay',
    Drawer: 'Drawer',
    iconSrc: (value) => value,
    useTr: () => lookup,
    lookup,
    useState,
    useCallback: (fn) => fn,
    useEffect: (fn) => { effects.push(fn) },
    apiCacheKey: (action, payload) => JSON.stringify([action, payload]),
    apiCache: new Map(),
    API_CACHE_TTL_MS: 1000,
    api: async (action, payload) => {
      calls.push({ action, payload })
      return (opts.respond || defaultRespond)(action, payload)
    },
    createSkillSession: () => {},
    plazaSessions: opts.sessions === undefined ? OK_SESSIONS : opts.sessions,
    plazaWorkspaces: opts.workspaces === undefined ? { list: { getSnapshot: () => ({ items: [] }) } } : opts.workspaces,
  })

  const draw = () => {
    cursors.set('plaza', 0)
    frame = 'plaza'
    effects = []
    return render({})
  }
  const runEffects = async () => {
    const pending = effects.slice()
    effects = []
    for (const fn of pending) fn()
    await new Promise((resolve) => setImmediate(resolve))
  }
  /** 展开套件详情模态（React 会做的事：组件节点 → 宿主节点树）。 */
  const mountModal = (node, key = 'suite-modal') => {
    const previous = frame
    frame = key
    cursors.set(key, 0)
    try {
      return node.type(node.props).flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false)
    } finally {
      frame = previous
    }
  }
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  return {
    draw,
    runEffects,
    mountModal,
    settle,
    calls,
    setCategory: (value) => { plazaCells[1] = value },
    searchCalls: () => calls.filter((call) => call.action === 'search').length,
    installCalls: () => calls.filter((call) => call.action === 'suiteInstall'),
  }
}

const findSuiteCard = (tree, suite) => byClass(tree, 'regular-card')
  .find((card) => byClass(card, 'regular-card-title').some((title) => title.children[0] === suite.title))
const findModal = (tree) => nodes(tree, (n) => typeof n.type === 'function' && n.type.name === 'SuiteDetailModal')[0]

/** 旅程公共起点：分类栏切到「套件」。 */
async function browseSuiteCategory(opts) {
  const ui = createPlaza(opts)
  ui.setCategory('套件')
  const tree = ui.draw()
  await ui.runEffects()
  return { ui, tree }
}

/** 旅程公共步骤：点卡进详情（返回 ui 与已展开的详情视图）。 */
async function openSuiteDetail(suite = SOCIAL, opts) {
  const { ui, tree } = await browseSuiteCategory(opts)
  findSuiteCard(tree, suite).props.onClick()
  const modal = findModal(ui.draw())
  return { ui, modal, view: ui.mountModal(modal) }
}

/** 旅程公共步骤：详情 → 安装 → 确认（返回确认框视图）。 */
async function openInstallConfirm(suite = SOCIAL, opts) {
  const opened = await openSuiteDetail(suite, opts)
  byClass(opened.view, 'ws-detail-header-actions')[0].children[0].props.onClick()
  const confirmView = opened.ui.mountModal(findModal(opened.ui.draw()))
  return { ...opened, confirmView }
}

/** 旅程公共步骤：详情 → 安装 → 确认 → 点「确认安装」并等待回执。 */
async function confirmInstall(suite = SOCIAL, opts) {
  const opened = await openInstallConfirm(suite, opts)
  byClass(opened.confirmView, 'ws-detail-actions')[0].children[1].props.onClick()
  await opened.ui.settle()
  return { ...opened, view: opened.ui.mountModal(findModal(opened.ui.draw())) }
}

const installButton = (view) => byClass(view, 'ws-detail-header-actions')[0].children[0]

test('E2E 旅程一：套件分类只列真实套件，6 张卡的构成计数与目录一致', async () => {
  assert.equal(SUITES.length, 6)
  const { ui, tree } = await browseSuiteCategory()

  // 套件只存在于本地目录：该分类不发远端检索。
  assert.equal(ui.searchCalls(), 0)
  assert.equal(byClass(tree, 'featured-section').length, 0)

  const cards = byClass(tree, 'regular-card')
  assert.equal(cards.length, SUITES.length)
  for (const suite of SUITES) {
    const card = findSuiteCard(tree, suite)
    assert.ok(card, `card for ${suite.id}`)
    const composition = byClass(card, 'regular-card-composition')
    assert.equal(composition.length, 1, `${suite.id} must render composition`)
    const counts = plazaUtils.resolveSuiteCounts(suite)
    assert.equal(
      composition[0].children[0],
      `技能 ${counts.skills} · 规则 ${counts.rules} · Agent ${counts.agents}`,
      `${suite.id} composition`,
    )
    // 套件卡不挂技能安装开关：安装入口在详情页。
    assert.equal(byClass(card, 'toggle-wrap').length, 0)
  }
})

test('E2E 旅程一（边界）：全部含套件、技能领域分类不含套件、选择器页签不含套件', async () => {
  const { ui, tree } = await browseSuiteCategory()

  ui.setCategory('')
  const all = ui.draw()
  await ui.runEffects()
  const allTitles = texts(byClass(all, 'regular-card-title'))
  for (const suite of SUITES) assert.ok(allTitles.includes(suite.title), `${suite.id} must appear under 全部`)

  ui.setCategory('动画')
  const animation = ui.draw()
  await ui.runEffects()
  assert.ok(byClass(animation, 'regular-card').length > 0)
  assert.equal(byClass(animation, 'regular-card-composition').length, 0, '技能领域分类不得混入套件')
  assert.equal(byClass(tree, 'regular-card').length, SUITES.length)

  // 组合器选择器页签：本地专属分类（套件）不进选择器。
  assert.equal([...SkillShelf.PICKER_TABS].some((row) => row.id === '套件'), false)
})

test('E2E 旅程二：点卡进详情，空块整块省略，其余块按目录真实条目渲染', async () => {
  const { modal, view } = await openSuiteDetail(SOCIAL)
  assert.equal(modal.props.item.id, SOCIAL.id)
  assert.equal(modal.props.projectDir, '/work/current-project')

  const dialog = byClass(view, 'modal-dialog')[0]
  assert.ok(dialog.props.className.split(' ').includes('ws-detail-dialog'))
  assert.equal(byClass(view, 'ws-detail-header-title')[0].children[0], SOCIAL.title)
  assert.equal(byClass(view, 'ws-detail-source-value')[0].children[0], SOCIAL.source.path)
  assert.equal(byClass(view, 'ws-detail-desc')[0].children[0], SOCIAL.summary)

  // 0 技能 → 「技能」块连标题一起不渲染。
  assert.deepEqual(plazaUtils.resolveSuiteCounts(SOCIAL), { skills: 0, rules: 5, agents: 7 })
  assert.deepEqual(texts(byClass(view, 'ws-suite-block-title')), [lookup('suite.section.rules'), lookup('suite.section.agents')])
  assert.deepEqual(texts(byClass(view, 'ws-suite-block-hint')), [
    lookup('suite.section.rulesHint'),
    lookup('suite.section.agentsHint'),
  ])

  // 规则块已是源文本形态：5 条 .ws-suite-rule，规则不再出现在卡片网格里。
  const ruleBodies = byClass(view, 'ws-suite-rule-body')
  assert.equal(byClass(view, 'ws-suite-rule').length, SOCIAL.suite.rules.length)
  assert.deepEqual(texts(byClass(view, 'ws-suite-rule-title')), SOCIAL.suite.rules.map((rule) => rule.title))
  assert.deepEqual(ruleBodies.map((node) => node.children[0]), SOCIAL.suite.rules.map((rule) => rule.content))
  for (const rule of SOCIAL.suite.rules) {
    assert.ok(rule.content.includes('\n'), `rule ${rule.name} must keep its line breaks`)
    assert.equal(rule.content.startsWith('---'), false, `rule ${rule.name} must not carry frontmatter`)
    assert.notEqual(rule.content, rule.desc)
  }
  assert.equal(byClass(view, 'ws-suite-rule').some((node) => byClass(node, 'ws-suite-item').length > 0), false)

  // Agent 块仍是卡片网格：7 张 .ws-suite-item，标题与说明与目录逐字一致。
  const itemTitles = texts(byClass(view, 'ws-suite-item-title'))
  for (const agent of SOCIAL.suite.agents) assert.ok(itemTitles.includes(agent.title), `agent ${agent.name}`)
  assert.deepEqual(texts(byClass(view, 'ws-suite-item-desc')), SOCIAL.suite.agents.map((agent) => agent.desc))
  assert.equal(byClass(view, 'ws-suite-item').length, SOCIAL.suite.agents.length)
  assert.equal(byClass(view, 'ws-detail-source-label')[0].children[0], lookup('suite.source'))
  assert.equal(installButton(view).children[0], lookup('suite.install'))
})

test('E2E 旅程三：安装确认框默认当前项目，确认后请求为 { suiteInstall, id, ruleTarget, projectDir }', async () => {
  const { ui, confirmView } = await openInstallConfirm(SOCIAL)

  const counts = plazaUtils.resolveSuiteCounts(SOCIAL)
  assert.equal(
    byClass(confirmView, 'ws-suite-install-summary')[0].children[0],
    lookup('suite.install.summary', { skills: counts.skills, rules: counts.rules, agents: counts.agents }),
  )
  const options = byClass(confirmView, 'ws-suite-target-option')
  assert.deepEqual(texts(options[0]), [lookup('suite.install.ruleTargetProject')])
  assert.deepEqual(texts(options[1]), [lookup('suite.install.ruleTargetGlobal')])
  assert.equal(options[0].props['aria-checked'], true, '默认落点必须是当前项目')
  assert.equal(options[1].props['aria-checked'], false)

  byClass(confirmView, 'ws-detail-actions')[0].children[1].props.onClick()
  await ui.settle()

  assert.deepEqual(ui.installCalls().map((call) => call.payload), [{
    id: SOCIAL.id,
    ruleTarget: 'project',
    projectDir: '/work/current-project',
  }])
  // 不得把进程 cwd 当作项目根发出去
  assert.equal(ui.installCalls().some((call) => JSON.stringify(call.payload).includes(process.cwd())), false)
})

test('E2E 旅程三（分支）：projectDir 解析不到时不发请求，留在确认框并提示', async () => {
  const { ui, confirmView } = await openInstallConfirm(SOCIAL, { sessions: null, workspaces: null })
  assert.equal(findModal(ui.draw()).props.projectDir, '')

  byClass(confirmView, 'ws-detail-actions')[0].children[1].props.onClick()
  await ui.settle()

  assert.equal(ui.installCalls().length, 0)
  assert.equal(ui.searchCalls(), 0)
  const view = ui.mountModal(findModal(ui.draw()))
  assert.equal(byClass(view, 'ws-suite-install-dialog').length, 1, '确认框必须留在原地')
  assert.equal(byClass(view, 'sh-err')[0].children[0], lookup('suite.install.noProjectDir'))
  assert.equal(byClass(view, 'ws-suite-receipt').length, 0)
})

test('E2E 旅程四：partial 不显示成功且按钮不转「已安装」，成功才转「已安装」', async () => {
  const partial = await confirmInstall(SOCIAL, {
    respond: (action, payload) => (action === 'suiteInstall'
      ? installResponse(SOCIAL, {
        partial: true,
        failed: [{ part: 'agents', name: 'music-agent', error: 'EACCES: permission denied' }],
        agents: { total: 7, installed: 6, already: 0, failed: 1, items: [] },
      })
      : defaultRespond(action, payload)),
  })
  const partialReceipt = byClass(partial.view, 'ws-suite-receipt')[0]
  assert.deepEqual(partialReceipt.props.className.split(' '), ['ws-suite-receipt', 'partial'])
  assert.equal(byClass(partialReceipt, 'ws-suite-receipt-title')[0].children[0], lookup('suite.receipt.partial'))
  assert.ok(texts(byClass(partialReceipt, 'ws-suite-receipt-item')).includes(lookup('suite.receipt.failed', {
    name: 'music-agent',
    error: 'EACCES: permission denied',
  })))
  assert.equal(installButton(partial.view).children[0], lookup('suite.install'))
  assert.equal(installButton(partial.view).props.disabled, false)

  const ok = await confirmInstall(SOCIAL, {
    respond: (action, payload) => (action === 'suiteInstall' ? installResponse(SOCIAL) : defaultRespond(action, payload)),
  })
  const okReceipt = byClass(ok.view, 'ws-suite-receipt')[0]
  assert.equal(okReceipt.props.className, 'ws-suite-receipt')
  assert.equal(byClass(okReceipt, 'ws-suite-receipt-title')[0].children[0], lookup('suite.receipt.title'))
  const counts = plazaUtils.resolveSuiteCounts(SOCIAL)
  assert.deepEqual(texts(byClass(okReceipt, 'ws-suite-receipt-item')), [
    lookup('suite.receipt.skills', { installed: counts.skills, already: 0, failed: 0, total: counts.skills }),
    lookup('suite.receipt.rules', { written: counts.rules, already: 0, failed: 0, total: counts.rules }),
    lookup('suite.receipt.agents', { installed: counts.agents, already: 0, failed: 0, total: counts.agents }),
    lookup('suite.receipt.ruleFile', { file: '/work/current-project/AGENTS.md' }),
  ])
  assert.equal(byClass(ok.view, 'ws-suite-install-dialog').length, 0)
  assert.equal(installButton(ok.view).children[0], lookup('suite.installed'))
  assert.equal(installButton(ok.view).props.disabled, true)
})
