import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { logicalEntries, directoryPage } from '../directory-page.js'
import { createDirectoryFeed } from './directory-feed.js'
import { en } from './locales.js'

const require = createRequire(import.meta.url)
const compiled = await build({ entryPoints: [new URL('./AssetBrowse.jsx', import.meta.url).pathname], bundle: true,
  write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'dsh-ui-kit'] })
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)((name) => name === 'dsh-ui-kit'
  ? { Button: ({ children, variant, size, ...props }) => createElement('button', props, children) } : require(name), module, module.exports)
const { AssetBrowse } = module.exports
const browseJsx = readFileSync(new URL('./AssetBrowse.jsx', import.meta.url), 'utf8')

describe('Server directory metadata and client page binding', () => {
  it('groups nested logical refs with real file IDs and unavailable metadata', () => {
    const files = [{ id: 'leaf', logical_path: '素材/人物/a.png', relative_path: 'shared/a.png', kind: 'image' },
      { id: 'skip', logical_path: '素材/人物/b.png', status: 'unmigrated', recovery_ref: { taskId: 'task' } }]
    assert.deepEqual(logicalEntries(files).map((row) => row.name), ['素材'])
    assert.deepEqual(logicalEntries(files, '素材').map((row) => row.name), ['人物'])
    const rows = logicalEntries(files, '素材/人物')
    assert.equal(rows[0].fileId, 'leaf')
    assert.equal(rows[1].status, 'unmigrated')
    assert.equal(rows[1].real_path, undefined)
    assert.equal(rows[0].relative_path, undefined)
  })
  it('preserves explicit empty directories and rejects unsafe logical navigation', () => {
    const rows = logicalEntries([{ id: 'empty', logical_path: '素材/空目录', kind: 'directory', relative_path: 'empty' }], '素材')
    assert.equal(rows[0].fileId, 'empty')
    assert.equal(rows[0].is_dir, true)
    for (const path of ['../secret', '/absolute', 'a\\b', 'a//b', 'a/./b']) assert.throws(() => logicalEntries([], path), { code: 'path-denied' })
  })
  it('SSR never slices full metadata into pretend server pages', () => {
    const asset = { id: 'asset', name: 'Generated', files: Array.from({ length: 10000 }, (_, i) => ({ id: `f${i}`, logical_path: `f${i}.png`, kind: 'image' })) }
    const html = renderToStaticMarkup(createElement(AssetBrowse, { asset, t: (key) => en[key] || key, onBack() {} }))
    assert.equal((html.match(/<article/g) || []).length, 0)
    assert.match(html, /Loading/)
    assert.doesNotMatch(browseJsx, /entries\.slice|files\.slice|buildLogicalTree|browse\.truncated/)
    assert.match(browseJsx, /createDirectoryFeed\(\)/)
    assert.match(browseJsx, /listing\.entries\.map/)
  })
  it('rejects stale directory responses after navigation and dispose', async () => {
    const pending = []
    const feed = createDirectoryFeed((...args) => new Promise((resolve) => pending.push({ args, resolve })))
    const first = feed.navigate({ assetId: 'asset', logical: true, path: 'old' })
    const second = feed.navigate({ assetId: 'asset', logical: true, path: 'new' })
    pending[1].resolve({ ok: true, body: { entries: [{ name: 'new' }], total: 1, epoch: 1 } })
    await second
    pending[0].resolve({ ok: true, body: { entries: [{ name: 'old' }], total: 1, epoch: 0 } })
    await first
    assert.equal(feed.getSnapshot().entries[0].name, 'new')
    assert.equal(pending[1].args[3].logical, true)
    assert.equal(pending[1].args[3].limit, 100)
    const third = feed.refresh()
    feed.dispose()
    pending[2].resolve({ ok: true, body: { entries: [{ name: 'late' }] } })
    await third
    assert.deepEqual(feed.getSnapshot().entries, [])
  })
  it('scopes cursors to logical revision and path', () => {
    const rows = [{ name: 'a' }, { name: 'b' }]
    const first = directoryPage(rows, ['asset', 'dir', 1], { limit: 1 })
    assert.throws(() => directoryPage(rows, ['asset', 'elsewhere', 1], { cursor: first.nextCursor }), { code: 'plan-stale' })
    assert.throws(() => directoryPage(rows, ['asset', 'dir', 2], { cursor: first.nextCursor }), { code: 'plan-stale' })
  })
  it('keeps shared preview routing and breadcrumb actions', () => {
    assert.match(browseJsx, /onPreview\(resolveAssetMediaPreview\(entry,\s*\{\s*asset,\s*stack\s*\}\)\)/)
    assert.match(browseJsx, /onPreview\(resolveAssetMediaPreview\(file,\s*\{\s*asset\s*\}\)\)/)
    assert.match(browseJsx, /goCrumb\(index\)/)
    assert.match(browseJsx, /onOpen=\{unavailable \? undefined : open\}/)
  })
})
