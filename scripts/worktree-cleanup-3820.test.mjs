/**
 * worktree 交付清理与巡检（Issue #3820）。
 *
 * 背景：规格草稿按契约留在任务 worktree、不进提交，所以交付时 worktree 必然
 * 是脏的；`git worktree remove` 会以 "contains modified or untracked files"
 * 直接拒绝，旧写法只靠 `|| rm -rf` 兜底，一旦没跑 ship 就永久堆积。
 *
 * 本文件锁三件事：
 * 1. ship 的删除路径必须是 `git worktree remove --force`；
 * 2. 删除前必须先调 `archive_worktree_evidence`，且归档只取本任务 spec；
 * 3. `worktree.sh audit` 只在 ahead=0 时判「可清理」，且不判当前所在 worktree。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const scriptPath = join(here, 'worktree.sh')
const source = readFileSync(scriptPath, 'utf8')

describe('worktree.sh ship 清理路径 (#3820)', () => {
  it('删除前调用归档，再 force 删除', () => {
    const archiveAt = source.indexOf('archive_worktree_evidence "${wt}" "${task}"')
    const forceAt = source.indexOf('git worktree remove --force "${wt}"')
    assert.notEqual(archiveAt, -1, 'ship 必须在删除前调用 archive_worktree_evidence')
    assert.notEqual(forceAt, -1, 'ship 必须用 git worktree remove --force 删除')
    assert.ok(archiveAt < forceAt, '归档必须先于 force 删除执行')
  })

  it('ship 路径不再使用无 --force 的普通删除', () => {
    // cmd_remove 的 `--discard` 与 cmd_clean 的「跳过脏工作区」是故意保守的设计，
    // 不在此约束范围；只锁 ship 的交付收尾路径。
    const shipStart = source.indexOf('cmd_ship()')
    const removeStart = source.indexOf('cmd_remove()')
    assert.ok(shipStart > 0 && removeStart > shipStart, '必须能定位 cmd_ship 函数体')
    const shipBlock = source.slice(shipStart, removeStart)
    assert.equal(
      /git worktree remove "\$\{wt\}" 2>\/dev\/null/.test(shipBlock),
      false,
      'ship 不得用普通 git worktree remove（遇脏工作区必然失败）',
    )
    assert.match(shipBlock, /git worktree remove --force "\$\{wt\}"/, 'ship 必须用 --force 删除')
  })

  it('归档只取本任务未跟踪的 specs，不整目录复制', () => {
    assert.match(source, /grep -E '\^specs\/\.\*\\\.md\$'/, '归档必须按 specs/*.md 过滤未跟踪项')
    assert.doesNotMatch(source, /cp -r[^\n]*specs/, '不得整目录复制 specs（会带进全量仓库 specs）')
  })
})

describe('worktree.sh audit 判定 (#3820)', () => {
  it('注册了 audit 子命令', () => {
    assert.match(source, /^\s*audit\)\s+audit_worktrees/m, 'dispatcher 必须注册 audit')
    assert.match(source, /worktree\.sh audit/, 'usage 必须列出 audit')
  })

  it('只按 ahead=0 判可清理，ahead>0 一律保留', () => {
    assert.match(source, /rev-list --count "\$\{remote_branch\}\.\.\$\{branch\}"/, '必须用 rev-list 计数判 ahead')
    assert.match(source, /\[ "\$\{ahead\}" = "0" \]/, '可清理必须要求 ahead=0')
    assert.match(source, /保留：ahead=/, 'ahead>0 必须标为保留')
  })

  it('不把当前所在 worktree 判成可清理', () => {
    assert.match(source, /这是当前所在 worktree/, '必须显式保护当前所在 worktree')
  })

  it('扫描主检出的 .worktrees 而非当前 worktree 自己的', () => {
    assert.match(source, /PRIMARY_WT_DIR/, '必须解析主检出 .worktrees 目录')
    assert.match(source, /for wt in "\$\{PRIMARY_WT_DIR\}"/, '巡检必须遍历主检出 .worktrees')
  })
})
