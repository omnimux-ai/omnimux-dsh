import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import * as SkillShelf from './skill-picker-logic.js'

const fixture = {
  tabs: [{ id: 'all' }, { id: '动画' }, { id: '教育' }],
  skills: [
    { slug: 'name-match', name: '精确名称', description: '普通说明', category: '动画' },
    { slug: 'description-match', name: '普通名称', description: '独特描述', category: '动画' },
    { slug: 'other-category', name: '精确名称', category: '教育' },
  ],
}
const { filterPickerItems, filterPresetSkills } = SkillShelf

function displayPreset(preset, tabId, query) {
  const items = filterPresetSkills(preset.skills, tabId, query)
  return filterPickerItems(items, tabId, preset, query)
}

test('preset helpers retain exact slug search with fixed fixtures', () => {
  assert.deepEqual(displayPreset(fixture, 'all', 'name-match'), [fixture.skills[0]])
})
test('preset helpers keep no-match results empty', () => {
  assert.deepEqual(displayPreset(fixture, 'all', 'no-such-skill'), [])
})
test('preset helpers combine category and query', () => {
  assert.deepEqual(displayPreset(fixture, '动画', '精确名称'), [fixture.skills[0]])
  assert.deepEqual(displayPreset(fixture, '教育', '独特描述'), [])
})
test('preset helpers search descriptions and normalize slug case and whitespace', () => {
  assert.deepEqual(displayPreset(fixture, 'all', '独特描述'), [fixture.skills[1]])
  assert.deepEqual(displayPreset(fixture, 'all', '  NAME-MATCH  '), [fixture.skills[0]])
})
test('empty queries intersect preset whitelist and current category', () => {
  assert.deepEqual(displayPreset(fixture, '动画', ''), fixture.skills.slice(0, 2))
  assert.deepEqual(displayPreset(fixture, '教育', ''), [fixture.skills[2]])
  assert.deepEqual(displayPreset(fixture, 'all', ''), fixture.skills)
  assert.deepEqual(displayPreset({ skills: [] }, 'all', ''), [])
})
test('preset whitelist excludes external items and preserves omitted query behavior', () => {
  const outsider = { slug: 'outside', name: '独特描述', category: '动画' }
  assert.deepEqual(filterPickerItems([outsider], '动画', fixture, '独特描述'), [fixture.skills[1]])
  assert.deepEqual(filterPickerItems([outsider], '动画', fixture, 'outside'), [])
  assert.deepEqual(filterPickerItems([], '动画', fixture), fixture.skills.slice(0, 2))
})
test('non-preset helper retains shelf filtering without treating query as a preset whitelist', () => {
  const items = [...fixture.skills, { slug: 'not-on-shelf', name: 'plain' }]
  assert.deepEqual(filterPickerItems(items, '动画', null, 'unrelated'), fixture.skills.slice(0, 2))
})

// Load the complete trusted build fragment, as existing client tests do. No regex
// extraction, Function/eval, production export changes, or source substitutions.
function panelHarness(presetBinding = fixture) {
  const filterCalls = []
  const slots = [], effects = [], timers = new Map()
  let cursor = 0, dirty = false, timerId = 0, tree
  const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
  const nodes = (node, predicate) => {
    if (!node || typeof node !== 'object') return []
    return [...(predicate(node) ? [node] : []), ...(node.children || []).flatMap(child => nodes(child, predicate))]
  }
  const effect = (fn, deps) => {
    const index = cursor++, previous = slots[index]
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      slots[index] = { deps, cleanup: previous?.cleanup }
      effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = fn() })
    }
  }
  const context = {
    h, SkillShelf: { ...SkillShelf, filterPickerItems(...args) {
      filterCalls.push(args)
      return filterPickerItems(...args)
    } },
    api: async () => ({ items: [] }), lookup: key => key, SearchField: 'SearchField',
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => {
        const next = typeof value === 'function' ? value(slots[index]) : value
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true }
      }]
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial } },
    useEffect: effect, useLayoutEffect: effect,
    window: { addEventListener() {}, removeEventListener() {} },
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id },
    clearTimeout(id) { timers.delete(id) },
  }
  const source = readFileSync(new URL('./skill-picker.js', import.meta.url), 'utf8')
  const renderPanel = runInNewContext(source + '\nSkillPickerPanel', context, { filename: 'skill-picker.js' })
  const props = { open: true, anchorRef: { current: null }, presetBinding, onClose() {}, onPick: () => true }
  const render = () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      cursor = 0; dirty = false
      tree = renderPanel(props)
      effects.splice(0).forEach(fn => fn())
      if (!dirty) return
    }
    throw Error('panel did not settle')
  }
  render()
  return {
    filterCalls,
    search(query) {
      nodes(tree, node => node.type === 'SearchField')[0].props.onValueChange(query)
      render()
      const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn())
      render()
    },
    tab(id) { nodes(tree, node => node.props.role === 'tab' && node.props.key === id)[0].props.onClick(); render() },
    names() { return nodes(tree, node => node.props.className === 'sh-picker-name').map(node => node.children.join('')) },
    dispose() { for (const value of slots) value?.cleanup?.(); timers.clear() },
  }
}

test('real panel bypasses preset whitelist for absent and default-content bindings', () => {
  for (const binding of [null, { ...fixture, useDefaultContentCatalog: true }]) {
    const panel = panelHarness(binding)
    try {
      panel.search('unrelated')
      assert.ok(panel.filterCalls.length > 0)
      assert.ok(panel.filterCalls.every(args => args.length === 2))
    } finally { panel.dispose() }
  }
})

test('real panel fragment keeps query through display filtering, category changes, and clearing', () => {
  const panel = panelHarness()
  try {
    assert.equal(panel.names().length, fixture.skills.length)
    panel.search('  NAME-MATCH  ')
    assert.deepEqual(panel.names(), ['精确名称'])
    panel.search('独特描述')
    assert.deepEqual(panel.names(), ['普通名称'])
    panel.tab('教育')
    assert.deepEqual(panel.names(), [])
    panel.search('')
    assert.deepEqual(panel.names(), ['精确名称'])
    panel.tab('动画')
    assert.deepEqual(panel.names(), ['精确名称', '普通名称'])
    panel.search('outside')
    assert.deepEqual(panel.names(), [])
  } finally { panel.dispose() }
})
