import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import catalog from '../../catalog/index.json' with { type: 'json' }
import config from '../../catalog/skill-recommendations.json' with { type: 'json' }
import * as SkillShelf from './skill-picker-logic.js'

const entry = (id, extra = {}) => ({ id, kind: 'skill', skill: id, title: id, summary: id, recommended: true, tags: ['动画'], ...extra })
const entries = [entry('a'), entry('b'), entry('c', { recommended: false }), entry('expert', { kind: 'expert' })]
const settings = { featuredSkills: ['b', 'a'], homeRecommendations: ['a'] }
const sections = (items = [], options = {}) => SkillShelf.plazaDiscoverySections(items, { entries, config: settings, ...options })
const ids = items => items.map(item => item.id)

test('shipped configuration adds the admitted collector while preserving all 48 existing recommendations', () => {
  assert.deepEqual(SkillShelf.validateSkillRecommendations(), [])
  assert.equal(config.featuredSkills.length, 69)
  assert.deepEqual(config.featuredSkills, catalog.items.filter(item => item.kind === 'skill' && item.recommended === true).map(item => item.id))
  assert.equal(config.homeRecommendations.length, 20)
  const home = SkillShelf.plazaDiscoverySections()
  assert.deepEqual(ids(home.featured), config.homeRecommendations)
  assert.equal(home.regular.length, catalog.items.filter(item => item.kind === 'skill').length - 20)
  const collector = catalog.items.find(item => item.id === 'sk-bggg-data-amazon')
  assert.equal(collector.cover, undefined)
  const featuredBggg = SkillShelf.plazaDiscoverySections([], { category: 'featured' }).featured.find(item => item.id === 'sk-bggg-data-amazon')
  assert.equal(featuredBggg.cover, undefined)
})

test('ordered resolution deduplicates and never renders unknown, non-Skill or non-featured IDs', () => {
  assert.deepEqual(ids(SkillShelf.resolveSkillRecommendations(['b', 'missing', 'a', 'b', 'expert', 'c'], entries)), ['b', 'a'])
  const errors = SkillShelf.validateSkillRecommendations({ featuredSkills: ['b', 'a', 'b', 'expert'], homeRecommendations: ['missing', 'c'] }, entries)
  assert.ok(errors.some(error => error.includes('duplicate b')))
  assert.ok(errors.some(error => error.includes('expert')))
  assert.ok(errors.some(error => error.includes('missing')))
  assert.ok(errors.some(error => error.includes('not in featuredSkills: c')))
})

test('home order is independent of partial pages, fallback order, duplicate responses and rating updates', () => {
  const ordered = { featuredSkills: ['b', 'a'], homeRecommendations: ['b', 'a'] }
  for (const items of [[], [{ id: 'a', slug: 'a' }], [{ id: 'a', slug: 'a', rating: 4 }, { id: 'b', slug: 'b', rating: 5 }]]) {
    assert.deepEqual(ids(sections(items, { config: ordered }).featured), ['b', 'a'])
  }
  const result = sections([{ id: 'b', slug: 'b' }, { id: 'b', slug: 'b' }])
  assert.deepEqual(ids(result.featured), ['a'])
  assert.deepEqual(ids(result.regular), ['b', 'c'])
})

test('empty home never falls back and non-home featured skills remain discoverable', () => {
  const result = sections([], { config: { ...settings, homeRecommendations: [] } })
  assert.deepEqual(result.featured, [])
  assert.deepEqual(ids(result.regular), ['a', 'b', 'c'])
  assert.deepEqual(ids(sections([], { category: 'featured' }).featured), ['b', 'a'])
  assert.deepEqual(ids(sections([], { category: '动画' }).featured), ['b', 'a'])
  assert.deepEqual(ids(sections([], { category: '动画' }).regular), ['c'])
})

test('search covers non-home featured, ordinary and out-of-taxonomy remote results without recommendation injection', () => {
  const items = [{ id: 'b', slug: 'b' }, { id: 'c', slug: 'c' }, { id: 'remote', slug: 'remote', name: 'Spreadsheet' }]
  assert.deepEqual(ids(sections(items, { query: 'match' }).regular), ['b', 'c', 'remote'])
  assert.deepEqual(sections(items, { query: 'match' }).featured, [])
  assert.deepEqual(ids(sections(items, { query: 'match', category: 'featured' }).regular), ['b'])
  assert.deepEqual(SkillShelf.buildPlazaSearchPayload('match', '', 2, 80), {
    query: 'match', limit: 80, offset: 80, channels: ['custom', 'workbuddy', 'skillhub'],
  })
})

test('only-uninstalled applies consistently to home, featured and regular cards using installed inventory', () => {
  const result = sections([], { installedItems: [{ slug: 'a' }, { slug: 'c' }], uninstalledOnly: true })
  assert.deepEqual(result.featured, [])
  assert.deepEqual(ids(result.regular), ['b'])
  assert.equal(SkillShelf.isRecommendedInstalledSkill({ slug: 'clip-export' }), true)
  assert.equal(SkillShelf.isRecommendedInstalledSkill({ slug: 'unknown', recommended: true }), false)
})

const source = readFileSync(new URL('./skill-plaza.js', import.meta.url), 'utf8')
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
const nodes = (node, predicate) => !node || typeof node !== 'object' ? [] : [
  ...(predicate(node) ? [node] : []), ...(node.children || []).flatMap(child => nodes(child, predicate)),
]
function workshop(initial = {}, response = { items: [] }) {
  const state = new Map(Object.entries(initial).map(([key, value]) => [Number(key), value]))
  let cursor = 0
  let effects = []
  const calls = []
  const render = runInNewContext(`${source}\nSkillPlaza`, {
    h, SkillShelf, fmt: value => String(value), Button: 'Button', Drawer: 'Drawer', iconSrc: value => value,
    useTr: () => key => key, lookup: key => key,
    useState: initialValue => {
      const index = cursor++
      if (!state.has(index)) state.set(index, initialValue)
      return [state.get(index), next => state.set(index, typeof next === 'function' ? next(state.get(index)) : next)]
    },
    useCallback: fn => fn, useEffect: fn => effects.push(fn),
    apiCacheKey: (action, payload) => JSON.stringify([action, payload]), apiCache: new Map(), API_CACHE_TTL_MS: 1000,
    api: async (action, payload) => { calls.push({ action, payload }); return action === 'search' ? response : {} },
  })
  return { state, calls, render: () => { cursor = 0; effects = []; return render({}) }, effects: () => effects.forEach(fn => fn()) }
}

test('real workshop shows one admitted homepage card and retains all 49 on Featured', () => {
  const ui = workshop({ 14: 'ready' })
  assert.equal(nodes(ui.render(), node => node.props.className === 'featured-section').length, 1)
  assert.equal(nodes(ui.render(), node => node.props.className === 'featured-card').length, 20)
  assert.equal(nodes(ui.render(), node => node.props.className === 'regular-card').length, catalog.items.filter(item => item.kind === 'skill').length - 20)
  ui.state.set(1, 'featured')
  assert.equal(nodes(ui.render(), node => node.props.className === 'featured-card').length, 69)
})

test('real search effect preserves full-library results, search heading and pagination payload', async () => {
  const ui = workshop({ 4: 'spreadsheet' }, { items: [{ id: 'remote', slug: 'remote', name: 'Spreadsheet' }], total: 81, hasMore: true })
  ui.render()
  ui.effects()
  await new Promise(resolve => setImmediate(resolve))
  const tree = ui.render()
  assert.equal(nodes(tree, node => node.props.className === 'regular-card').length, 1)
  assert.equal(nodes(tree, node => node.props.className === 'featured-card').length, 0)
  assert.ok(nodes(tree, node => node.children?.includes('workshop.searchResults')).length)
  nodes(tree, node => node.type === 'Button' && node.children.includes('mkt.more'))[0].props.onClick()
  ui.render()
  ui.effects()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(ui.calls.filter(call => call.action === 'search').at(-1).payload.offset, 80)
  ui.state.set(4, '')
  assert.equal(nodes(ui.render(), node => node.props.className === 'featured-card').length, 20)
})
