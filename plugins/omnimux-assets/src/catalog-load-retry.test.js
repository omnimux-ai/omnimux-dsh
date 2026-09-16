/**
 * 目录加载失败必须可自愈（Issue #2005）。
 *
 * 这里锁定的是一类只在真实时序里才暴露的缺陷：物化脚本会「删掉再整份拷回」插件目录，
 * 应用若正好在那个窗口里首次触发加载，就会读空。早先的实现先置 `loaded` 再读文件，
 * 于是这一次读空把插件永久钉在「目录未构建」上，只能靠重启应用恢复。
 *
 * 断言必须打在「不重启、不显式 reload」的前提下——那正是用户真实遇到的场景。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

import { createCloudCatalog } from './cloud-catalog.js'

/** @type {string[]} */
const roots = []

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function newRoot() {
  const root = mkdtempSync(join(tmpdir(), 'catalog-retry-'))
  roots.push(root)
  return root
}

/** 写入一份最小可用目录。 */
function writeCatalog(catalogDir) {
  mkdirSync(catalogDir, { recursive: true })
  writeFileSync(join(catalogDir, 'manifest.json'), JSON.stringify({
    version: 2,
    sourceRoot: '',
    pageSize: 24,
    totalAssets: 1,
    categories: [{
      id: 'scene', zh: '场景', en: 'Scenes', total: 1,
      sub_categories: [{ id: 'nature', zh: '自然山水', en: 'Nature', total: 1 }],
    }],
  }))
  writeFileSync(join(catalogDir, 'index.json'), JSON.stringify([
    { id: 'scene-nature-1', category: 'scene', sub_category: 'nature', name: '测试场景' },
  ]))
}

describe('目录加载失败可自愈', () => {
  it('目录不存在时报「目录未构建」，而不是抛别的错', () => {
    const catalogDir = join(newRoot(), 'catalog')
    const cloud = createCloudCatalog({ catalogDir })
    assert.throws(() => cloud.getManifest(), /catalog-unavailable|not built/)
  })

  it('目录随后出现时，不重启、不 reload，下一次请求就能读到', () => {
    const catalogDir = join(newRoot(), 'catalog')
    const cloud = createCloudCatalog({ catalogDir })

    // 第一次：目录还没物化完 —— 必须失败，且不能把插件钉死。
    assert.throws(() => cloud.getManifest())

    // 模拟物化完成：目录到位。
    writeCatalog(catalogDir)

    // 关键断言：同一个实例，第二次请求必须自己读到。
    const manifest = cloud.getManifest()
    assert.equal(manifest.totalAssets, 1)
    assert.equal(cloud.getRow('scene-nature-1')?.name, '测试场景')
  })

  it('读到有效目录之后才上锁，后续请求不再重复读盘', () => {
    const catalogDir = join(newRoot(), 'catalog')
    writeCatalog(catalogDir)
    const cloud = createCloudCatalog({ catalogDir })

    assert.equal(cloud.getManifest().totalAssets, 1)
    // 读到之后把目录整个挪走：已上锁的实例不该再去读盘，因此仍然可用。
    rmSync(catalogDir, { recursive: true, force: true })
    assert.equal(cloud.getManifest().totalAssets, 1)
  })

  it('reload 会丢掉已加载内容并重新读盘', () => {
    const catalogDir = join(newRoot(), 'catalog')
    writeCatalog(catalogDir)
    const cloud = createCloudCatalog({ catalogDir })
    assert.equal(cloud.getManifest().totalAssets, 1)

    // 目录换成另一份内容，reload 后必须看到新的。
    writeFileSync(join(catalogDir, 'manifest.json'), JSON.stringify({
      version: 2, sourceRoot: '', pageSize: 24, totalAssets: 7, categories: [],
    }))
    cloud.reload()
    assert.equal(cloud.getManifest().totalAssets, 7)
  })
})
