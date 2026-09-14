/**
 * 草稿媒体登记表：创建态截图只读预览的通路。
 *
 * 这一层的边界只有两条，但都必须钉死：只认识自己登记过的 id，且只放行本插件
 * 媒体目录内的文件。越界、过期、非图片一律回答「没有」。
 *
 * 对应规格：`specs/product-secondary-page.spec.md` §2.3（AC-403）。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { DRAFT_MEDIA_MAX, createDraftMediaRegistry } from './draft-media.js'

const roots = []

function makeTree() {
  const root = mkdtempSync(join(tmpdir(), 'draft-media-'))
  roots.push(root)
  const mediaDir = join(root, 'products', 'media')
  const outside = join(root, 'outside')
  mkdirSync(mediaDir, { recursive: true })
  mkdirSync(outside, { recursive: true })
  const shot = join(mediaDir, 'site-aurora-desktop-20260914T000000Z-abcd.png')
  const note = join(mediaDir, 'notes.txt')
  const stray = join(outside, 'secret.png')
  writeFileSync(shot, 'png')
  writeFileSync(note, 'text')
  writeFileSync(stray, 'png')
  return { root, mediaDir, shot, note, stray }
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

describe('draft media registry · registration', () => {
  it('registers only rows that carry both an id and a path', () => {
    const { mediaDir } = makeTree()
    const registry = createDraftMediaRegistry({ mediaDir })
    const added = registry.register([
      { id: 'med_1', real_path: '/a.png' },
      { id: '', real_path: '/b.png' },
      { id: 'med_3' },
      null,
      undefined,
    ])
    assert.equal(added, 1)
    assert.equal(registry.size(), 1)
  })

  it('answers nothing without a media directory (misconfigured host stays safe)', () => {
    const registry = createDraftMediaRegistry({ mediaDir: '' })
    assert.equal(registry.register([{ id: 'med_1', real_path: '/a.png' }]), 0)
    assert.equal(registry.resolvePreview('med_1'), null)
  })

  it('caps the table and drops the oldest entries first', () => {
    const { shot } = makeTree()
    const registry = createDraftMediaRegistry({ max: 2, mediaDir: join(shot, '..') })
    registry.register([{ id: 'med_1', real_path: shot }, { id: 'med_2', real_path: shot }])
    registry.register([{ id: 'med_3', real_path: shot }])
    assert.equal(registry.size(), 2)
    assert.equal(registry.resolvePreview('med_1'), null)
    assert.ok(registry.resolvePreview('med_3'))
    assert.equal(DRAFT_MEDIA_MAX, 200)
  })
})

describe('draft media registry · read-only resolution', () => {
  it('resolves a registered shot to a readable stream descriptor', () => {
    const { mediaDir, shot } = makeTree()
    const registry = createDraftMediaRegistry({ mediaDir })
    registry.register([{ id: 'med_1', real_path: shot }])
    const stream = registry.resolvePreview('med_1')
    assert.equal(stream.absolutePath, shot)
    assert.equal(stream.mime, 'image/png')
    assert.equal(stream.size, 3)
  })

  it('refuses an id it never registered, and refuses junk input', () => {
    const { mediaDir, shot } = makeTree()
    const registry = createDraftMediaRegistry({ mediaDir })
    registry.register([{ id: 'med_1', real_path: shot }])
    assert.equal(registry.resolvePreview('med_unknown'), null)
    assert.equal(registry.resolvePreview(''), null)
    assert.equal(registry.resolvePreview(null), null)
    assert.equal(registry.resolvePreview(42), null)
  })

  it('refuses a path outside the plugin media directory', () => {
    const { mediaDir, stray } = makeTree()
    const registry = createDraftMediaRegistry({ mediaDir })
    registry.register([{ id: 'med_out', real_path: stray }])
    assert.equal(registry.resolvePreview('med_out'), null)
  })

  it('refuses a non-image file and a file that no longer exists', () => {
    const { mediaDir, note, shot } = makeTree()
    const registry = createDraftMediaRegistry({ mediaDir })
    registry.register([{ id: 'med_note', real_path: note }, { id: 'med_gone', real_path: join(mediaDir, 'gone.png') }])
    assert.equal(registry.resolvePreview('med_note'), null)
    assert.equal(registry.resolvePreview('med_gone'), null)
    assert.ok(registry.resolvePreview('med_gone') === null)
    assert.ok(shot)
  })

  it('expires entries once the TTL has passed, without a timer', () => {
    const { mediaDir, shot } = makeTree()
    let clock = 1000
    const registry = createDraftMediaRegistry({ mediaDir, ttlMs: 5000, now: () => clock })
    registry.register([{ id: 'med_1', real_path: shot }])
    clock += 4000
    assert.ok(registry.resolvePreview('med_1'), 'still inside the TTL')
    clock += 2000
    assert.equal(registry.resolvePreview('med_1'), null)
    assert.equal(registry.size(), 0)
  })
})
