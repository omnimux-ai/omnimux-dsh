import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { newRecordId } from './library.js'
import { mediaDirOf, resolveProductsPaths } from './paths.js'
import { persistSiteScreenshots, rollback } from './site-shots-store.js'
import { MEDIA_DIR_MODE, MEDIA_FILE_MODE, outcomeOf } from './screenshot-contract.js'

const PAGE_URL = 'https://platform.example.com/'
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

const scratch = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-shots-store-'))
  scratch.push(dir)
  return dir
}

afterEach(() => {
  while (scratch.length > 0) {
    const dir = scratch.pop()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // Best effort in teardown.
    }
  }
})

/**
 * @param {string} kind
 * @param {Buffer} [buffer]
 */
function frame(kind, buffer = PNG) {
  return outcomeOf(kind, true, { width: 1440, height: 900 }, buffer.length, null, buffer)
}

describe('site shots store · paths', () => {
  it('puts the media directory under the products root', () => {
    const paths = resolveProductsPaths({ homeDir: '/tmp/dsh-home' })
    assert.equal(paths.dir, '/tmp/dsh-home/omnimux/products')
    assert.equal(paths.libraryFile, '/tmp/dsh-home/omnimux/products/library.json')
    assert.equal(paths.mediaDir, '/tmp/dsh-home/omnimux/products/media')
  })

  it('still resolves for a store built from libraryFile alone', () => {
    const legacy = { libraryFile: '/tmp/dsh-home/omnimux/products/library.json' }
    assert.equal(mediaDirOf(legacy), '/tmp/dsh-home/omnimux/products/media')
    assert.equal(mediaDirOf({}), '')
    assert.equal(mediaDirOf(), '')
  })
})

describe('site shots store · persistence', () => {
  it('writes one file per captured viewport, in capture order, with med_ ids', async () => {
    const mediaDir = tempDir()
    const entries = await persistSiteScreenshots({
      url: PAGE_URL,
      mediaDir,
      outcomes: [frame('desktop'), frame('mobile')],
    })

    assert.equal(entries.length, 2)
    assert.deepEqual(entries.map((row) => row.original_name.includes('-desktop-')), [true, false])
    for (const entry of entries) {
      assert.match(entry.id, /^med_[0-9a-f]{8}$/)
      assert.equal(entry.real_path.startsWith(mediaDir), true)
      assert.equal(existsSync(entry.real_path), true)
      assert.equal(readFileSync(entry.real_path).length, PNG.length)
      assert.equal(entry.original_name, basename(entry.real_path))
    }
    assert.notEqual(entries[0].id, entries[1].id)
  })

  it('names each file `site-<host>-<viewport>-<stamp>-<rand>.png`', async () => {
    const mediaDir = tempDir()
    const entries = await persistSiteScreenshots({ url: PAGE_URL, mediaDir, outcomes: [frame('desktop')] })
    assert.match(entries[0].original_name, /^site-platform-example-com-desktop-\d{8}T\d{6}Z-[0-9a-f]{4}\.png$/)
  })

  it('sets the directory to 0o700 and every file to 0o600', async () => {
    const mediaDir = join(tempDir(), 'media')
    const entries = await persistSiteScreenshots({
      url: PAGE_URL,
      mediaDir,
      outcomes: [frame('desktop'), frame('mobile')],
    })
    assert.equal(statSync(mediaDir).mode & 0o777, MEDIA_DIR_MODE)
    for (const entry of entries) {
      assert.equal(statSync(entry.real_path).mode & 0o777, MEDIA_FILE_MODE)
    }
  })

  it('leaves no .tmp file behind', async () => {
    const mediaDir = tempDir()
    const entries = await persistSiteScreenshots({ url: PAGE_URL, mediaDir, outcomes: [frame('desktop')] })
    assert.equal(existsSync(`${entries[0].real_path}.tmp`), false)
  })

  it('answers an empty list for nothing to write, without creating the directory', async () => {
    const mediaDir = join(tempDir(), 'media')
    assert.deepEqual(await persistSiteScreenshots({ url: PAGE_URL, mediaDir, outcomes: [] }), [])
    assert.deepEqual(await persistSiteScreenshots({ url: PAGE_URL, mediaDir, outcomes: [frame('desktop', Buffer.alloc(0))] }), [])
    assert.deepEqual(await persistSiteScreenshots({ url: PAGE_URL, mediaDir }), [])
    assert.equal(existsSync(mediaDir), false)
  })

  it('rolls back what it already wrote when a later frame fails, and answers empty', async () => {
    const mediaDir = tempDir()
    let calls = 0
    const entries = await persistSiteScreenshots({
      url: PAGE_URL,
      mediaDir,
      outcomes: [frame('desktop'), frame('mobile')],
      deps: {
        async write(file, buffer) {
          calls += 1
          if (calls === 2) throw new Error('ENOSPC')
          const { writeFileSync } = await import('node:fs')
          writeFileSync(file, buffer, { mode: MEDIA_FILE_MODE })
        },
      },
    })
    assert.deepEqual(entries, [])
    const { readdirSync } = await import('node:fs')
    assert.deepEqual(readdirSync(mediaDir), [], 'the first frame must not survive the failure')
  })

  it('resolves the media directory from paths when none is given', async () => {
    const home = tempDir()
    const paths = resolveProductsPaths({ homeDir: home })
    const entries = await persistSiteScreenshots({ url: PAGE_URL, paths, outcomes: [frame('desktop')] })
    assert.equal(entries.length, 1)
    assert.equal(entries[0].real_path.startsWith(paths.mediaDir), true)
  })

  it('rollback ignores rows without a path and never throws', async () => {
    await assert.doesNotReject(() => rollback([{}, { real_path: '/nonexistent/never-written.png' }]))
    await assert.doesNotReject(() => rollback(null))
  })
})

describe('site shots store · media ids', () => {
  it('mints ids in the very shape the library preserves', () => {
    assert.match(newRecordId('med'), /^med_[0-9a-f]{8}$/)
  })
})
