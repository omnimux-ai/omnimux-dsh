import assert from 'node:assert/strict'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { formatAssetUri, isAssetUri, parseAssetUri, resolveAssetUri, toAssetUri } from './protocol.js'

describe('virtual asset protocol (asset://)', () => {
  it('identifies asset:// protocol correctly', () => {
    assert.equal(isAssetUri('asset://character/avatar.png'), true)
    assert.equal(isAssetUri('asset://workspace/project/shot1.mp4'), true)
    assert.equal(isAssetUri('/Users/x/Desktop/photo.png'), false)
    assert.equal(isAssetUri('https://example.com/a.jpg'), false)
    assert.equal(isAssetUri(null), false)
  })

  it('parses asset URIs into scope and subpath', () => {
    assert.deepEqual(parseAssetUri('asset://character/hero/main.png'), {
      scope: 'character',
      path: 'hero/main.png',
    })
    assert.deepEqual(parseAssetUri('asset://artifact/sha256_abcdef.png'), {
      scope: 'artifact',
      path: 'sha256_abcdef.png',
    })
    assert.deepEqual(parseAssetUri('asset://workspace/assets/bg.jpg'), {
      scope: 'workspace',
      path: 'assets/bg.jpg',
    })
    assert.deepEqual(parseAssetUri('asset://style'), {
      scope: 'style',
      path: '',
    })
    assert.equal(parseAssetUri('/not/an/asset'), null)
  })

  it('formats asset URIs from scope and path', () => {
    assert.equal(formatAssetUri('character', 'hero.png'), 'asset://character/hero.png')
    assert.equal(formatAssetUri('scene', '/bg/forest.png'), 'asset://scene/bg/forest.png')
    assert.equal(formatAssetUri('artifact'), 'asset://artifact')
  })

  it('resolves asset URIs to absolute disk paths', () => {
    const home = '/fake/dsh_home'
    const ws = '/fake/workspace'

    // Artifact
    const artPath = resolveAssetUri('asset://artifact/digest123.png', { homeDir: home })
    assert.equal(artPath, join(home, 'omnimux', 'assets', 'artifacts', 'digest123.png'))

    // Workspace
    const wsPath = resolveAssetUri('asset://workspace/models/item.glb', { workspaceDir: ws })
    assert.equal(wsPath, join(ws, 'models', 'item.glb'))

    // Scoped asset
    const charPath = resolveAssetUri('asset://character/ch_wei_an/avatar.png', { homeDir: home })
    assert.equal(charPath, join(home, 'omnimux', 'assets', 'character', 'ch_wei_an', 'avatar.png'))

    // Passthrough absolute path
    assert.equal(resolveAssetUri('/tmp/direct.png'), '/tmp/direct.png')
  })

  it('converts disk paths to asset URIs', () => {
    const home = '/fake/dsh_home'
    const ws = '/fake/workspace'

    // Inside artifacts
    const artDisk = join(home, 'omnimux', 'assets', 'artifacts', 'hash999.png')
    assert.equal(toAssetUri(artDisk, { homeDir: home }), 'asset://artifact/hash999.png')

    // Inside workspace
    const wsDisk = join(ws, 'shots', 's01.mp4')
    assert.equal(toAssetUri(wsDisk, { workspaceDir: ws }), 'asset://workspace/shots/s01.mp4')

    // Fallback scope
    assert.equal(toAssetUri('/other/dir/photo.png', { scope: 'prop' }), 'asset://prop/photo.png')
  })
})
