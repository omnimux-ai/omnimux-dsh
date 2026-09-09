/**
 * QA edge-case supplement (v0.1 independent verification).
 * Covers the thin spots the original suites left open:
 * - mappings: missing path / path-is-a-file / blank or whitespace name & path
 * - artifacts: same file uploaded twice (sha256 disk dedup vs index records),
 *   prompt_hash carrying an sk- token
 * - http-routes: POST with no origin/referer/sec-fetch-site headers,
 *   unknown route 404 shape
 * - scanner: statStatus on a missing directory
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createMappingStore, AssetsError } from './mappings.js'
import { createArtifactStore } from './artifacts.js'
import { createAssetsDispatcher } from './http-routes.js'
import { statStatus } from './scanner.js'

let root
let realDir

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'assets-qa-edge-'))
  realDir = join(root, 'scan-target')
  mkdirSync(realDir)
  writeFileSync(join(realDir, 'hero.png'), 'png')
  writeFileSync(join(root, 'plain-file.txt'), 'x')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeStores() {
  return {
    mappings: createMappingStore({
      paths: {
        mappingsFile: join(root, 'store', 'mappings.json'),
        scansDir: join(root, 'store', 'scans'),
      },
    }),
    artifacts: createArtifactStore({
      paths: {
        artifactsFile: join(root, 'store', 'artifacts.json'),
        artifactsDir: join(root, 'store', 'artifacts'),
      },
    }),
  }
}

describe('QA edge: MappingStore path/name validation', () => {
  it('rejects a path that does not exist with path-not-found', () => {
    const { mappings } = makeStores()
    assert.throws(
      () => mappings.add(join(root, 'no-such-dir'), '名字'),
      (error) => error instanceof AssetsError && error.code === 'path-not-found',
    )
    assert.equal(mappings.revision(), 0)
  })

  it('accepts a plain file path as a file-kind mapping', () => {
    const { mappings } = makeStores()
    const mapping = mappings.add(join(root, 'plain-file.txt'), '文件')
    assert.equal(mapping.kind, 'file')
  })

  it('rejects empty / whitespace-only display names with name-required', () => {
    const { mappings } = makeStores()
    for (const name of ['', '   ', '\t\n', undefined, null]) {
      assert.throws(
        () => mappings.add(realDir, name),
        (error) => error instanceof AssetsError && error.code === 'name-required',
        `name=${JSON.stringify(name)} should be rejected`,
      )
    }
  })

  it('rejects empty / whitespace-only paths without touching the fs', () => {
    const { mappings } = makeStores()
    for (const path of ['', '   ']) {
      assert.throws(
        () => mappings.add(path, '名字'),
        (error) => error instanceof AssetsError && error.code === 'path-not-found',
        `path=${JSON.stringify(path)} should be rejected`,
      )
    }
  })

  it('trims surrounding whitespace off a valid path and name', () => {
    const { mappings } = makeStores()
    const mapping = mappings.add(`  ${realDir}  `, '  素材  ')
    assert.equal(mapping.real_path, realDir)
    assert.equal(mapping.display_name, '素材')
  })
})

describe('QA edge: ArtifactStore duplicate upload & secret guard', () => {
  it('re-uploading the same file stores one blob but appends two index records', () => {
    const src = join(root, 'same.png')
    writeFileSync(src, 'identical-bytes')
    const { artifacts } = makeStores()
    const first = artifacts.report(src, { agent: 'a', run_id: 'r1' })
    const second = artifacts.report(src, { agent: 'a', run_id: 'r2' })

    // Disk is content-addressed: one blob, identical content_ref.
    assert.equal(second.content_ref, first.content_ref)
    assert.notEqual(second.id, first.id)
    const prefixDir = join(root, 'store', 'artifacts', first.content_ref.split('/')[1])
    assert.equal(readdirSync(prefixDir).length, 1)

    // Index design is append-per-report: two records pointing at one blob.
    assert.equal(artifacts.list().length, 2)
    assert.equal(artifacts.revision(), 2)
  })

  it('blocks a prompt_hash that carries an sk- token', () => {
    const src = join(root, 'clean.png')
    writeFileSync(src, 'clean')
    const { artifacts } = makeStores()
    assert.throws(
      () => artifacts.report(src, { agent: 'a', prompt_hash: 'sk-abcdefghijklmnop' }),
      (error) => error instanceof AssetsError && error.code === 'secret-detected',
    )
    // Nothing persisted by the refused report.
    assert.equal(artifacts.revision(), 0)
    assert.equal(artifacts.list().length, 0)
  })
})

describe('QA edge: AssetsDispatcher loopback & unknown routes', () => {
  it('allows a POST with no origin/referer/sec-fetch-site headers (local non-browser call)', async () => {
    const { mappings } = makeStores()
    const dispatcher = createAssetsDispatcher({ mappings, artifacts: makeStores().artifacts })
    const result = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/assets/mappings',
      body: { path: realDir, name: '素材' },
      // deliberately no origin / referer / secFetchSite
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.mapping.status, 'ok')
  })

  it('still refuses a cross-site POST even without origin/referer', async () => {
    const { mappings, artifacts } = makeStores()
    const dispatcher = createAssetsDispatcher({ mappings, artifacts })
    const result = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/assets/mappings',
      body: { path: realDir, name: '素材' },
      secFetchSite: 'cross-site',
    })
    assert.equal(result.status, 403)
    assert.deepEqual(result.body, { error: 'not-local', message: 'cross-origin write refused' })
  })

  it('answers unknown paths with the contract 404 shape', async () => {
    const { mappings, artifacts } = makeStores()
    const dispatcher = createAssetsDispatcher({ mappings, artifacts })
    for (const [method, url] of [
      ['GET', '/omnimux/assets/nope'],
      ['POST', '/omnimux/assets/mappings/nope'],
    ]) {
      const result = await dispatcher.dispatch({ method, url, body: {} })
      assert.equal(result.status, 404, `${method} ${url}`)
      assert.equal(result.body.error, 'not-found')
      assert.equal(typeof result.body.message, 'string')
    }
  })
})

describe('QA edge: Scanner statStatus', () => {
  it('reports invalid for a missing directory', () => {
    assert.equal(statStatus(join(root, 'gone')), 'invalid')
  })

  it('reports invalid for a file and ok for a real directory', () => {
    assert.equal(statStatus(join(root, 'plain-file.txt')), 'invalid')
    assert.equal(statStatus(realDir), 'ok')
  })
})
