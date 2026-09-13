import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePermissionPreset } from './permission-presets.js'

const NAMES = ['read-only', 'workspace-write', 'danger-full-access']

test('旧写法 full-access 会被归一为 danger-full-access', () => {
  assert.equal(normalizePermissionPreset('full-access', NAMES), 'danger-full-access')
})

test('已知预设原样通过，首尾空白被裁剪', () => {
  assert.equal(normalizePermissionPreset('read-only', NAMES), 'read-only')
  assert.equal(normalizePermissionPreset('  workspace-write  ', NAMES), 'workspace-write')
})

test('未知预设、空值与非法类型一律拒绝', () => {
  assert.equal(normalizePermissionPreset('unknown-preset', NAMES), undefined)
  assert.equal(normalizePermissionPreset('', NAMES), undefined)
  assert.equal(normalizePermissionPreset('   ', NAMES), undefined)
  assert.equal(normalizePermissionPreset(undefined, NAMES), undefined)
  assert.equal(normalizePermissionPreset(42, NAMES), undefined)
})
