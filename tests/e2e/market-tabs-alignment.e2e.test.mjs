/**
 * tests/e2e/market-tabs-alignment.e2e.test.mjs
 * 技能/专家页 Tab 标签与搜索框标准化对齐端到端契约测试 (Issue #2027)
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

test('E2E 契约一：技能/专家页必须接入标准 Tabs 与 SearchField，淘汰自绘 .nav-tab', () => {
  const plazaPath = path.join(root, 'plugins/omnimux-market/src/client/skill-plaza.js')
  const bootPath = path.join(root, 'plugins/omnimux-market/src/client/boot.js')
  const plazaCode = fs.readFileSync(plazaPath, 'utf8')
  const bootCode = fs.readFileSync(bootPath, 'utf8')

  assert.ok(
    bootCode.includes('Tabs') && bootCode.includes('SearchField'),
    'boot.js 必须引入公共组件库 dsh-ui-kit 导出的 Tabs 和 SearchField',
  )
  assert.ok(
    plazaCode.includes('TabsComp') && plazaCode.includes('variant: "underline"'),
    'skill-plaza.js 必须接入 variant="underline" 标准下划线 Tabs 组件',
  )
  assert.ok(
    plazaCode.includes('SearchFieldComp'),
    'skill-plaza.js 必须接入标准 SearchField 组件',
  )
})

test('E2E 契约二：实机真实浏览器测量报告必须达成 20px 基准线 0 误差垂直对齐', () => {
  const reportPath = path.join(root, 'docs/evidence/market-tabs-alignment-unify-report.json')
  const pngPath = path.join(root, 'docs/evidence/market-tabs-alignment-unify-verified.png')

  assert.ok(fs.existsSync(reportPath), '必须存在专属实机测量报告')
  assert.ok(fs.existsSync(pngPath), '必须存在专属实测浏览器截图')

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  assert.equal(report.pass, true, '实机测量必须全部通过')
  assert.equal(report.tabLabelLeft, 20, 'Tab 文字左边缘必须对齐 20px 基准线')
  assert.equal(report.titleLeft, 20, '精选标题左边缘必须对齐 20px 基准线')
  assert.equal(report.gridLeft, 20, '卡片网格左边缘必须对齐 20px 基准线')
  assert.equal(report.navBarHeight, 44, '标签栏容器高度必须达到全库标准 44px')
})

test('E2E 契约三：运行时渲染契约与 Tab 标签切换逻辑完整保留', () => {
  const plazaPath = path.join(root, 'plugins/omnimux-market/src/client/skill-plaza.js')
  const req = createRequire(plazaPath)
  const source = fs.readFileSync(plazaPath, 'utf8')
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
    const render = runInNewContext(`${source}\nSkillPlaza`, {
      require: req,
      h, SkillShelf, api: async () => ({ items: [] }), fmt: String, iconSrc: v => v,
      Drawer: 'Drawer', useTr: () => key => key, lookup: key => key,
      useState: value => {
        const index = cursor++
        if (!state.has(index)) state.set(index, value)
        return [state.get(index), next => state.set(index, typeof next === 'function' ? next(state.get(index)) : next)]
      },
      useCallback: fn => fn, useEffect: () => {},
    })
    return render({})
  }

  const vdom = renderPlaza('discover')
  const navBar = nodes(vdom, n => n.props?.className === 'nav-bar')[0]
  assert.ok(navBar, '必须成功渲染 nav-bar 顶层导航栏')

  const tabButtons = nodes(navBar, n => n.type === 'button' && (n.props.role === 'tab' || n.props.className?.includes('tab')))
  assert.ok(tabButtons.length >= 3, '必须渲染至少 3 个 Tab 按钮（Skill、我的 Skill、专家市场）')
})
