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
    // 锚点必须落在真正的 `git worktree prune` 命令行上：函数里还有一行
    // `say "git worktree prune"`，用裸子串锚定会在真命令被删掉时依然命中（恒绿）。
    const pruneCommand = /\n  git worktree prune\n/.exec(cmdPrune)
    assert.ok(pruneCommand, 'cmd_prune 必须真的执行 git worktree prune')
    const pruneGc = cmdPrune.indexOf('sag_collect_orphans')
    assert.ok(pruneCommand.index < pruneGc, 'prune 必须在删完记录之后回收孤儿索引')
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
    assert.match(sagForget, /echo "[^"]*SAG 索引清理失败[^"]*" >&2/, '清理失败必须在 stderr 留一行可诊断警告，不能静默吞掉，也不能只写 stdout（AC7）')
    assert.match(source, /\[ "\$\{OMNIMUX_SAG_GC:-0\}" = "1" \] \|\| return 0/, 'gc 必须由真实的条件判断挡住，而不是只在注释里提到开关（否则恒绿）')
    assert.match(sagGc, /echo "[^"]*SAG 孤儿索引回收失败[^"]*" >&2/, '回收失败同样要留一行 stderr 警告')
    for (const [name, body] of [['cmd_ship', cmdShip], ['cmd_remove', cmdRemove], ['clean_one', cleanOne]]) {
      assert.equal(/sag_forget_worktree "\$\{wt\}"\s*\|\|/.test(body), false, `${name} 不得把钩子接进失败短路`)
    }
  })

  it('缺工具时静默跳过，并支持整机关闭与自定义可执行文件', () => {
    assert.match(sagAvailable, /command -v "\$\{SAG_WORKTREE_BIN\}"/, '显式指定的可执行文件必须先探测是否存在')
    assert.match(sagAvailable, /OMNIMUX_SAG_INDEX:-1/, '必须提供 OMNIMUX_SAG_INDEX=0 整机关闭开关')
    // 解析顺序：显式指定 → 仓内实现 → PATH 里的旧脚本。仓内实现按路径哈希命名数据目录，
    // 默认依赖家目录脚本时，两个仓的同名任务会共用一份索引。
    const explicit = sagAvailable.indexOf('SAG_WORKTREE_BIN:-')
    const inRepo = sagAvailable.indexOf('scripts/sag-worktree.mjs')
    const onPath = sagAvailable.indexOf('command -v sag-worktree')
    assert.ok(explicit !== -1 && inRepo !== -1 && onPath !== -1, '三个来源都要出现在解析函数里')
    assert.ok(explicit < inRepo, '显式指定必须排在最前面')
    assert.ok(inRepo < onPath, '仓内实现必须优先于 PATH 里的家目录脚本')
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
    assert.deepEqual(
      options.extensions,
      ['css', 'go', 'html', 'js', 'json', 'jsx', 'md', 'mjs', 'sql', 'ts', 'tsx', 'yaml', 'yml'],
      '托管块必须与 sag-worktree 的 TYPES 精确一致：工具新增一个扩展名就会改写这个已跟踪文件，而 ship/remove 对脏工作树是 die，所以这里不允许超集',
    )
  })

  it('托管块其余字段与当前工具一致', () => {
    const match = sagignore.match(/# SAG Wiki index options: begin\n# (\{.*\})\n# SAG Wiki index options: end/)
    assert.ok(match, '必须带 SAG 托管块')
    const options = JSON.parse(match[1])
    assert.deepEqual(
      options.file_types,
      { markdown: true, text: true, code: false, config: false },
      'file_types 是 SAG 的内部分类位，被工具改写就会产生 diff；变了必须同步本断言而不是放着让 .sagignore 变脏',
    )
    assert.equal(options.convert_other_formats, false, 'convert_other_formats 同样必须与工具输出一致')
  })

  it('测试文件自身以换行结尾', () => {
    const self = readFileSync(join(here, 'worktree-sag-index.test.mjs'), 'utf8')
    assert.ok(self.endsWith('\n'), '本测试文件也要以换行结尾，别一边要求别人一边自己缺')
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
