import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ASSET_CATEGORIES,
  isAlreadyAdded,
  remainingQuota,
  toggleSelect,
} from './picker-model.js'

describe('picker-model categories', () => {
  it('keeps the six asset categories', () => {
    assert.deepEqual([...ASSET_CATEGORIES], ['character', 'scene', 'style', 'prop', 'knowledge', 'custom'])
  })
})

describe('picker-model quota (composer 域注入 max=8)', () => {
  it('allows one more selection when 7 of 8 seats are occupied', () => {
    const first = toggleSelect({
      selected: new Set(),
      id: 'ast_new',
      occupied: 7,
      alreadyIds: [],
      max: 8,
    })
    assert.equal(first.blocked, null)
    assert.equal(first.selected.has('ast_new'), true)
    const second = toggleSelect({
      selected: first.selected,
      id: 'ast_two',
      occupied: 7,
      alreadyIds: [],
      max: 8,
    })
    assert.equal(second.blocked, 'quota-exceeded')
    assert.equal(second.selected.has('ast_two'), false)
  })

  it('does not re-select already-added assets', () => {
    const next = toggleSelect({
      selected: new Set(),
      id: 'ast_old',
      occupied: 1,
      alreadyIds: ['ast_old'],
      max: 8,
    })
    assert.equal(next.blocked, 'already-added')
    assert.equal(next.selected.size, 0)
  })

  it('remaining is 0 at capacity but browsing is still allowed', () => {
    const quota = remainingQuota({ occupied: 8, selectedCount: 0, max: 8 })
    assert.equal(quota.remaining, 0)
    assert.equal(quota.canSelectMore, false)
  })
})

describe('picker-model generalized max', () => {
  it('max=1 supports single-select scenarios (画布)', () => {
    const first = toggleSelect({ selected: new Set(), id: 'a', occupied: 0, max: 1 })
    assert.equal(first.blocked, null)
    const second = toggleSelect({ selected: first.selected, id: 'b', occupied: 0, max: 1 })
    assert.equal(second.blocked, 'quota-exceeded')
    const deselect = toggleSelect({ selected: first.selected, id: 'a', occupied: 0, max: 1 })
    assert.equal(deselect.blocked, null)
    assert.equal(deselect.selected.size, 0)
  })

  it('max 缺省 = Infinity（共享层不设硬编码上限）', () => {
    let selected = new Set()
    for (let i = 0; i < 50; i += 1) {
      const next = toggleSelect({ selected, id: `ast_${i}`, occupied: 0 })
      assert.equal(next.blocked, null)
      selected = next.selected
    }
    assert.equal(selected.size, 50)
    const quota = remainingQuota({ occupied: 0, selectedCount: 50 })
    assert.equal(quota.remaining, Infinity)
    assert.equal(quota.canSelectMore, true)
  })

  it('isAlreadyAdded accepts Set or array', () => {
    assert.equal(isAlreadyAdded(new Set(['x']), 'x'), true)
    assert.equal(isAlreadyAdded(['x'], 'x'), true)
    assert.equal(isAlreadyAdded(['x'], 'y'), false)
    assert.equal(isAlreadyAdded([], ''), false)
  })

  it('AssetPicker uses the kit lg tier + shared dialog contract instead of a dead width prop', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('./AssetPicker.jsx', import.meta.url), 'utf8')
    assert.ok(source.includes('size="lg"'), 'sits on the kit lg tier')
    assert.ok(source.includes('className={PICKER_DIALOG_CLASS}'), 'owns the dialog width via the official className seam')
    assert.ok(source.includes('ensurePickerDialogStyles'), 'injects the shared dialog geometry contract')
    assert.ok(!/width=\{\d+\}/.test(source), 'no dead width prop (ModalDialog has none)')
    assert.ok(source.includes('repeat(auto-fill, minmax(240px, 1fr))'), 'uses responsive grid columns')
    assert.ok(source.includes('max-height: calc(80vh - 190px)'), 'caps height by viewport to avoid dialog overflow')
    assert.ok(!source.includes('min-height: 480px'), 'drops the rigid min-height that overflowed the dialog body')
    assert.ok(source.includes('ModalCloseButton'), '关闭按钮改用全局共享组件')
    assert.ok(source.includes('placement="external"'), '共享关闭按钮固定在弹窗外侧')
  })
})
