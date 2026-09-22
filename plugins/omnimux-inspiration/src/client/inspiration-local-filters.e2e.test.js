import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./InspirationSection.jsx', import.meta.url), 'utf8')

test('灵感库不显示云端那排筛选', () => {
  assert.match(source, /tab === 'public' \? \(/)
  assert.doesNotMatch(source, /!rivalTab \? \(/)
})
