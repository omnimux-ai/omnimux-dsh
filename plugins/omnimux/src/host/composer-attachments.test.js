import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  ComposerAttachmentError,
  copyDirectoryIntoImported,
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
  it('rejects directories and application bundles before creating imported files in filesOnly mode', async () => {
    const cwd = tempDir('omx-att-files-only-cwd-')
    const src = tempDir('omx-att-files-only-src-')
    const paths = [join(src, 'folder'), join(src, 'Example.app')]
    for (const path of paths) {
      mkdirSync(path)
      writeFileSync(join(path, 'keep.txt'), 'original')
    }
    const { results } = await materializePaths({
      sessionId: 'ses_files', paths, filesOnly: true, resolveCwd: async () => cwd,
      fs: { mkdirSync() { assert.fail('rejected directories must not create destinations') } },
    })
    assert.deepEqual(results.map(({ sourcePath, ok, error }) => ({ sourcePath, ok, error })),
      paths.map((sourcePath) => ({ sourcePath, ok: false, error: 'not-a-file' })))
    assert.equal(existsSync(join(cwd, 'assets')), false)
    for (const path of paths) assert.equal(readFileSync(join(path, 'keep.txt'), 'utf8'), 'original')
  })

  it('copies ordinary files and preserves sourcePath with filesOnly enabled', async () => {
    const cwd = tempDir('omx-att-files-cwd-')
    const src = tempDir('omx-att-files-src-')
    const paths = [join(src, 'one.txt'), join(src, 'two.txt')]
    paths.forEach((path, index) => writeFileSync(path, `file ${index}`))
    const { results } = await materializePaths({
      sessionId: 'ses_files', paths, filesOnly: true, resolveCwd: async () => cwd,
    })
    assert.deepEqual(results.map((item) => item.sourcePath), paths)
    results.forEach((item, index) => {
      assert.equal(item.ok, true)
      assert.equal(readFileSync(join(cwd, item.relativePath), 'utf8'), `file ${index}`)
      assert.equal(readFileSync(paths[index], 'utf8'), `file ${index}`)
    })
  })

  it('rejects invalid filesOnly values before session lookup', async () => {
    for (const filesOnly of ['true', 1, null, {}]) {
      await assert.rejects(materializePaths({
        sessionId: 'ses_files', paths: [], filesOnly,
        resolveCwd() { assert.fail('invalid payload must not resolve the session') },
      }), (error) => error.code === 'invalid-payload')
    }
  })

  it('copies one file and reports not-a-file for a missing sibling', async () => {
    const cwd = tempDir('omx-att-cwd-')
    const srcDir = tempDir('omx-att-src-')
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

  it('recursively copies a directory tree into assets/imported/<name>/', async () => {
    const cwd = tempDir('omx-att-dir-cwd-')
    const srcRoot = tempDir('omx-att-dir-src-')
    const folder = join(srcRoot, 'Pack')
    mkdirSync(join(folder, 'nested'), { recursive: true })
    writeFileSync(join(folder, 'readme.md'), '# pack')
    writeFileSync(join(folder, 'nested', 'shot.png'), 'img')
    const { results } = await materializePaths({
      sessionId: 'ses_dir',
      paths: [folder],
      resolveCwd: async () => cwd,
    })
    assert.equal(results.length, 1)
    assert.equal(results[0].ok, true)
    assert.equal(results[0].extension, 'DIR')
    assert.equal(results[0].kind, 'document')
    assert.equal(results[0].relativePath, 'assets/imported/Pack')
    assert.equal(results[0].title, 'Pack')
    assert.deepEqual(results[0].files.sort(), [
      'assets/imported/Pack/nested/shot.png',
      'assets/imported/Pack/readme.md',
    ].sort())
    assert.equal(readFileSync(join(cwd, 'assets/imported/Pack/readme.md'), 'utf8'), '# pack')
    assert.equal(readFileSync(join(cwd, 'assets/imported/Pack/nested/shot.png'), 'utf8'), 'img')
  })

  it('materializes a mix of file and directory paths', async () => {
    const cwd = tempDir('omx-att-mix-cwd-')
    const srcRoot = tempDir('omx-att-mix-src-')
    const file = join(srcRoot, 'solo.txt')
    const folder = join(srcRoot, 'Bundle')
    writeFileSync(file, 'solo')
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'a.md'), 'a')
    const { results } = await materializePaths({
      sessionId: 'ses_mix',
      paths: [file, folder],
      resolveCwd: async () => cwd,
    })
    assert.equal(results.length, 2)
    assert.equal(results[0].ok, true)
    assert.equal(results[0].relativePath, 'assets/imported/solo.txt')
    assert.equal(results[1].ok, true)
    assert.equal(results[1].extension, 'DIR')
    assert.equal(results[1].relativePath, 'assets/imported/Bundle')
    assert.deepEqual(results[1].files, ['assets/imported/Bundle/a.md'])
  })

  it('preserves empty roots and nested empty directories without adding fake files', async () => {
    const cwd = tempDir('omx-att-empty-cwd-')
    const source = tempDir('omx-att-empty-src-')
    mkdirSync(join(source, 'Empty'))
    mkdirSync(join(source, 'Nested', 'inner', 'empty'), { recursive: true })
    const { results } = await materializePaths({
      sessionId: 'ses_empty',
      paths: [join(source, 'Empty'), join(source, 'Nested')],
      resolveCwd: async () => cwd,
    })
    assert.equal(results.every((item) => item.ok && item.extension === 'DIR'), true)
    assert.deepEqual(results.map((item) => item.files), [[], []])
    assert.deepEqual(readdirSync(join(cwd, 'assets/imported/Empty')), [])
    assert.deepEqual(readdirSync(join(cwd, 'assets/imported/Nested/inner/empty')), [])
    assert.deepEqual(readdirSync(join(source, 'Nested/inner/empty')), [])
  })

  it('copyDirectoryIntoImported rejects a regular file', async () => {
    const cwd = tempDir('omx-att-dir-reject-cwd-')
    const srcDir = tempDir('omx-att-dir-reject-src-')
    const file = join(srcDir, 'x.txt')
    writeFileSync(file, 'x')
    await assert.rejects(
      () => copyDirectoryIntoImported({ cwd, sourceAbs: file }),
      (error) => error instanceof ComposerAttachmentError && error.code === 'not-a-directory',
    )
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
      url: '/omnimux/composer/attachments/materialize',
      body: { sessionId: 'ses_missing', paths: ['/tmp/a.txt'] },
    })
    assert.equal(result.status, 404)
    assert.equal(result.body.error, 'session-not-found')
  })

  it('returns 400 blob-url-forbidden as a per-item result', async () => {
    const cwd = tempDir('omx-att-blob-')
    const dispatcher = createComposerAttachmentsDispatcher({
      sessionQuery: {
        observeSession: async () => ({
          header: { cwd },
          [Symbol.dispose]() {},
        }),
      },
    })
    const result = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/composer/attachments/materialize',
      body: { sessionId: 'ses_ok', paths: ['blob:https://x/1'] },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.results[0].ok, false)
    assert.equal(result.body.results[0].error, 'blob-url-forbidden')
  })

  it('refuses cross-origin writes', async () => {
    const dispatcher = createComposerAttachmentsDispatcher({})
    const result = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/composer/attachments/materialize',
      body: { sessionId: 'ses', paths: [] },
      origin: 'https://evil.example',
    })
    assert.equal(result.status, 403)
    assert.equal(result.body.error, 'not-local')
  })

  it('reads sessionQuery at request time so a late inject is visible', async () => {
    const cwd = tempDir('omx-att-late-')
    const srcDir = tempDir('omx-att-late-src-')
    const src = join(srcDir, 'late.md')
    writeFileSync(src, 'late')
    const holder = { sessionQuery: null }
    const dispatcher = createComposerAttachmentsDispatcher({
      getSessionQuery: () => holder.sessionQuery,
    })
    const before = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/composer/attachments/materialize',
      body: { sessionId: 'ses_late', paths: [src] },
    })
    assert.equal(before.status, 404)
    holder.sessionQuery = {
      observeSession: async () => ({ header: { cwd }, [Symbol.dispose]() {} }),
    }
    const after = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/composer/attachments/materialize',
      body: { sessionId: 'ses_late', paths: [src] },
    })
    assert.equal(after.status, 200)
    assert.equal(after.body.results[0].ok, true)
    assert.equal(after.body.results[0].relativePath, 'assets/imported/late.md')
  })
})

describe('ComposerAttachmentError', () => {
  it('is constructible with a code', () => {
    const error = new ComposerAttachmentError('path-denied', 'no')
    assert.equal(error.code, 'path-denied')
  })
})
