import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { readFileSync } from 'node:fs'
import * as esbuild from 'esbuild'
import React from 'react'
import catalog from '../../catalog/index.json' with { type: 'json' }
import * as SkillShelf from './skill-picker-logic.js'
import { buildWorkshopCategories, usePlazaSearchEffect } from './plaza/usePlazaFilter.js'
import * as plazaUtils from './plaza/plazaUtils.js'

const req = createRequire(import.meta.url)
const { SuiteDetailModal } = req('./plaza/SuiteDetailModal.jsx')

// PlazaCardGrid.jsx 经 esbuild 转 CJS 执行（与 mine-filter-dropdown.test.js 同法）。
const plazaCardGridSrc = readFileSync(new URL('./plaza/PlazaCardGrid.jsx', import.meta.url), 'utf8')
const compiledPlazaCardGrid = esbuild.transformSync(plazaCardGridSrc, { loader: 'jsx', format: 'cjs' }).code
const plazaCardGridModule = { exports: {} }
new Function('require', 'module', 'exports', compiledPlazaCardGrid)(
  (id) => {
    if (id === 'react') return React
    if (id.includes('plazaUtils')) return plazaUtils
    if (id.includes('FeaturedCard')) return { renderFeaturedCard: () => null }
    return {}
  },
  plazaCardGridModule,
  plazaCardGridModule.exports,
)
const { renderRegularCard } = plazaCardGridModule.exports

const SUITES = catalog.items.filter((item) => item.kind === 'suite')
const SOCIAL_CONTENT = SUITES.find((item) => item.id === 'suite-social-content-team')
const DISTRIBUTION = SUITES.find((item) => item.id === 'suite-content-distribution-team')

const h = (type, props, ...children) => ({
  type,
  props: props || {},
  children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false),
})

function walkAll(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const item of node) walkAll(item, predicate, out)
    return out
  }
  if (predicate(node)) out.push(node)
  for (const child of node.children || []) walkAll(child, predicate, out)
  return out
}

/** 按类名单词匹配（className 可能是多类名组合）。 */
const withClass = (tree, className) => walkAll(tree, (node) => {
  const cls = node.props && node.props.className
  return typeof cls === 'string' && cls.split(' ').includes(className)
})

/** 与 React 一致的按序状态单元：每次渲染前 beginRender，状态跨渲染保留。 */
function createStateHarness() {
  const cells = []
  let cursor = 0
  return {
    beginRender: () => { cursor = 0 },
    useState: (init) => {
      const idx = cursor++
      if (idx >= cells.length) cells.push(init)
      return [cells[idx], (value) => { cells[idx] = typeof value === 'function' ? value(cells[idx]) : value }]
    },
  }
}

const DICT = {
  'suite.section.skills': '技能',
  'suite.section.rules': '规则',
  'suite.section.agents': 'Agent',
  'suite.install': '安装',
  'suite.installed': '已安装',
  'suite.install.confirm': '确认安装',
  'suite.install.cancel': '取消',
  'suite.install.installing': '正在安装…',
  'suite.install.ruleTargetProject': '当前项目',
  'suite.install.ruleTargetGlobal': '个人全局',
}
const tr = (key) => DICT[key] || ''

function renderSuite(item, opts = {}) {
  const harness = createStateHarness()
  const calls = []
  const api = opts.api || (async (method, payload) => {
    calls.push({ method, payload })
    return {
      ok: true,
      id: item.id,
      already: false,
      partial: false,
      failed: [],
      skills: { total: 0, installed: 0, already: 0, failed: 0, items: [] },
      rules: { target: payload.ruleTarget, file: '/work/AGENTS.md', total: 5, written: 5, already: 0, failed: 0, items: [] },
      agents: { total: 7, installed: 7, already: 0, failed: 0, items: [] },
    }
  })
  const render = () => {
    harness.beginRender()
    return SuiteDetailModal({
      item,
      h,
      tr,
      Overlay: 'Overlay',
      Button: 'Button',
      api,
      projectDir: opts.projectDir === undefined ? '/work/current-project' : opts.projectDir,
      hooks: { useState: harness.useState },
      onClose: opts.onClose || (() => {}),
      onInstalled: opts.onInstalled || (() => {}),
    })
  }
  return { render, calls }
}

const suiteCard = (item) => ({
  ...item,
  catalogId: item.id,
  slug: item.skill,
  name: item.title,
  description: item.summary,
  installBackend: 'catalog',
  installed: false,
})

test('A1 分类栏：套件紧跟「全部」，位于「精选」与各技能领域之前', () => {
  const categories = buildWorkshopCategories(null, tr)
  assert.equal(categories.length, 12)
  assert.deepEqual(categories.slice(0, 3).map((c) => c.id), ['', '套件', 'featured'])
  assert.deepEqual(categories.slice(3, 5).map((c) => c.id), ['短剧漫剧', '专业影视'])
  assert.equal(categories.at(-1).id, '平台工具')
  // 预设绑定模式保持既有形态：不新增套件分类
  assert.deepEqual(buildWorkshopCategories({ categories: [{ id: '选品', name: '选品' }] }, tr).map((c) => c.id), ['', '选品'])
  // 标签来自 taxonomy + i18n 真源
  const taxonomy = SkillShelf.SKILL_SHELF_TAXONOMY.find((row) => row.id === '套件')
  assert.equal(taxonomy.labelKey, 'picker.tab.suite')
})

test('A1 列表：套件只落「套件」分类，其他分类不混入套件', () => {
  const all = SkillShelf.plazaDiscoverySections()
  const suiteIds = SUITES.map((item) => item.id).sort()
  assert.deepEqual(all.regular.filter((item) => item.kind === 'suite').map((item) => item.id).sort(), suiteIds)

  const suites = SkillShelf.plazaDiscoverySections([], { category: '套件' })
  assert.equal(suites.regular.length, SUITES.length)
  assert.ok(suites.regular.every((item) => item.kind === 'suite'))
  assert.equal(suites.featured.length, 0)
  for (const item of suites.regular) {
    assert.ok(item.suite && Array.isArray(item.suite.rules), `${item.id} must carry the structured manifest`)
  }

  const animation = SkillShelf.plazaDiscoverySections([], { category: '动画' })
  assert.ok(animation.regular.length > 0)
  assert.ok(animation.regular.every((item) => item.kind !== 'suite'))
})

test('A2 套件卡：复用 .regular-card 骨架并显示三项真实计数（0 也显示）', () => {
  const card = renderRegularCard(suiteCard(SOCIAL_CONTENT), { tr, h, onOpen: () => {} })
  assert.equal(card.props.className, 'regular-card')
  const composition = withClass(card, 'regular-card-composition')
  assert.equal(composition.length, 1)
  assert.equal(composition[0].children[0], '技能 0 · 规则 5 · Agent 7')
  // 套件卡右侧统一挂载开关，与普通技能卡片保持一致
  assert.equal(card.children.length, 2)
  assert.equal(card.children.some((node) => node && node.type && node.type.name === 'WorkshopSwitch'), true)

  const distribution = renderRegularCard(suiteCard(DISTRIBUTION), { tr, h, onOpen: () => {} })
  assert.equal(withClass(distribution, 'regular-card-composition')[0].children[0], '技能 6 · 规则 0 · Agent 5')

  const skillCard = renderRegularCard({ kind: 'skill', slug: 'demo', name: '示例技能', summary: '说明' }, { tr, h, onOpen: () => {} })
  assert.equal(withClass(skillCard, 'regular-card-composition').length, 0)
  assert.equal(skillCard.children.some((node) => node && node.type && node.type.name === 'WorkshopSwitch'), true)

  assert.deepEqual(plazaUtils.resolveSuiteCounts({}), { skills: 0, rules: 0, agents: 0 })
  assert.deepEqual(plazaUtils.resolveSuiteCounts(SOCIAL_CONTENT), { skills: 0, rules: 5, agents: 7 })
})

test('A3 详情：标题 / 来源 / 描述 / 三块，空块整块省略', () => {
  const tree = renderSuite(SOCIAL_CONTENT).render()
  const dialog = withClass(tree, 'modal-dialog')[0]
  assert.equal(dialog.props.className, 'modal-dialog ws-detail-dialog')
  assert.equal(withClass(tree, 'ws-detail-header-title')[0].children[0], '社媒多模态内容创作工坊')
  assert.equal(withClass(tree, 'ws-detail-source-label')[0].children[0], '来源')
  assert.equal(withClass(tree, 'ws-detail-source-value')[0].children[0], 'catalog/experts/social-content-team')
  assert.equal(withClass(tree, 'ws-detail-desc')[0].children[0], SOCIAL_CONTENT.summary)
  // skills 为空 → 「技能」块连标题一起不渲染
  assert.deepEqual(withClass(tree, 'ws-suite-block-title').map((node) => node.children[0]), ['规则', 'Agent'])
  // 规则块改为源文本容器（5 条 .ws-suite-rule）；Agent 块仍是 7 张卡片网格。
  assert.equal(withClass(tree, 'ws-suite-rules').length, 1)
  assert.equal(withClass(tree, 'ws-suite-rule').length, 5)
  assert.equal(withClass(tree, 'ws-suite-item').length, 7)

  const distribution = renderSuite(DISTRIBUTION).render()
  assert.deepEqual(withClass(distribution, 'ws-suite-block-title').map((node) => node.children[0]), ['技能', 'Agent'])
  // 无规则的套件：规则块整块省略，不得出现空的源文本容器；技能 + Agent 仍是 11 张卡片。
  assert.equal(withClass(distribution, 'ws-suite-rules').length, 0)
  assert.equal(withClass(distribution, 'ws-suite-rule').length, 0)
  assert.equal(withClass(distribution, 'ws-suite-item').length, 6 + 5)
})

test('A3 详情：规则块渲染标题与完整源文本，Agent 块仍渲染标题与说明', () => {
  const tree = renderSuite(SOCIAL_CONTENT).render()

  // 规则：标题 + 完整正文，正文节点是 <pre>（保留换行的源文本形态）。
  const ruleNodes = withClass(tree, 'ws-suite-rule')
  assert.deepEqual(
    ruleNodes.map((node) => withClass(node, 'ws-suite-rule-title')[0].children[0]),
    SOCIAL_CONTENT.suite.rules.map((rule) => rule.title),
  )
  const ruleBodies = ruleNodes.map((node) => withClass(node, 'ws-suite-rule-body')[0])
  assert.deepEqual(ruleBodies.map((node) => node.type), new Array(5).fill('pre'))
  assert.deepEqual(
    ruleBodies.map((node) => node.children[0]),
    SOCIAL_CONTENT.suite.rules.map((rule) => rule.content),
  )
  for (const [idx, body] of ruleBodies.map((node) => node.children[0]).entries()) {
    const rule = SOCIAL_CONTENT.suite.rules[idx]
    assert.ok(body.length > 0, `rule ${rule.name} must render its full text`)
    // 所见即安装后写进 AGENTS.md 的原文：保留换行、不含 YAML frontmatter、不是一句摘要。
    assert.ok(body.includes('\n'), `rule ${rule.name} must keep its line breaks`)
    assert.equal(body.startsWith('---'), false, `rule ${rule.name} must not carry frontmatter`)
    assert.notEqual(body, rule.desc, `rule ${rule.name} must not fall back to its summary`)
  }
  // 规则不再走卡片网格：说明节点只由 Agent 块产生。
  const ruleGridItems = ruleNodes.flatMap((node) => withClass(node, 'ws-suite-item'))
  assert.deepEqual(ruleGridItems, [])

  // Agent：仍是卡片网格的标题 + 说明。
  const titles = withClass(tree, 'ws-suite-item-title').map((node) => node.children[0])
  for (const agent of SOCIAL_CONTENT.suite.agents) assert.ok(titles.includes(agent.title), `agent ${agent.name}`)
  const descs = withClass(tree, 'ws-suite-item-desc').map((node) => node.children[0])
  assert.deepEqual(descs, SOCIAL_CONTENT.suite.agents.map((agent) => agent.desc))
  // 空 desc 不渲染说明节点
  assert.equal(descs.includes(''), false)
})

test('A3 详情：规则正文缺失时退回摘要，不渲染空白块', () => {
  const item = {
    ...SOCIAL_CONTENT,
    id: 'suite-degraded-fixture',
    suite: {
      skills: [],
      rules: [
        { name: 'no-content', title: '缺正文的规则', desc: '这是一句摘要。', content: '' },
        { name: 'has-content', title: '有正文的规则', desc: '一句摘要', content: '# 原文\n\n1. 第一条。' },
      ],
      agents: [],
    },
  }
  const tree = renderSuite(item).render()
  const bodies = withClass(tree, 'ws-suite-rule-body').map((node) => node.children[0])
  assert.deepEqual(bodies, ['这是一句摘要。', '# 原文\n\n1. 第一条。'])
  assert.equal(bodies.includes(''), false, '正文缺失时必须退回摘要，不得出现空白块')
})

test('A4 安装弹窗：列出三类数量，落点默认「当前项目」，可切「个人全局」', () => {
  const ui = renderSuite(SOCIAL_CONTENT)
  let tree = ui.render()
  assert.equal(withClass(tree, 'ws-suite-install-dialog').length, 0)

  withClass(tree, 'ws-detail-header-actions')[0].children[0].props.onClick()
  tree = ui.render()
  assert.equal(withClass(tree, 'ws-suite-install-dialog').length, 1)
  assert.equal(withClass(tree, 'ws-suite-install-summary')[0].children[0], '将安装 0 个技能、5 条规则、7 个 Agent。')

  let options = withClass(tree, 'ws-suite-target-option')
  assert.deepEqual(options.map((node) => node.children[0]), ['当前项目', '个人全局'])
  assert.equal(options[0].props['aria-checked'], true)
  assert.equal(options[1].props['aria-checked'], false)

  options[1].props.onClick()
  tree = ui.render()
  options = withClass(tree, 'ws-suite-target-option')
  assert.equal(options[0].props['aria-checked'], false)
  assert.equal(options[1].props['aria-checked'], true)
})

test('A4 安装弹窗：无规则的套件不提供落点选择', () => {
  const ui = renderSuite(DISTRIBUTION)
  let tree = ui.render()
  withClass(tree, 'ws-detail-header-actions')[0].children[0].props.onClick()
  tree = ui.render()
  assert.equal(withClass(tree, 'ws-suite-install-dialog').length, 1)
  assert.equal(withClass(tree, 'ws-suite-target-option').length, 0)
})

test('A5 确认安装（默认当前项目）：suiteInstall 带 projectDir，回执按响应逐项渲染', async () => {
  const installed = []
  const ui = renderSuite(SOCIAL_CONTENT, { onInstalled: (item) => installed.push(item.id) })
  let tree = ui.render()
  withClass(tree, 'ws-detail-header-actions')[0].children[0].props.onClick()
  tree = ui.render()
  withClass(tree, 'ws-detail-actions')[0].children[1].props.onClick()
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(ui.calls, [{
    method: 'suiteInstall',
    payload: { id: 'suite-social-content-team', ruleTarget: 'project', projectDir: '/work/current-project' },
  }])
  assert.deepEqual(installed, ['suite-social-content-team'])

  tree = ui.render()
  assert.equal(withClass(tree, 'ws-suite-install-dialog').length, 0)
  const installButton = withClass(tree, 'ws-detail-header-actions')[0].children[0]
  assert.equal(installButton.children[0], '卸载')
  assert.equal(installButton.props.disabled, false)
  const receipt = withClass(tree, 'ws-suite-receipt')[0]
  assert.equal(receipt.props.className, 'ws-suite-receipt')
  assert.equal(withClass(receipt, 'ws-suite-receipt-title')[0].children[0], '安装完成')
  assert.deepEqual(
    withClass(receipt, 'ws-suite-receipt-item').map((node) => node.children[0]),
    [
      '技能：新增 0、已完成 0、失败 0（共 0）',
      '规则：写入 5、已存在 0、失败 0（共 5）',
      'Agent：新增 7、已完成 0、失败 0（共 7）',
      '规则落点：/work/AGENTS.md',
    ],
  )
})

test('A5 切「个人全局」：payload 不带 projectDir', async () => {
  const ui = renderSuite(SOCIAL_CONTENT)
  let tree = ui.render()
  withClass(tree, 'ws-detail-header-actions')[0].children[0].props.onClick()
  tree = ui.render()
  withClass(tree, 'ws-suite-target-option')[1].props.onClick()
  tree = ui.render()
  withClass(tree, 'ws-detail-actions')[0].children[1].props.onClick()
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(ui.calls, [{
    method: 'suiteInstall',
    payload: { id: 'suite-social-content-team', ruleTarget: 'global' },
  }])
})

test('A5 解析不到项目目录时不发请求，明确提示改选个人全局', async () => {
  const ui = renderSuite(SOCIAL_CONTENT, { projectDir: '' })
  let tree = ui.render()
  withClass(tree, 'ws-detail-header-actions')[0].children[0].props.onClick()
  tree = ui.render()
  withClass(tree, 'ws-detail-actions')[0].children[1].props.onClick()
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(ui.calls, [])
  tree = ui.render()
  assert.equal(withClass(tree, 'sh-err')[0].children[0], '无法定位当前项目目录，请改选「个人全局」后重试。')
  assert.equal(withClass(tree, 'ws-suite-install-dialog').length, 1)
})

test('A5 partial 回执标注未完成项，按钮不转「已安装」且不向上层声明成功', async () => {
  const installed = []
  const ui = renderSuite(SOCIAL_CONTENT, {
    onInstalled: (item) => installed.push(item.id),
    api: async (method, payload) => ({
      ok: true,
      id: 'suite-social-content-team',
      already: false,
      partial: true,
      failed: [{ part: 'agents', name: 'music-agent', error: 'EACCES' }],
      skills: { total: 0, installed: 0, already: 0, failed: 0, items: [] },
      rules: { target: payload.ruleTarget, file: '/work/AGENTS.md', total: 5, written: 5, already: 0, failed: 0, items: [] },
      agents: { total: 7, installed: 6, already: 0, failed: 1, items: [] },
    }),
  })
  let tree = ui.render()
  withClass(tree, 'ws-detail-header-actions')[0].children[0].props.onClick()
  tree = ui.render()
  withClass(tree, 'ws-detail-actions')[0].children[1].props.onClick()
  await new Promise((resolve) => setImmediate(resolve))

  tree = ui.render()
  const receipt = withClass(tree, 'ws-suite-receipt')[0]
  assert.equal(receipt.props.className, 'ws-suite-receipt partial')
  assert.equal(withClass(receipt, 'ws-suite-receipt-title')[0].children[0], '部分未完成')
  const items = withClass(receipt, 'ws-suite-receipt-item').map((node) => node.children[0])
  assert.ok(items.includes('未完成 · music-agent：EACCES'))
  assert.equal(withClass(tree, 'ws-detail-header-actions')[0].children[0].children[0], '安装')
  assert.deepEqual(installed, [], 'partial 不得向上层声明安装完成')
})

test('A5 失败必须回传原因：不得静默成功或标记已安装', async () => {
  const installed = []
  const ui = renderSuite(SOCIAL_CONTENT, {
    api: async () => { throw new Error('suiteInstall-failed') },
    onInstalled: (item) => installed.push(item.id),
  })
  let tree = ui.render()
  withClass(tree, 'ws-detail-header-actions')[0].children[0].props.onClick()
  tree = ui.render()
  withClass(tree, 'ws-detail-actions')[0].children[1].props.onClick()
  await new Promise((resolve) => setImmediate(resolve))

  tree = ui.render()
  assert.equal(withClass(tree, 'sh-err')[0].children[0], '安装失败：suiteInstall-failed')
  assert.equal(withClass(tree, 'ws-detail-header-actions')[0].children[0].children[0], '安装')
  assert.equal(withClass(tree, 'ws-suite-receipt').length, 0)
  assert.deepEqual(installed, [])
})

test('已安装态：item.installed 为真时按钮呈现为「卸载」并可触发卸载确认', () => {
  const ui = renderSuite({ ...SOCIAL_CONTENT, installed: true })
  const tree = ui.render()
  const actionButton = withClass(tree, 'ws-detail-header-actions')[0].children[0]
  assert.equal(actionButton.children[0], '卸载')
  assert.equal(actionButton.props.disabled, false)
  actionButton.props.onClick()
  assert.equal(withClass(ui.render(), 'ws-suite-install-dialog').length, 1)
})

test('resolveProjectDir：会话 cwd 优先，回落工作区目录，缺失返回空串', () => {
  const sessions = (byId, current) => ({ list: { getSnapshot: () => ({ current, byId }) } })
  const workspaces = (items, recentWorkspaceId) => ({ list: { getSnapshot: () => ({ items, recentWorkspaceId }) } })

  assert.equal(plazaUtils.resolveProjectDir(sessions({ s1: { cwd: '/a/b/' } }, 's1'), null), '/a/b')
  assert.equal(
    plazaUtils.resolveProjectDir(sessions({ s1: { workspaceId: 'ws-1' } }, 's1'), workspaces([{ workspaceId: 'ws-1', path: '/ws/one' }])),
    '/ws/one',
  )
  assert.equal(
    plazaUtils.resolveProjectDir(sessions({}, ''), workspaces([], 'ws-recent')),
    '',
  )
  assert.equal(plazaUtils.resolveProjectDir(null, null), '')
  assert.equal(plazaUtils.resolveProjectDir({ list: { getSnapshot: () => { throw new Error('boom') } } }, null), '')
})

test('A3 分派：renderPlazaModals 按 kind === suite 走套件详情，其他条目仍走 Drawer', () => {
  const source = readFileSync(new URL('./skill-plaza.js', import.meta.url), 'utf8')
  const context = {
    require: req,
    h,
    fmt: (value) => String(value),
    iconSrc: (value) => value,
    useTr: () => (key) => key,
    useState: (init) => [init, () => {}],
    useCallback: (fn) => fn,
    useEffect: () => {},
    SkillShelf,
    createSkillSession: () => {},
    Drawer: 'Drawer',
    lookup: (key) => key,
  }
  const renderModals = runInNewContext(`${source}\nrenderPlazaModals`, context)
  const state = {
    open: null,
    setOpen: () => {},
    openInstallModal: false,
    setOpenInstallModal: () => {},
    confirmInstallItem: null,
    confirmInstallError: '',
    confirmInstalling: false,
  }
  const opts = { state, mark: () => {}, loadInstalled: () => {}, onCloseModal: () => {}, onConfirm: () => {}, tr: (key) => key }

  state.open = { ...suiteCard(SOCIAL_CONTENT), kind: 'suite' }
  const suiteNodes = renderModals(opts)
  assert.equal(typeof suiteNodes[0].type, 'function')
  assert.equal(suiteNodes[0].type.name, 'SuiteDetailModal')

  state.open = { id: 'sk-demo', kind: 'skill', slug: 'demo', name: '示例技能' }
  assert.equal(renderModals(opts)[0].type, 'Drawer')
})

test('A1 套件分类跳过远端检索，只渲染本地卡片', async () => {
  const capture = () => {
    const writes = {}
    const calls = []
    let effect = null
    const state = {
      category: '',
      submitted: '',
      page: 1,
      setItems: (value) => { writes.items = value },
      setTotal: (value) => { writes.total = value },
      setHasMore: (value) => { writes.hasMore = value },
      setFallback: (value) => { writes.fallback = value },
      setStatus: (value) => { writes.status = value },
      setErr: (value) => { writes.err = value },
    }
    return {
      state,
      writes,
      calls,
      run: () => {
        usePlazaSearchEffect(state, {
          useEffect: (fn) => { effect = fn },
          api: (method, payload) => { calls.push({ method, payload }); return Promise.resolve({ items: [], total: 0 }) },
        })
        effect()
      },
    }
  }

  const suite = capture()
  suite.state.category = '套件'
  suite.run()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(suite.calls, [])
  assert.deepEqual(suite.writes.items, [])
  assert.equal(suite.writes.status, 'ready')
  assert.equal(suite.writes.hasMore, false)

  // 对照组：技能领域分类仍照既有行为把分类名拼进远端 query
  const animation = capture()
  animation.state.category = '动画'
  animation.run()
  assert.equal(animation.calls.length, 1)
  assert.equal(animation.calls[0].payload.query, '动画')
})
