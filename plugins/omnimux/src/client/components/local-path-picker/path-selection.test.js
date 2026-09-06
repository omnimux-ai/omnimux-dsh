import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { failedPathSelection, parseLocalPaths } from './path-selection.js'

describe('local path selection', () => {
  it('accepts mixed file and directory paths, spaces and Unicode, without duplicates', () => {
    assert.deepEqual(parseLocalPaths('/tmp/素材/a b.txt\r\n/tmp/empty\n/tmp/empty\n'), {
      paths: ['/tmp/素材/a b.txt', '/tmp/empty'], invalid: null,
    })
  })
  it('does not expand relative paths, parent traversal, variables, URLs or NUL', () => {
    for (const path of ['./file', '~/file', '$HOME/file', '/tmp/../file', 'file:///tmp/file', '/tmp/a\0b']) {
      assert.equal(parseLocalPaths(path).invalid, path)
    }
  })
  it('retains only failed inputs after a partial import', () => {
    assert.deepEqual(failedPathSelection([
      { ok: true, sourcePath: '/tmp/good.txt' },
      { ok: false, sourcePath: '/tmp/missing.txt', message: 'File is missing' },
    ]), { remainingPaths: ['/tmp/missing.txt'], error: 'File is missing' })
  })
})
