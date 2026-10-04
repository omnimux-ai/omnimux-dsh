/**
 * V1 图片入库服务（Issue #3052）：assets 单实例拥有的窄写入 Seam。
 *
 * 契约来自 docs/implementation/browser-image-assets-wire-contract.md 与
 * specs/browser-image-assets.spec.md：经校验的下载字节以受管文件真实入库，
 * 同一来源 sourceKey 复用、并发合并，缺文件的旧记录不得冒充成功，
 * 不同图片同名不覆盖，成功后经既有列表/预览可读回。
 */
import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createLibraryStore } from './library.js'
import { AssetsError } from './mappings.js'
import { createImageIngest, imageAssetSource, sanitizeDisplayName } from './image-ingest.js'

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

let root

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'assets-image-ingest-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeFixture() {
  const paths = {
    dir: join(root, 'store'),
    libraryFile: join(root, 'store', 'library.json'),
    filesDir: join(root, 'store', 'data', 'files'),
  }
  const events = []
  const library = createLibraryStore({ paths })
  const ingest = createImageIngest({
    library,
    vaultRoot: paths.dir,
    emitChanged: (asset) => { events.push(asset) },
  })
  return { paths, library, ingest, events }
}

function input(bytes, overrides = {}) {
  return {
    bytes: new Uint8Array(bytes),
    mime: 'image/png',
    displayName: '示例图',
    sourceKey: createHash('sha256').update('https://cdn.example.com/photo.png').digest('hex'),
    ...overrides,
  }
}

describe('ingestDownloadedImage · 真实入库（#3052）', () => {
  it('把经校验的字节落成受管文件并登记，成功回执含 saved/assetId/fileId/lrev', async () => {
    const { library, ingest, events } = await makeFixture()
    const outcome = await ingest.ingestDownloadedImage(input(PNG_BYTES))

    assert.equal(outcome.status, 'saved')
    assert.match(outcome.assetId, /^ast_/)
    assert.match(outcome.fileId, /^fil_/)
    assert.equal(outcome.lrev, 1)

    // 真实文件落盘：受管目录恰一个文件，字节与原下载一致，后缀与校验 MIME 相符。
    const assetDir = join(root, 'store', 'data', 'files', outcome.assetId)
    const landed = readdirSync(assetDir)
    assert.equal(landed.length, 1)
    assert.equal(landed[0].endsWith('.png'), true)
    assert.deepEqual(readFileSync(join(assetDir, landed[0])), PNG_BYTES)

    // 账本记录 vault-relative 路径与来源标记，列表/预览均可读回。
    const view = library.getView(outcome.assetId)
    assert.equal(view.type, 'custom')
    assert.equal(view.source, imageAssetSource(input(PNG_BYTES).sourceKey))
    assert.equal(view.files.length, 1)
    assert.equal(view.files[0].kind, 'image')
    const preview = library.resolvePreview(outcome.assetId, outcome.fileId)
    assert.equal(preview.mime, 'image/png')
    assert.equal(preview.size, PNG_BYTES.byteLength)

    // 持久账本同样持有相对路径，重建 store 后仍然可读。
    const ledger = JSON.parse(readFileSync(join(root, 'store', 'library.json'), 'utf8'))
    assert.equal(ledger.assets[0].files[0].relative_path.startsWith(`data/files/${outcome.assetId}/`), true)
    const reopened = createLibraryStore({ paths: { dir: join(root, 'store'), libraryFile: join(root, 'store', 'library.json'), filesDir: join(root, 'store', 'data', 'files') } })
    assert.equal(reopened.getView(outcome.assetId).files.length, 1)

    // 成功提交发出一次 changed 事件（由调用方转成 omnimux:assets:changed）。
    assert.equal(events.length, 1)

    // 暂存片清干净：不留下本次保存的 stage 目录。
    assert.equal(existsSync(join(root, 'store', '.image-ingest')), false)
  })

  it('同 sourceKey 重复保存返回 duplicate，不新增资产、不抬 revision、不发事件', async () => {
    const { library, ingest, events } = await makeFixture()
    const first = await ingest.ingestDownloadedImage(input(PNG_BYTES))
    const second = await ingest.ingestDownloadedImage(input(PNG_BYTES))

    assert.equal(second.status, 'duplicate')
    assert.equal(second.assetId, first.assetId)
    assert.equal(second.fileId, first.fileId)
    assert.equal(library.list().length, 1)
    assert.equal(library.revision(), 1)
    assert.equal(events.length, 1)
  })

  it('同 sourceKey 的并发保存合并为一次入库', async () => {
    const { library, ingest } = await makeFixture()
    const [a, b, c] = await Promise.all([
      ingest.ingestDownloadedImage(input(PNG_BYTES)),
      ingest.ingestDownloadedImage(input(PNG_BYTES)),
      ingest.ingestDownloadedImage(input(PNG_BYTES)),
    ])
    const statuses = [a.status, b.status, c.status].sort()
    assert.equal(library.list().length, 1)
    assert.equal(a.assetId, b.assetId)
    assert.equal(b.assetId, c.assetId)
    // 并发合并：允许一 saved + 其余 duplicate，或者全部共享同一 saved 结果；
    // 契约要求的是「只得一资产」与非空回执，不要求区分谁先。
    for (const status of statuses) assert.equal(status === 'saved' || status === 'duplicate', true)
  })

  it('同名不同图递增命名而不覆盖，两个资产都保留', async () => {
    const { library, ingest } = await makeFixture()
    const first = await ingest.ingestDownloadedImage(input(PNG_BYTES, { displayName: '海报' }))
    const second = await ingest.ingestDownloadedImage(input(JPEG_BYTES, {
      mime: 'image/jpeg',
      displayName: '海报',
      sourceKey: createHash('sha256').update('https://cdn.example.com/another.jpg').digest('hex'),
    }))

    assert.equal(second.status, 'saved')
    assert.notEqual(second.assetId, first.assetId)
    assert.equal(library.list().length, 2)
    const names = library.list().map((row) => row.name).sort()
    assert.deepEqual(names, ['海报', '海报 (2)'])
    // 各自真实文件互不覆盖。
    const firstDir = readdirSync(join(root, 'store', 'data', 'files', first.assetId))
    const secondDir = readdirSync(join(root, 'store', 'data', 'files', second.assetId))
    assert.deepEqual(readFileSync(join(root, 'store', 'data', 'files', first.assetId, firstDir[0])), PNG_BYTES)
    assert.deepEqual(readFileSync(join(root, 'store', 'data', 'files', second.assetId, secondDir[0])), JPEG_BYTES)
    assert.equal(secondDir[0].endsWith('.jpg'), true)
  })

  it('不同来源同名的并发保存得到唯一递增名称，不出现重名 handle', async () => {
    // QA #3052 Q3：名称冲突检查发生在异步文件复制之前，不同 sourceKey 的
    // 并发保存会双双以同一名字通过检查 —— 必须串行化名称预约与提交。
    const { library, ingest } = await makeFixture()
    const [a, b] = await Promise.all([
      ingest.ingestDownloadedImage(input(PNG_BYTES, {
        displayName: '同名海报',
        sourceKey: createHash('sha256').update('https://a.example.com/x.png').digest('hex'),
      })),
      ingest.ingestDownloadedImage(input(JPEG_BYTES, {
        mime: 'image/jpeg',
        displayName: '同名海报',
        sourceKey: createHash('sha256').update('https://b.example.com/y.jpg').digest('hex'),
      })),
    ])

    assert.equal(a.status, 'saved')
    assert.equal(b.status, 'saved')
    assert.notEqual(a.assetId, b.assetId)
    const names = library.list().map((row) => row.name).sort()
    assert.deepEqual(names, ['同名海报', '同名海报 (2)'])
    const handles = library.list().map((row) => row.handle)
    assert.equal(new Set(handles).size, 2)
  })

  it('displayName 缺失/非法/超长时回退到产品默认名「网页图片」并截断 40 字', async () => {
    const { library, ingest } = await makeFixture()
    const outcome = await ingest.ingestDownloadedImage(input(PNG_BYTES, { displayName: undefined }))
    assert.equal(library.getView(outcome.assetId).name, '网页图片')

    const long = 'a'.repeat(60) + '/bad\nname'
    const second = await ingest.ingestDownloadedImage(input(PNG_BYTES, {
      displayName: long,
      sourceKey: 'b'.repeat(64),
    }))
    const name = library.getView(second.assetId).name
    assert.ok(name.length <= 40)
    assert.equal(name.includes('/'), false)
    assert.equal(/[\u0000-\u001f]/.test(name), false)
  })

  it('sanitizeDisplayName 清真实控制字符但保留普通连字符（QA #3052 Q4）', async () => {
    // 旧实现把 '-' 当控制字符删掉，却漏掉真实控制字符  —— 控制符
    // 随后会被 normalizeName 拒绝成 storage-failed，是双错。
    assert.equal(sanitizeDisplayName('a\u0001b-c'), 'a b-c')
    assert.equal(sanitizeDisplayName('摇滚-海报'), '摇滚-海报')
    const { library, ingest } = await makeFixture()
    const outcome = await ingest.ingestDownloadedImage(input(PNG_BYTES, { displayName: 'a\u0001b-c' }))
    assert.equal(outcome.status, 'saved')
    assert.equal(library.getView(outcome.assetId).name, 'a b-c')
  })

  it('40 字名称重名时为递增后缀预留长度，第二来源仍可保存（QA #3052 Q4）', async () => {
    const { library, ingest } = await makeFixture()
    const long = 'x'.repeat(40)
    const first = await ingest.ingestDownloadedImage(input(PNG_BYTES, { displayName: long }))
    const second = await ingest.ingestDownloadedImage(input(PNG_BYTES, {
      displayName: long,
      sourceKey: createHash('sha256').update('https://cdn.example.com/other.png').digest('hex'),
    }))
    assert.equal(first.status, 'saved')
    assert.equal(second.status, 'saved')
    const secondName = library.getView(second.assetId).name
    assert.ok(secondName.length <= 40)
    assert.equal(secondName.endsWith('(2)'), true)
    assert.notEqual(secondName, long)
  })

  it('来源记录缺文件的旧资产不算 duplicate：保留旧记录另建新条目', async () => {
    // 规格：文件缺失的既有记录不能作为成功证据；缺文件也不授权销毁该记录
    // —— 账本条目、assetId 与元信息保留，新保存另建条目（QA #3052 Q2）。
    // 原断言「移除残骸」违此规格（删除并非清残骸而是丢记录），按授权改写。
    const { library, ingest } = await makeFixture()
    const first = await ingest.ingestDownloadedImage(input(PNG_BYTES))

    // 用户删掉了受管文件：旧记录不再完整，不能继续报「已保存」。
    rmSync(join(root, 'store', 'data', 'files', first.assetId), { recursive: true, force: true })
    const second = await ingest.ingestDownloadedImage(input(PNG_BYTES))

    assert.equal(second.status, 'saved')
    assert.notEqual(second.assetId, first.assetId)
    // 旧记录仍在（缺文件如实可见），新条目另建。
    const rows = library.list()
    assert.equal(rows.length, 2)
    const stale = rows.find((row) => row.id === first.assetId)
    assert.ok(stale, '旧记录必须保留，缺文件不授权删除')
    assert.equal(stale.missing_file_count, 1)
    const landed = readdirSync(join(root, 'store', 'data', 'files', second.assetId))
    assert.equal(landed.length, 1)

    // 之后再保存同来源：命中新的完整资产，返回 duplicate。
    const third = await ingest.ingestDownloadedImage(input(PNG_BYTES))
    assert.equal(third.status, 'duplicate')
    assert.equal(third.assetId, second.assetId)
    assert.equal(library.list().length, 2)
  })

  it('缺文件旧记录在后续保存持久化失败时不被删除：账本、内存、revision 原样', async () => {
    // QA #3052 Q2：对旧记录 remove 并吞失败会造成内存/账本分裂；缺文件不
    // 授权 remove，保存失败时旧记录与 revision 都必须原样保留。
    const { paths, library, ingest } = makeFixture()
    const first = await ingest.ingestDownloadedImage(input(PNG_BYTES))
    rmSync(join(root, 'store', 'data', 'files', first.assetId), { recursive: true, force: true })
    const ledgerBefore = readFileSync(paths.libraryFile, 'utf8')

    // 同一账本上的第二个 store 实例，账本写入被注入失败。
    const fs = await import('node:fs')
    const realWrite = fs.writeFileSync
    const failing = createLibraryStore({
      paths,
      fs: {
        ...fs,
        writeFileSync(file, data, options) {
          if (String(file).endsWith('library.json.tmp')) throw new Error('simulated ledger write failure')
          return realWrite(file, data, options)
        },
      },
    })
    const failingIngest = createImageIngest({ library: failing, vaultRoot: paths.dir })
    const revisionBefore = failing.revision()

    await assert.rejects(
      () => failingIngest.ingestDownloadedImage(input(PNG_BYTES)),
      (error) => error instanceof Error,
    )

    const rows = failing.list()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, first.assetId)
    assert.equal(failing.revision(), revisionBefore)
    assert.equal(readFileSync(paths.libraryFile, 'utf8'), ledgerBefore)
    void ingest
  })

  it('持久化失败不残留可列表资产：错误上抛为失败而非半截成功', async () => {
    const { paths, ingest } = await makeFixture()
    const fs = await import('node:fs')
    const realWrite = fs.writeFileSync
    // 让账本写入失败：ingest 必须失败，且不留幽灵资产与 stage 残留。
    const store = createLibraryStore({
      paths,
      fs: {
        ...fs,
        writeFileSync(file, data, options) {
          if (String(file).endsWith('library.json.tmp')) {
            throw new Error('simulated persist failure')
          }
          return realWrite(file, data, options)
        },
      },
    })
    const failingIngest = createImageIngest({ library: store, vaultRoot: paths.dir })

    await assert.rejects(
      () => failingIngest.ingestDownloadedImage(input(PNG_BYTES)),
      (error) => error instanceof Error,
    )
    assert.equal(store.list().length, 0)
    assert.equal(existsSync(join(root, 'store', '.image-ingest')), false)
    assert.equal(existsSync(join(root, 'store', 'data', 'files')) && readdirSync(join(root, 'store', 'data', 'files')).length > 0, false)
    void ingest
  })

  it('sourceKey 去首尾空白后入库，且必须是 64 位 hex（QA #3052 OCR）', async () => {
    const { library, ingest } = await makeFixture()
    const hex = createHash('sha256').update('https://cdn.example.com/key.png').digest('hex')
    const outcome = await ingest.ingestDownloadedImage(input(PNG_BYTES, { sourceKey: `  ${hex} ` }))
    assert.equal(outcome.status, 'saved')
    // 持久化的是规范化 key：后续规范请求能对同一份资产去重。
    assert.equal(library.getView(outcome.assetId).source, imageAssetSource(hex))
    const again = await ingest.ingestDownloadedImage(input(PNG_BYTES, { sourceKey: hex }))
    assert.equal(again.status, 'duplicate')
    assert.equal(again.assetId, outcome.assetId)

    await assert.rejects(
      () => ingest.ingestDownloadedImage(input(PNG_BYTES, { sourceKey: 'not-a-hex-digest' })),
      (error) => error instanceof AssetsError && error.code === 'invalid-argument',
    )
  })

  it('拒绝非法输入：空字节、非图片 mime、空 sourceKey', async () => {
    const { library, ingest } = await makeFixture()
    await assert.rejects(
      () => ingest.ingestDownloadedImage(input(new Uint8Array(0))),
      (error) => error instanceof AssetsError,
    )
    await assert.rejects(
      () => ingest.ingestDownloadedImage(input(PNG_BYTES, { mime: 'image/svg+xml' })),
      (error) => error instanceof AssetsError,
    )
    await assert.rejects(
      () => ingest.ingestDownloadedImage(input(PNG_BYTES, { sourceKey: '  ' })),
      (error) => error instanceof AssetsError,
    )
    assert.equal(library.list().length, 0)
  })

  it('暂存根是指向 vault 外的 symlink 时拒绝保存，不写入也不清扫外部目录', async () => {
    const { paths, library, ingest } = makeFixture()
    const external = mkdtempSync(join(tmpdir(), 'image-ingest-external-'))
    try {
      // vault 外预建一个合法命名的过期暂存片，内含哨兵文件。
      const staleSlice = join(external, 'old-slice')
      mkdirSync(staleSlice, { recursive: true })
      writeFileSync(join(staleSlice, 'outside-sentinel.txt'), 'must survive')
      utimesSync(staleSlice, new Date(0), new Date(0))
      mkdirSync(paths.dir, { recursive: true })
      const stageRoot = join(paths.dir, '.image-ingest')
      symlinkSync(external, stageRoot, 'dir')

      await assert.rejects(
        () => ingest.ingestDownloadedImage(input(PNG_BYTES)),
        (error) => error instanceof AssetsError && error.code === 'path-denied',
      )
      // 外部目录原样保留：没有越界写入，也没有把过期片当自己的清掉。
      assert.deepEqual(readdirSync(external), ['old-slice'])
      assert.equal(readFileSync(join(staleSlice, 'outside-sentinel.txt'), 'utf8'), 'must survive')
      assert.equal(lstatSync(stageRoot).isSymbolicLink(), true)
      assert.equal(library.list().length, 0)
      assert.equal(library.revision(), 0)
    } finally {
      rmSync(external, { recursive: true, force: true })
      const link = join(paths.dir, '.image-ingest')
      try {
        if (lstatSync(link).isSymbolicLink()) rmSync(link, { force: true })
      } catch {
        // 链接不存在或被拒绝保存前已清理。
      }
    }
  })

  it('R2-1：校验后、清扫读目录前 root 被换成 symlink 时，不读取也不递归删除外部目录', async () => {
    // OCR R2-1：runSave 开头的 realStagingRoot 通过不能担保 sweepStaleSlices
    // 读目录/删除时 root 仍是同一真实目录。注入 fs.realpathSync 模拟 TOCTOU：
    // 校验那一瞬返回合法结果（伪造的是旧读数，不是放行），磁盘上立刻把真实
    // .image-ingest 换成指向外部的 symlink —— 之后清扫必须重新验证并跳过。
    const { paths, library } = makeFixture()
    const external = mkdtempSync(join(tmpdir(), 'image-ingest-race-'))
    const stageRoot = join(paths.dir, '.image-ingest')
    try {
      const staleSlice = join(external, 'old-slice')
      mkdirSync(staleSlice, { recursive: true })
      writeFileSync(join(staleSlice, 'outside-sentinel.txt'), 'must survive')
      utimesSync(staleSlice, new Date(0), new Date(0))
      mkdirSync(stageRoot, { recursive: true })

      let swapped = false
      const raceFs = {
        realpathSync(target) {
          if (String(target) === stageRoot && !swapped) {
            swapped = true
            rmSync(stageRoot, { recursive: true, force: true })
            symlinkSync(external, stageRoot, 'dir')
            // 返回的是「换之前」的读数：校验恰好抢在替换前一拍完成。
            return join(realpathSync(paths.dir), '.image-ingest')
          }
          return realpathSync(target)
        },
      }
      const racyIngest = createImageIngest({ library, vaultRoot: paths.dir, fs: raceFs })

      await assert.rejects(
        () => racyIngest.ingestDownloadedImage(input(PNG_BYTES)),
        (error) => error instanceof AssetsError && error.code === 'path-denied',
      )
      assert.equal(swapped, true)
      // 关键断言：外部过期片与哨兵文件必须原样保留 —— 清扫不得跟随换入的
      // symlink 读取或递归删除 vault 外目录。
      assert.deepEqual(readdirSync(external).sort(), ['old-slice'])
      assert.equal(readFileSync(join(staleSlice, 'outside-sentinel.txt'), 'utf8'), 'must survive')
    } finally {
      rmSync(external, { recursive: true, force: true })
      try {
        if (lstatSync(stageRoot).isSymbolicLink()) rmSync(stageRoot, { force: true })
      } catch {
        // 链接不存在或已被清理。
      }
    }
  })

  it('R2-4：root 不存在于校验时、slice mkdir 前被换成 symlink 时，先在 root 层拒绝，不在外部建 scope', async () => {
    // OCR R2-4：root 缺席时 realStagingRoot 返回 null，随后递归
    // mkdirSync(slice) 会跟随换入的 symlink 先在 vault 外创建 scope 目录 —
    // 任何外部写入必须在发生之前被拒绝。注入 fs.mkdirSync：对 .image-ingest
    // 内第一个 mkdir 请求先落 symlink，再原样放行，模拟「检查后落位」的竞态。
    const { paths, library } = makeFixture()
    const external = mkdtempSync(join(tmpdir(), 'image-ingest-mkdir-'))
    const stageRoot = join(paths.dir, '.image-ingest')
    try {
      mkdirSync(paths.dir, { recursive: true })
      assert.equal(existsSync(stageRoot), false)

      let swapped = false
      const raceFs = {
        mkdirSync(target, options) {
          if (!swapped && String(target).startsWith(stageRoot)) {
            swapped = true
            symlinkSync(external, stageRoot, 'dir')
          }
          return mkdirSync(target, options)
        },
      }
      const racyIngest = createImageIngest({ library, vaultRoot: paths.dir, fs: raceFs })

      await assert.rejects(
        () => racyIngest.ingestDownloadedImage(input(PNG_BYTES)),
        (error) => error instanceof AssetsError && error.code === 'path-denied',
      )
      assert.equal(swapped, true)
      // 关键断言：外部目录必须仍为空 —— slice 不得在被换入的 symlink 下创建。
      assert.deepEqual(readdirSync(external), [])
      assert.equal(lstatSync(stageRoot).isSymbolicLink(), true)
      assert.equal(library.list().length, 0)
    } finally {
      rmSync(external, { recursive: true, force: true })
      try {
        if (lstatSync(stageRoot).isSymbolicLink()) rmSync(stageRoot, { force: true })
      } catch {
        // 链接不存在或已被清理。
      }
    }
  })
})
