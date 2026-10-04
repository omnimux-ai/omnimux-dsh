/**
 * V1 图片入库的账本/文件/内存失败一致性（Issue #3052）。
 *
 * library.add() 的提交顺序是「复制文件 → 内存 push → revision+1 → persist」，
 * persist 失败时若只留下内存幽灵资产，list() 能列出、账本却没有 —— 保存服务
 * 会把一次没写上的保存报成成功。这些用例锁定：持久化失败必须整体回退，
 * 既有的旧资产与账本不受影响。
 */
import assert from 'node:assert/strict'
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createLibraryStore } from './library.js'

let root
let realFile

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'assets-library-tx-'))
  realFile = join(root, 'hero.png')
  writeFileSync(realFile, 'png-bytes')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const paths = () => ({
  dir: join(root, 'store'),
  libraryFile: join(root, 'store', 'library.json'),
  filesDir: join(root, 'store', 'data', 'files'),
})

/**
 * 注入 fs：写账本临时文件时抛一次持久化错误，其余文件系统操作走真实实现。
 * @param {(attempts: number) => boolean} shouldFail
 */
function failingLedgerFs(shouldFail) {
  const fs = {
    accessSync,
    constants,
    mkdirSync,
    readFileSync,
    readdirSync,
    realpathSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
  }
  let attempts = 0
  return {
    ...fs,
    writeFileSync(file, data, options) {
      attempts += 1
      if (String(file).endsWith('library.json.tmp') && shouldFail(attempts)) {
        const error = new Error('simulated ledger write failure')
        error.code = 'ENOSPC'
        throw error
      }
      return writeFileSync(file, data, options)
    },
  }
}

describe('LibraryStore add() 持久化失败一致性（#3052）', () => {
  it('persist 失败不残留可列表的幽灵资产、不抬 revision、回收已复制文件', async () => {
    const store = createLibraryStore({ paths: paths(), fs: failingLedgerFs(() => true) })

    await assert.rejects(() => store.add({ name: '网页图片', files: [{ real_path: realFile }] }))

    // 内存状态必须整体回退：list 不可见该资产，revision 没有前进。
    assert.equal(store.list().length, 0)
    assert.equal(store.revision(), 0)

    // 已复制进 data/files/<id>/ 的受管副本必须回收，不能留下孤儿目录。
    const filesRoot = join(root, 'store', 'data', 'files')
    assert.equal(existsSync(filesRoot) && readdirSync(filesRoot).length > 0, false)

    // 账本文件要么不存在，要么不含该资产 —— 重启后也不能凭空出现。
    const ledgerPath = join(root, 'store', 'library.json')
    if (existsSync(ledgerPath)) {
      const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
      assert.equal(ledger.assets.length, 0)
    }
  })

  it('一次 persist 失败不影响既有资产，下一次提交仍成功', async () => {
    let failNext = true
    const store = createLibraryStore({
      paths: paths(),
      fs: failingLedgerFs(() => {
        const should = failNext
        failNext = false
        return should
      }),
    })

    await assert.rejects(() => store.add({ name: '首张图', files: [{ real_path: realFile }] }))

    const asset = await store.add({ name: '第二张图', files: [{ real_path: realFile }] })
    assert.equal(asset.name, '第二张图')
    assert.equal(asset.files.length, 1)
    assert.equal(store.list().length, 1)
    assert.equal(store.revision(), 1)

    // 重建实例后账本与视图一致：失败的那次提交没有留下半个资产。
    const reopened = createLibraryStore({ paths: paths() })
    assert.equal(reopened.list().length, 1)
    assert.equal(reopened.list()[0].name, '第二张图')
    assert.equal(reopened.revision(), 1)
  })

  it('persist 失败前的既有记录原样保留（revision 不前进也不损坏账本）', async () => {
    const fs = failingLedgerFs(() => true)
    const first = createLibraryStore({ paths: paths(), fs: failingLedgerFs(() => false) })
    const kept = await first.add({ name: '既有资产', files: [{ real_path: realFile }] })
    assert.equal(first.revision(), 1)

    const failing = createLibraryStore({ paths: paths(), fs })
    await assert.rejects(() => failing.add({ name: '新资产', files: [{ real_path: realFile }] }))

    const ledger = JSON.parse(readFileSync(join(root, 'store', 'library.json'), 'utf8'))
    assert.equal(ledger.assets.length, 1)
    assert.equal(ledger.assets[0].id, kept.id)
    assert.equal(ledger.revision, 1)
  })
})
