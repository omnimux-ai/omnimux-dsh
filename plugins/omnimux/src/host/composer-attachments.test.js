import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  ComposerAttachmentError,
  copyFileIntoImported,
  forbiddenSourcePathCode,
  inferKindFromExtension,
  instantiateAssets,
  materializePaths,
  uniqueImportedName,
} from './composer-attachments.js'
import { createComposerAttachmentsDispatcher } from './composer-attachments-http.js'

const temps = []

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  temps.push(dir)
  return dir
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
})

describe('composer-attachments path guards', () => {
  it('rejects .. segments as path-denied', () => {
    assert.equal(forbiddenSourcePathCode('/tmp/../etc/passwd'), 'path-denied')
  })

  it('rejects blob urls', () => {
    assert.equal(forbiddenSourcePathCode('blob:https://example/1'), 'blob-url-forbidden')
  })

  it('uniqueImportedName increments without overwrite', () => {
    const dir = tempDir('omx-att-unique-')
    writeFileSync(join(dir, 'a.txt'), 'one')
    assert.equal(uniqueImportedName(dir, 'a.txt'), 'a (1).txt')
    writeFileSync(join(dir, 'a (1).txt'), 'two')
    assert.equal(uniqueImportedName(dir, 'a.txt'), 'a (2).txt')
  })

  it('infers kinds from extension', () => {
    assert.equal(inferKindFromExtension('png'), 'image')
    assert.equal(inferKindFromExtension('mp4'), 'video')
    assert.equal(inferKindFromExtension('wav'), 'audio')
    assert.equal(inferKindFromExtension('htable'), 'table')
    assert.equal(inferKindFromExtension('pdf'), 'document')
  })
})

describe('materializePaths', () => {
  it('rejects directories and application bundles before creating imported files', async () => {
    const cwd = tempDir('omx-att-files-only-cwd-')
    const src = tempDir('omx-att-files-only-src-')
    const paths = [join(src, 'folder'), join(src, 'Example.app')]
    for (const path of paths) {
      mkdirSync(path)
      writeFileSync(join(path, 'keep.txt'), 'original')
    }
    const { results } = await materializePaths({
      sessionId: 'ses_files', paths, resolveCwd: async () => cwd,
      fs: { mkdirSync() { assert.fail('rejected directories must not create destinations') } },
    })
    assert.deepEqual(results.map(({ sourcePath, ok, error }) => ({ sourcePath, ok, error })),
      paths.map((sourcePath) => ({ sourcePath, ok: false, error: 'not-a-file' })))
    assert.equal(existsSync(join(cwd, 'assets')), false)
    for (const path of paths) assert.equal(readFileSync(join(path, 'keep.txt'), 'utf8'), 'original')
  })

  it('copies ordinary files and preserves sourcePath', async () => {
    const cwd = tempDir('omx-att-files-cwd-')
    const src = tempDir('omx-att-files-src-')
    const paths = [join(src, 'one.txt'), join(src, 'two.txt')]
    paths.forEach((path, index) => writeFileSync(path, `file ${index}`))
    const { results } = await materializePaths({
      sessionId: 'ses_files', paths, resolveCwd: async () => cwd,
    })
    assert.deepEqual(results.map((item) => item.sourcePath), paths)
    results.forEach((item, index) => {
      assert.equal(item.ok, true)
      assert.equal(readFileSync(join(cwd, item.relativePath), 'utf8'), `file ${index}`)
      assert.equal(readFileSync(paths[index], 'utf8'), `file ${index}`)
    })
  })

  it('rejects a missing sibling as not-a-file', async () => {
    const cwd = tempDir('omx-att-missing-cwd-')
    const srcDir = tempDir('omx-att-missing-src-')
    const good = join(srcDir, 'note.md')
    writeFileSync(good, '# hi')
    const missing = join(srcDir, 'gone.pdf')
    const { results } = await materializePaths({
      sessionId: 'ses_1',
      paths: [good, missing],
      resolveCwd: async () => cwd,
    })
    assert.equal(results.length, 2)
    assert.equal(results[0].ok, true)
    assert.equal(results[0].relativePath, 'assets/imported/note.md')
    assert.equal(results[0].kind, 'document')
    assert.equal(readFileSync(join(cwd, 'assets/imported/note.md'), 'utf8'), '# hi')
    assert.equal(results[1].ok, false)
    assert.equal(results[1].error, 'not-a-file')
  })

  it('does not overwrite same-name copies', async () => {
    const cwd = tempDir('omx-att-dup-')
    mkdirSync(join(cwd, 'assets', 'imported'), { recursive: true })
    writeFileSync(join(cwd, 'assets/imported/a.txt'), 'keep')
    const srcDir = tempDir('omx-att-dup-src-')
    const src = join(srcDir, 'a.txt')
    writeFileSync(src, 'new')
    const copied = await copyFileIntoImported({ cwd, sourceAbs: src })
    assert.equal(copied.name, 'a (1).txt')
    assert.equal(copied.relativePath, 'assets/imported/a (1).txt')
    assert.equal(readFileSync(join(cwd, 'assets/imported/a.txt'), 'utf8'), 'keep')
    assert.equal(readFileSync(copied.destAbs, 'utf8'), 'new')
  })
})

describe('instantiateAssets', () => {
  it('copies visible library files under assets/imported/<id>/', async () => {
    const cwd = tempDir('omx-att-ast-cwd-')
    const vault = tempDir('omx-att-vault-')
    const hero = join(vault, 'hero.png')
    const extra = join(vault, 'pose.png')
    writeFileSync(hero, 'img')
    writeFileSync(extra, 'img2')
    const { results } = await instantiateAssets({
      sessionId: 'ses_1',
      assetIds: ['ast_1'],
      resolveCwd: async () => cwd,
      fetchAsset: async () => ({
        id: 'ast_1',
        name: '林晓',
        cover_file_id: 'fil_1',
        files: [
          { id: 'fil_1', real_path: hero, original_name: 'hero.png', visible: true },
          { id: 'fil_2', real_path: extra, original_name: 'pose.png', visible: true },
        ],
      }),
    })
    assert.equal(results[0].ok, true)
    assert.equal(results[0].kind, 'asset')
    assert.equal(results[0].relativePath, 'assets/imported/ast_1/hero.png')
    assert.deepEqual(results[0].files, [
      'assets/imported/ast_1/hero.png',
      'assets/imported/ast_1/pose.png',
    ])
    assert.equal(results[0].previewUrl, '/omnimux/assets/library/preview?id=ast_1')
  })
})

describe('createComposerAttachmentsDispatcher', () => {
  it('returns 404 session-not-found when sessionQuery is missing', async () => {
    const dispatcher = createComposerAttachmentsDispatcher({ sessionQuery: null })
    const result = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/composer/attachments/instantiate',
      body: { sessionId: 'ses_missing', assetIds: [] },
    })
    assert.equal(result.status, 404)
    assert.equal(result.body.error, 'session-not-found')
  })

  it('reports a missing library asset as a per-item result', async () => {
    const cwd = tempDir('omx-att-missing-asset-')
    const dispatcher = createComposerAttachmentsDispatcher({
      sessionQuery: {
        observeSession: async () => ({
          header: { cwd },
          [Symbol.dispose]() {},
        }),
      },
      fetchAsset: async () => { throw new ComposerAttachmentError('asset-not-found', 'asset not found') },
    })
    const result = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/composer/attachments/instantiate',
      body: { sessionId: 'ses_ok', assetIds: ['ast_gone'] },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.results[0].ok, false)
    assert.equal(result.body.results[0].error, 'asset-not-found')
  })

  it('refuses cross-origin writes', async () => {
    const dispatcher = createComposerAttachmentsDispatcher({})
    const result = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/composer/attachments/instantiate',
      body: { sessionId: 'ses', assetIds: [] },
      origin: 'https://evil.example',
    })
    assert.equal(result.status, 403)
    assert.equal(result.body.error, 'not-local')
  })

  it('reads sessionQuery at request time so a late inject is visible', async () => {
    const cwd = tempDir('omx-att-late-')
    const holder = { sessionQuery: null }
    const dispatcher = createComposerAttachmentsDispatcher({
      getSessionQuery: () => holder.sessionQuery,
      fetchAsset: async (id) => ({
        id,
        name: 'late',
        files: [{ id: 'fil_late', real_path: join(cwd, 'late.md'), original_name: 'late.md', visible: true }],
      }),
    })
    writeFileSync(join(cwd, 'late.md'), 'late')
    const before = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/composer/attachments/instantiate',
      body: { sessionId: 'ses_late', assetIds: ['ast_late'] },
    })
    assert.equal(before.status, 404)
    holder.sessionQuery = {
      observeSession: async () => ({ header: { cwd }, [Symbol.dispose]() {} }),
    }
    const after = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/composer/attachments/instantiate',
      body: { sessionId: 'ses_late', assetIds: ['ast_late'] },
    })
    assert.equal(after.status, 200)
    assert.equal(after.body.results[0].ok, true)
    assert.equal(after.body.results[0].relativePath, 'assets/imported/ast_late/late.md')
  })
})

describe('ComposerAttachmentError', () => {
  it('is constructible with a code', () => {
    const error = new ComposerAttachmentError('path-denied', 'no')
    assert.equal(error.code, 'path-denied')
  })
})
