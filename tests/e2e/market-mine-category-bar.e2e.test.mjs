/**
 * tests/e2e/market-mine-category-bar.e2e.test.mjs
 * 技能工坊「我的 Skill」标签页移除冗余分类胶囊栏端到端验证 (Issue #2019)
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

test('E2E 静态源码契约：技能工坊仅在 Discover 标签页渲染 category-bar', () => {
  const plazaPath = path.join(root, 'plugins/omnimux-market/src/client/skill-plaza.js')
  const code = fs.readFileSync(plazaPath, 'utf8')

  assert.ok(
    code.includes('isDiscoverTab ? renderCategoryBar(sections.categoryBarOpts) : null') ||
    code.includes('sections.isDiscoverTab ? renderCategoryBar(sections.categoryBarOpts) : null'),
    'omx-stage-sticky 必须声明仅在 isDiscoverTab 下渲染 renderCategoryBar',
  )
})

test('E2E 运行时契约：我的 Skill 标签页彻底移除 category-bar 胶囊栏并保留 mine-toolbar', () => {
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
    cursor = 0
    return render({})
  }

  // 场景 1：在「我的 Skill」标签页中，严禁出现 category-bar
  const mineTree = renderPlaza('mine')
  const mineCategories = nodes(mineTree, n => n.props?.className === 'category-bar')
  assert.equal(mineCategories.length, 0, '我的 Skill 标签页不得渲染 category-bar')
  assert.ok(nodes(mineTree, n => n.type?.name === 'MineToolbar').length >= 1, '我的 Skill 标签页必须正常呈现 MineToolbar')

  // 场景 2：在「Skill」发现标签页中，正常渲染 category-bar
  const discoverTree = renderPlaza('discover')
  const discoverCategories = nodes(discoverTree, n => n.props?.className === 'category-bar')
  assert.equal(discoverCategories.length, 1, 'Skill 发现标签页必须渲染 category-bar')
  assert.ok(discoverCategories[0].children.length > 0, 'category-bar 必须包含分类选项按钮')

  // 场景 3：在「专家市场」标签页中，不渲染 category-bar
  const expertTree = renderPlaza('experts-market')
  const expertCategories = nodes(expertTree, n => n.props?.className === 'category-bar')
  assert.equal(expertCategories.length, 0, '专家市场标签页不得渲染 category-bar')
})
