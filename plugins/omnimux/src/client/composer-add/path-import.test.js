import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createPathImporter } from './path-import.js'

describe('path import adoption', () => {
  it('retries a copied row after a quota race without copying it a second time', async () => {
    let copies = 0
    let full = true
    const importPaths = createPathImporter({
      materialize: async (paths) => {
        copies += 1
        return paths.map((sourcePath) => ({ ok: true, sourcePath, relativePath: 'assets/imported/file.txt' }))
      },
      adopt: (rows) => rows.map((row) => full ? { ...row, ok: false, message: 'quota exceeded' } : row),
      isCurrent: () => true,
    })
    assert.deepEqual(await importPaths(['/tmp/file.txt']), {
      remainingPaths: ['/tmp/file.txt'], error: 'quota exceeded',
    })
    full = false
    assert.deepEqual(await importPaths(['/tmp/file.txt']), { remainingPaths: [], error: '' })
    assert.equal(copies, 1)
  })

  it('retries failed sources but preserves successful copies while adoption is pending', async () => {
    const requests = []
    let full = true
    const importPaths = createPathImporter({
      materialize: async (paths) => {
        requests.push(paths)
        return paths.map((sourcePath) => ({ sourcePath, ok: sourcePath !== '/tmp/missing', error: 'missing' }))
      },
      adopt: (rows) => rows.map((row) => row.ok && full ? { ...row, ok: false, error: 'quota' } : row),
      isCurrent: () => true,
    })
    await importPaths(['/tmp/file', '/tmp/missing'])
    full = false
    const result = await importPaths(['/tmp/file', '/tmp/missing'])
    assert.deepEqual(requests, [['/tmp/file', '/tmp/missing'], ['/tmp/missing']])
    assert.deepEqual(result.remainingPaths, ['/tmp/missing'])
  })

  it('never adopts a completed copy after its action loses ownership', async () => {
    let current = true
    let adopted = false
    const importPaths = createPathImporter({
      materialize: async () => { current = false; return [{ ok: true, sourcePath: '/tmp/file' }] },
      adopt: () => { adopted = true; return [] },
      isCurrent: () => current,
    })
    assert.equal(await importPaths(['/tmp/file']), null)
    assert.equal(adopted, false)
  })
})
