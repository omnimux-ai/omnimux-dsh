import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { listInstalled } from '../../lib/install.js'
import * as SkillShelf from './skill-picker-logic.js'

const req = createRequire(import.meta.url)
const source = readFileSync(new URL('./skill-plaza.js', import.meta.url), 'utf8')
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flatMap(child => nodes(child, predicate))]
}
function workshop(initial = {}, api = async () => ({})) {
  const state = new Map(Object.entries(initial).map(([key, value]) => [Number(key), value]))
  let cursor = 0
  const render = runInNewContext(`${source}\nSkillPlaza`, {
    require: req,
    h, SkillShelf, api, fmt: value => String(value), iconSrc: value => value, Drawer: 'Drawer', useTr: () => key => key, lookup: key => key,
    useState: value => {
      const index = cursor++
      if (!state.has(index)) state.set(index, value)
      return [state.get(index), next => state.set(index, typeof next === 'function' ? next(state.get(index)) : next)]
    },
    useCallback: fn => fn, useEffect: () => {},
  })
  return { state, render: () => { cursor = 0; return render({}) } }
}

test('QA: closed/open/closed installation modal retains identical hook sequence', () => {
  let hooks = []
  const render = runInNewContext(`${source}\nInstallModal`, {
    require: req,
    h, Overlay: 'Overlay', lookup: key => key,
    useState: value => { hooks.push('state'); return [value, () => {}] },
    useRef: () => { hooks.push('ref'); return { current: null } },
  })
  for (const open of [false, true, false]) {
    hooks = []
    render({ open, onClose() {} })
    assert.deepEqual(hooks, ['state', 'state', 'state', 'ref'])
  }
})

test('QA: global category and search intersect in My Skills; All resets category', () => {
  const ui = workshop({ 0: 'mine', 3: 'video', 10: [
    { slug: 'ad', name: 'video ad', tags: ['商业广告'] },
    { slug: 'music', name: 'video music', tags: ['音频音乐'] },
  ] })
  const category = nodes(ui.render(), n => n.props.className === 'category-bar')[0]
  category.children.find(n => n.props.key === '商业广告').props.onClick()
  assert.equal(nodes(ui.render(), n => n.props.className === 'regular-card').length, 1)
  category.children.find(n => n.props.key === '').props.onClick()
  assert.equal(nodes(ui.render(), n => n.props.className === 'regular-card').length, 2)
})

test('QA: featured My Skills retains a recommended skill returned by real listInstalled', async () => {
  const catalog = JSON.parse(readFileSync(new URL('../../catalog/index.json', import.meta.url), 'utf8'))
  const installed = await listInstalled(new URL('../../catalog/skills', import.meta.url).pathname)
  const clip = installed.find(item => item.slug === 'clip-export')
  assert.ok(clip, 'bundled installed-shape fixture exists')
  assert.equal(catalog.items.find(item => item.skill === clip.slug).recommended, true)
  const ui = workshop({ 0: 'mine', 1: 'featured', 10: [{ ...clip, installed: true, enabled: true }] })
  assert.equal(nodes(ui.render(), n => n.props.className === 'regular-card').length, 1,
    'recommended installed skill must not disappear solely because list API omits catalog flags')
})

test('QA: rejected confirm install must not mark a skill installed or close confirmation', async () => {
  const item = { slug: 'qa-unavailable-skill', id: 'qa-item', name: 'QA skill', installed: false }
  const ui = workshop({ 9: [item], 18: item }, async () => { throw new Error('install-rejected') })
  const confirm = nodes(ui.render(), n => n.type?.name === 'ConfirmInstallModal')[0]
  confirm.props.onConfirm()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(ui.state.get(9)[0].installed, false, 'rejected install must not claim success')
  assert.equal(ui.state.get(10).length, 0)
  assert.equal(ui.state.get(18), item)
})

test('regression: installed featured identity survives tab/category reentry and rejects unknown flags', () => {
  const clip = { slug: 'clip-export', name: 'Clip export', installed: true }
  const unknown = { slug: 'not-in-catalog', name: 'Unknown', recommended: true, tags: ['精选'] }
  const ui = workshop({ 0: 'mine', 1: 'featured', 10: [clip, unknown] })
  const cards = () => nodes(ui.render(), n => n.props.className === 'regular-card')
  assert.equal(cards().length, 1)
  assert.equal(SkillShelf.isRecommendedInstalledSkill(unknown), false)
  assert.equal(SkillShelf.isRecommendedInstalledSkill({}), false)
  const categories = nodes(ui.render(), n => n.props.className === 'category-bar')[0]
  categories.children.find(n => n.props.key === '').props.onClick()
  assert.equal(cards().length, 2)
  nodes(ui.render(), n => n.type === 'button' && n.props.className?.startsWith('nav-tab'))[0].props.onClick()
  categories.children.find(n => n.props.key === 'featured').props.onClick()
  nodes(ui.render(), n => n.type === 'button' && n.props.className?.startsWith('nav-tab'))[1].props.onClick()
  assert.equal(cards().length, 1)
  ui.state.set(10, [{ ...clip }]) // list refresh still has no recommendation flags
  assert.equal(cards().length, 1)
})

test('regression: confirm installation exposes error, clears it on retry, and only marks success', async () => {
  const item = { slug: 'retry-skill', id: 'retry-id', installed: false }
  let calls = 0
  let succeed
  const ui = workshop({ 9: [item], 18: item }, async () => {
    if (++calls === 1) throw new Error('install-rejected')
    await new Promise(resolve => { succeed = resolve })
  })
  const modal = () => nodes(ui.render(), n => n.type?.name === 'ConfirmInstallModal')[0]
  await modal().props.onConfirm()
  assert.equal(modal().props.error, 'install-rejected')
  assert.equal(modal().props.installing, false)
  const renderModal = runInNewContext(`${source}\nConfirmInstallModal`, { require: req, h, Overlay: 'Overlay', Button: 'Button', lookup: key => key })
  assert.equal(nodes(renderModal(modal().props), n => n.props.role === 'alert')[0].children[0], 'install-rejected')
  const pending = modal().props.onConfirm()
  assert.equal(modal().props.error, '')
  assert.equal(modal().props.installing, true)
  assert.ok(nodes(renderModal(modal().props), n => n.type === 'Button').every(n => n.props.disabled))
  await modal().props.onConfirm()
  modal().props.onClose()
  assert.equal(calls, 2)
  assert.equal(ui.state.get(18), item)
  assert.equal(ui.state.get(9)[0].installed, false)
  succeed()
  await pending
  assert.equal(ui.state.get(9)[0].installed, true)
  assert.equal(ui.state.get(10).length, 1)
  assert.equal(ui.state.get(18), null)
  assert.equal(modal().props.installing, false)
})
