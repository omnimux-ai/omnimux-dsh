/**
 * SAG 语义索引随任务工作树生命周期收尾（Issue #4060）。
 *
 * 背景：SAG 的根是「父目录吸收子目录」，且以仓根为根扫描时会硬跳过点开头目录，
 * 所以 `.worktrees/<task>` 永远无法并入共享知识库（`.sagignore` 写 `!.worktrees/`
 * 也救不回来）。正确形态是每个工作树持有隔离的 SAG_DATA_DIR（由 `sag-worktree`
 * 管理），索引在第一次 search 时惰性建立。
 *
 * 本文件锁四件事：
 * 1. 工作树被 ship / remove / batch clean 删掉后，必须清掉它那份隔离索引；
 * 2. 收尾钩子全是 best-effort：不得 `die`、不得改退出码、缺工具时静默跳过；
 * 3. 脚本永不直接写共享知识库（不出现裸 `sag add` / `sag remove`），也不在建树时
 *    同步索引（否则建树要等几分钟）；
 * 4. 入库的 `.sagignore` 托管块可解析、含本仓需要的扩展名、且未排除源码目录。
 *
 * 这里刻意做成源码级断言：`guard-anti-cheat` 不允许新增测试文件引入
 * `node:child_process`，真实行为验证（桩 sag-worktree + 临时仓）在 PR 里以终端证据留档。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'worktree.sh'), 'utf8')
const sagignore = readFileSync(join(here, '..', '.sagignore'), 'utf8')

/** 截取某个顶层函数的函数体（到下一个顶层函数定义为止）。 */
function block(name, nextName) {
  const start = source.indexOf(`\n${name}() {`)
  assert.notEqual(start, -1, `必须能定位 ${name}`)
  const end = source.indexOf(`\n${nextName}() {`, start)
  assert.notEqual(end, -1, `必须能定位 ${nextName}`)
  assert.ok(end > start, `${name} 必须在 ${nextName} 之前`)
  return source.slice(start, end)
}

const sagAvailable = block('sag_available', 'sag_forget_worktree')
const sagForget = block('sag_forget_worktree', 'sag_collect_orphans')
const sagGc = block('sag_collect_orphans', 'audit_worktrees')
const cmdNew = block('cmd_new', 'cmd_auto_new')
const cmdShip = block('cmd_ship', 'cmd_remove')
const cmdRemove = block('cmd_remove', 'cmd_prune')
const cmdPrune = block('cmd_prune', 'cmd_clean')
const cmdClean = block('cmd_clean', 'clean_one')
const cleanOne = block('clean_one', 'usage')

describe('工作树删除时清理隔离索引 (#4060)', () => {
  it('ship 删除工作树之后清理该索引', () => {
    const removed = cmdShip.indexOf('git worktree remove --force "${wt}"')
    const forget = cmdShip.indexOf('sag_forget_worktree "${wt}"')
    assert.notEqual(removed, -1, 'ship 必须用 --force 删除工作树')
    assert.notEqual(forget, -1, 'ship 必须清理该工作树的隔离索引')
    assert.ok(removed < forget, '清理必须发生在工作树删除之后')
  })

  it('remove 与 batch clean 同样清理索引', () => {
    const removed = cmdRemove.indexOf('git worktree remove ${flags} "${wt}" 2>/dev/null || rm -rf "${wt}"')
    assert.notEqual(removed, -1, 'cmd_remove 必须真的删除工作树')
    assert.ok(removed < cmdRemove.indexOf('sag_forget_worktree "${wt}"'), 'cmd_remove 之后必须清理索引')
    const cleanRemoved = cleanOne.indexOf('git worktree remove "${wt}" 2>/dev/null || rm -rf "${wt}"')
    assert.notEqual(cleanRemoved, -1, 'clean_one 必须真的删除工作树')
    assert.ok(cleanRemoved < cleanOne.indexOf('sag_forget_worktree "${wt}"'), 'batch clean 之后必须清理索引')
  })

  it('prune 与 clean 结束时回收孤儿索引', () => {
    const pruneAt = cmdPrune.lastIndexOf('git worktree prune')
    const pruneGc = cmdPrune.indexOf('sag_collect_orphans')
    assert.notEqual(pruneAt, -1, 'prune 必须真的删记录')
    assert.ok(pruneAt < pruneGc, 'prune 必须在删完记录之后回收孤儿索引')
    const lastClean = cmdClean.lastIndexOf('clean_one "${wt}" "${branch}" "${merged}"')
    const cleanGc = cmdClean.indexOf('sag_collect_orphans')
    assert.notEqual(lastClean, -1, 'cmd_clean 必须真的调用 clean_one')
    assert.ok(
      lastClean < cleanGc,
      '孤儿回收必须在批量清理之后：提到循环之前会漏掉本轮刚删掉的工作树',
    )
  })
})

describe('钩子是 best-effort，且不写共享知识库 (#4060)', () => {
  it('收尾失败不影响交付', () => {
    for (const [name, body] of [['sag_available', sagAvailable], ['sag_forget_worktree', sagForget], ['sag_collect_orphans', sagGc]]) {
      assert.equal(/\bdie\b/.test(body), false, `${name} 不得调用 die（缺工具不能变成交付阻断）`)
      assert.equal(/^\s*exit [1-9]/m.test(body), false, `${name} 不得改退出码`)
    }
    for (const body of [sagForget, sagGc]) {
      assert.match(body, /return 0/, '每条分支都必须静默返回')
    }
    assert.match(sagForget, /SAG 索引清理失败/, '清理失败必须留一行可诊断警告，不能静默吞掉（AC7）')
    assert.match(sagGc, /OMNIMUX_SAG_GC/, 'gc 跨本机所有工作树且不可逆，必须显式开关才执行')
    for (const [name, body] of [['cmd_ship', cmdShip], ['cmd_remove', cmdRemove], ['clean_one', cleanOne]]) {
      assert.equal(/sag_forget_worktree "\$\{wt\}"\s*\|\|/.test(body), false, `${name} 不得把钩子接进失败短路`)
    }
  })

  it('缺工具时静默跳过，并支持整机关闭与自定义可执行文件', () => {
    assert.match(sagAvailable, /command -v "\$\{SAG_WORKTREE_BIN\}"/, '必须先探测 sag-worktree 是否存在')
    assert.match(sagAvailable, /OMNIMUX_SAG_INDEX:-1/, '必须提供 OMNIMUX_SAG_INDEX=0 整机关闭开关')
    assert.match(source, /SAG_WORKTREE_BIN:-sag-worktree/, '必须允许 SAG_WORKTREE_BIN 指定可执行文件')
  })

  it('永不直接写共享知识库，也不在建树时同步索引', () => {
    for (const forbidden of [/\bsag add\b/, /\bsag remove\b/, /\$\{SAG_WORKTREE_BIN\}" add\b/]) {
      assert.equal(forbidden.test(source), false, `不得直接操作共享知识库：${forbidden}`)
    }
    assert.equal(
      /sag_(?:index|forget)_worktree|sag_collect_orphans/.test(cmdNew),
      false,
      '建树不得同步建立索引（近八千个文件会卡住建树）；索引由 sag-worktree search 惰性建立',
    )
  })
})

describe('.sagignore 纳入版本库 (#4060)', () => {
  it('带 SAG 托管块且扩展名覆盖本仓代码类型', () => {
    const match = sagignore.match(/# SAG Wiki index options: begin\n# (\{.*\})\n# SAG Wiki index options: end/)
    assert.ok(match, '.sagignore 必须带 SAG 托管块（缺它时索引会退回只收文档）')
    const options = JSON.parse(match[1])
    const extensions = new Set(options.extensions)
    for (const required of ['md', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'yml', 'yaml']) {
      assert.ok(extensions.has(required), `托管块必须包含 ${required}，否则这类文件不可检索`)
    }
    assert.deepEqual(
      options.extensions,
      [...options.extensions].sort(),
      '扩展名必须排序：重复索引同目录才能字节稳定、不把已跟踪文件改脏',
    )
  })

  it('托管块以换行结尾', () => {
    assert.ok(sagignore.endsWith('\n'), '.sagignore 必须以换行结尾：按行重写托管块的工具有一天会回来咬你（末尾缺换行会留单字节 diff，而 ship/remove 对脏工作树是 die）')
  })

  it('排除证据与生成物，但不排除源码目录', () => {
    const rules = sagignore
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
    for (const path of ['docs/evidence/', 'qa-evidence/', 'deliverables/', 'artifacts/', 'tests/e2e/*-evidence/', '**/.browser-scratch/', 'archive/']) {
      assert.ok(rules.includes(path), `必须排除低价值证据目录：${path}`)
    }
    for (const keep of ['plugins', 'packages', 'scripts', 'specs', 'docs']) {
      assert.equal(
        rules.some((rule) => rule === `${keep}/` || rule === `${keep}/*` || rule === `!${keep}/`),
        false,
        `不得排除源码目录：${keep}`,
      )
    }
  })
})