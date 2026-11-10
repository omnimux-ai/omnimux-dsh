/**
 * 工作树隔离索引工具（Issue #4068）。
 *
 * 前身是开发机家目录里的个人脚本：数据目录只按工作树文件夹名命名，两个仓的同名
 * 任务会共用一份索引 —— 后 init 的覆盖归属记录、先 remove 的删掉别人的索引。
 * 收进仓库时把命名、归属、回收边界都改成可测的纯函数，本文件锁这几条：
 * 1. 数据目录名由绝对路径哈希派生，同名不同路径不撞车；
 * 2. 归属不符或没有记录时，删除必须跳过（退出码 2 的语义由 CLI 承担）；
 * 3. 孤儿回收只在「记录路径不存在且仓根一致」时发生，跨仓/卷未挂载一律不动；
 * 4. 扩展名白名单与入库 `.sagignore` 托管块精确一致，且既有配置缺字段时响亮报错。
 */

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import {
  DEFAULT_TYPES,
  canonicalPath,
  configArgs,
  dataDir,
  dataDirName,
  dataRoot,
  orphanDecision,
  ownershipVerdict,
  parseTypes,
  readRecord,
  repoRootFromCommonDir,
  writeRecord,
} from './sag-worktree.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

describe('数据目录按路径唯一 (#4068)', () => {
  it('不同仓库下的同名工作树得到不同目录', () => {
    const a = dataDirName('/repo-a/.worktrees/task')
    const b = dataDirName('/repo-b/.worktrees/task')
    assert.notEqual(a, b, '同名不同路径必须区分，否则两份索引会互相覆盖')
    assert.match(a, /^task-[0-9a-f]{8}$/, '目录名应保留可读前缀并带路径哈希')
  })

  it('被删除的路径本身含软链成分时，哈希仍与真实路径一致', () => {
    // 关键：要删的那条路径必须**经过软链**。只建一个 link/ 但用 real/ 断言，
    // 在 Linux（/tmp 非软链）上新旧实现都稳定，等于假绿。
    const base = mkdtempSync(join(tmpdir(), 'sag-wt-link-'))
    try {
      mkdirSync(join(base, 'real', 'leaf'), { recursive: true })
      symlinkSync(join(base, 'real'), join(base, 'linked'))
      const viaSymlink = join(base, 'linked', 'leaf')
      const before = dataDirName(viaSymlink)
      assert.equal(dataDirName(join(base, 'real', 'leaf')), before, '软链路径与真实路径必须同哈希')
      rmSync(join(base, 'real', 'leaf'), { recursive: true, force: true })
      assert.equal(
        dataDirName(viaSymlink),
        before,
        '目录删除后仍必须算出同一哈希：否则 worktree.sh 先删目录再清理时永远删不到索引',
      )
    } finally { rmSync(base, { recursive: true, force: true }) }
  })

  it('dataRoot 尊重 SAG_WT_HOME 覆盖', () => {
    assert.equal(dataRoot({ SAG_WT_HOME: '/tmp/sag-wt-home' }), '/tmp/sag-wt-home')
    assert.match(dataRoot({}), /worktrees$/, '默认落在 SAG 桌面数据目录下的 worktrees')
  })
})

describe('归属判定 (#4068)', () => {
  it('记录一致才允许删除', () => {
    assert.equal(ownershipVerdict({ recorded: '/a/.worktrees/x', requested: '/a/.worktrees/x' }), 'match')
  })

  it('记录不一致或缺失都跳过', () => {
    assert.equal(ownershipVerdict({ recorded: '/a/.worktrees/x', requested: '/b/.worktrees/x' }), 'mismatch')
    assert.equal(ownershipVerdict({ recorded: null, requested: '/b/.worktrees/x' }), 'unrecorded')
  })
})

describe('孤儿回收边界 (#4068)', () => {
  const base = { recordedPath: '/repo/.worktrees/gone', recordedRepo: '/repo', currentRepo: '/repo' }

  it('工作树还在就不动', () => {
    assert.equal(orphanDecision({ ...base, pathExists: true }), 'keep')
  })

  it('同仓且路径确实消失才回收', () => {
    assert.equal(orphanDecision({ ...base, pathExists: false }), 'remove')
  })

  it('跨仓、无记录、或当前仓未知时一律不动（卷未挂载不得误删）', () => {
    assert.equal(orphanDecision({ ...base, currentRepo: '/other-repo', pathExists: false }), 'keep')
    assert.equal(orphanDecision({ ...base, recordedRepo: null, pathExists: false }), 'keep')
    assert.equal(orphanDecision({ ...base, currentRepo: null, pathExists: false }), 'keep')
    assert.equal(orphanDecision({ ...base, recordedPath: null, pathExists: false }), 'keep')
  })
})

describe('扩展名与配置 (#4068)', () => {
  it('parseTypes 去重、排序、容忍前导点与空值', () => {
    assert.deepEqual(parseTypes('ts,.js,ts, ,TSX'), ['js', 'ts', 'tsx'])
    assert.deepEqual(parseTypes(''), [...DEFAULT_TYPES], '空设置退回默认白名单')
  })

  it('默认白名单与入库 .sagignore 托管块精确一致', () => {
    const ignore = readFileSync(join(root, '.sagignore'), 'utf8')
    const match = ignore.match(/# SAG Wiki index options: begin\n# (\{.*\})\n# SAG Wiki index options: end/)
    assert.ok(match, '.sagignore 必须带托管块')
    assert.deepEqual(
      JSON.parse(match[1]).extensions,
      [...DEFAULT_TYPES].sort(),
      '工具默认值与入库托管块必须一致，否则每次 init 都会把已跟踪文件改脏',
    )
  })

  it('缺少 url 或 model 时响亮失败，不生成半套配置', () => {
    assert.throws(() => configArgs({ url: '', model: 'm' }), /cannot read Jev url\/model/)
    assert.throws(() => configArgs({ url: 'u', model: '' }), /cannot read Jev url\/model/)
    assert.deepEqual(configArgs({ url: 'u', model: 'm' }), ['config', '--url', 'u', '--model', 'm', '--key-stdin'])
  })
})

describe('归属记录往返 (#4068)', () => {
  it('写入后能读回规范路径', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sag-wt-record-'))
    try {
      writeRecord(join(dir, 'data'), join(dir, 'wt'), join(dir, 'repo'))
      const record = readRecord(join(dir, 'data'))
      assert.equal(record.path, canonicalPath(join(dir, 'wt')))
      assert.equal(record.repo, canonicalPath(join(dir, 'repo')))
      assert.equal(dataDir(join(dir, 'wt'), { SAG_WT_HOME: join(dir, 'home') }), join(dir, 'home', dataDirName(join(dir, 'wt'))))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('没有记录时返回空，不抛错', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sag-wt-empty-'))
    try {
      mkdirSync(join(dir, 'data'))
      writeFileSync(join(dir, 'data', 'worktree.path'), '\n')
      assert.deepEqual(readRecord(join(dir, 'data')), { path: null, repo: null })
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
