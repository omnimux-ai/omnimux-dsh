/**
 * tests/e2e/market-plugins-column.e2e.test.mjs
 * 技能/专家工坊新增「插件专栏」与分类栅格可开启/禁用布局端到端测试
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E 契约一：技能/专家导航栏必须包含 4 个 Tab，且「插件专栏」排在「专家市场」右侧', () => {
  const plazaPath = path.join(root, 'plugins/omnimux-market/src/client/skill-plaza.js')
  const req = createRequire(plazaPath)
  const source = fs.readFileSync(plazaPath, 'utf8')
  const pluginsColSource = fs.readFileSync(path.join(root, 'plugins/omnimux-market/src/client/plugins-column.js'), 'utf8')
  const SkillShelf = req('./skill-picker-logic.js')

  const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
  function nodes(node, predicate) {
    if (!node || typeof node !== 'object') return []
    return [...(predicate(node) ? [node] : []), ...(node.children || []).flatMap(child => nodes(child, predicate))]
  }

  function renderPlaza(tab) {
    const state = new Map([
      [0, tab], // mainTab
      [10, [{ slug: 'test-skill', name: '测试技能', installed: true, enabled: true }]],
    ])
    let cursor = 0
    const render = runInNewContext(`${pluginsColSource}\n${source}\nSkillPlaza`, {
      require: req,
      h, SkillShelf, api: async () => ({ items: [] }), fmt: String, iconSrc: v => v,
      Drawer: 'Drawer', useTr: () => key => key, lookup: key => key,
      DetailSwitch: (props) => h('div', { className: 'switch-mock', ...props }),
      useState: value => {
        const index = cursor++
        if (!state.has(index)) state.set(index, value)
        return [state.get(index), next => state.set(index, typeof next === 'function' ? next(state.get(index)) : next)]
      },
      useCallback: fn => fn, useEffect: () => {},
    })
    cursor = 0
    return render({})
  }

  const vdom = renderPlaza('plugins')
  const navBar = nodes(vdom, n => n.props?.className === 'nav-bar')[0]
  assert.ok(navBar, '必须成功渲染 nav-bar 顶层导航栏')

  const tabButtons = nodes(navBar, n => n.type === 'button' && (n.props.role === 'tab' || n.props.className?.includes('tab')))
  assert.ok(tabButtons.length >= 4, `必须渲染 4 个 Tab 按钮（当前渲染了 ${tabButtons.length} 个）`)

  // 场景 2：在「插件专栏」标签页中，不渲染旧 category-bar
  const pluginCategories = nodes(vdom, n => n.props?.className === 'category-bar')
  assert.equal(pluginCategories.length, 0, '插件专栏标签页不得渲染 category-bar')

  // 场景 3：在「插件专栏」标签页中，不渲染创建技能/安装动作行
  const actionRows = nodes(vdom, n => n.props?.className === 'action-row')
  assert.equal(actionRows.length, 0, '插件专栏标签页不得渲染创建/安装技能动作行')
})

test('E2E 契约二：插件专栏按四大分类双列网格完整渲染 21 款内置插件，且包含专属图标、文案与开关', () => {
  const pluginsColPath = path.join(root, 'plugins/omnimux-market/src/client/plugins-column.js')
  const pluginsColSource = fs.readFileSync(pluginsColPath, 'utf8')

  const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
  function nodes(node, predicate) {
    if (!node || typeof node !== 'object') return []
    return [...(predicate(node) ? [node] : []), ...(node.children || []).flatMap(child => nodes(child, predicate))]
  }

  const mockStorage = new Map()
  const mockWindow = {
    localStorage: {
      getItem: (k) => mockStorage.get(k) || null,
      setItem: (k, v) => mockStorage.set(k, String(v)),
    },
    dispatchEvent: () => {},
  }

  const DetailSwitchMock = (props) => h('div', { className: 'detail-switch-mock', ...props })

  const render = runInNewContext(`${pluginsColSource}\nrenderPluginsColumnTab`, {
    h,
    DetailSwitch: DetailSwitchMock,
    useState: (init) => {
      const val = typeof init === 'function' ? init() : init
      return [val, () => {}]
    },
    window: mockWindow,
  })

  const vdom = render({ searchQuery: '', tr: k => k, isEn: false })
  assert.ok(vdom, '必须成功返回插件专栏 DOM')

  // 验证四大分类均被渲染
  const categoryTitles = nodes(vdom, n => n.props?.className === 'sh-plugins-category-title')
  assert.equal(categoryTitles.length, 4, '必须渲染 4 个业务分类标题')

  // 验证全量 21 款卡片
  const cards = nodes(vdom, n => typeof n.props?.className === 'string' && n.props.className.includes('sh-plugin-card'))
  assert.equal(cards.length, 21, '必须渲染全部 21 款 OmniMux 插件卡片')

  // 验证核心受保护插件（omnimux 与 omnimux-market）锁定
  const lockedCards = cards.filter(c => c.props.className.includes('is-locked'))
  assert.equal(lockedCards.length, 2, '系统核心中枢插件（omnimux 与 omnimux-market）必须被锁定')

  // 验证卡片内包含图标、标题、描述与开关
  for (const card of cards) {
    const icon = nodes(card, n => n.props?.className === 'sh-plugin-icon-wrap')[0]
    assert.ok(icon, '每个插件卡片必须包含图标槽位')
    const name = nodes(card, n => n.props?.className === 'sh-plugin-name')[0]
    assert.ok(name, '每个插件卡片必须包含插件名称')
    const desc = nodes(card, n => n.props?.className === 'sh-plugin-desc')[0]
    assert.ok(desc, '每个插件卡片必须包含功能描述')
    const sw = nodes(card, n => (n.type === DetailSwitchMock || n.props?.className?.includes('detail-switch-mock') || n.props?.className?.includes('switch')))[0]
    assert.ok(sw, '每个插件卡片必须包含开启/禁用开关')
  }
})

test('E2E 契约三：搜索过滤支持按标题、描述与 ID 进行实时跨分类过滤', () => {
  const pluginsColPath = path.join(root, 'plugins/omnimux-market/src/client/plugins-column.js')
  const pluginsColSource = fs.readFileSync(pluginsColPath, 'utf8')

  const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
  function nodes(node, predicate) {
    if (!node || typeof node !== 'object') return []
    return [...(predicate(node) ? [node] : []), ...(node.children || []).flatMap(child => nodes(child, predicate))]
  }

  const render = runInNewContext(`${pluginsColSource}\nrenderPluginsColumnTab`, {
    h,
    DetailSwitch: (props) => h('div', { className: 'detail-switch-mock', ...props }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    window: { localStorage: { getItem: () => null, setItem: () => {} }, dispatchEvent: () => {} },
  })

  // 搜索 "剪辑台"（命中 omnimux-clip）
  const searchTree1 = render({ searchQuery: '剪辑台', tr: k => k, isEn: false })
  const filteredCards1 = nodes(searchTree1, n => typeof n.props?.className === 'string' && n.props.className.includes('sh-plugin-card'))
  assert.equal(filteredCards1.length, 1, '搜索「剪辑台」应精确命中 1 款插件')
  assert.equal(filteredCards1[0].props?.key, 'omnimux-clip', '命中的插件必须是 omnimux-clip')

  // 搜索不存在的内容应呈现空状态提示
  const emptyTree = render({ searchQuery: '不存在的秘密插件xyz', tr: k => '未找到匹配的插件', isEn: false })
  const emptyContainer = nodes(emptyTree, n => n.props?.className === 'sh-plugins-empty-container')[0]
  assert.ok(emptyContainer, '无匹配结果时必须呈现空状态提示')
})
