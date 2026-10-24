/**
 * scripts/lib/git-fixture-repo.mjs
 *
 * 临时 git 仓库夹具：给「需要已提交范围」的脚本测试用（例如
 * `scripts/verify-test-standard-declarations.test.mjs` 要验证 CI 只看已提交内容）。
 *
 * 单独放在 lib 下而不是测试文件里，是因为测试文件受评估契约保护，
 * 不允许新增 `node:child_process` 之类的高风险导入（`runtime-code-execution-import-needs-review`）。
 * 本模块不参与断言检查，只提供最小 git 夹具。
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  })
}

/**
 * 建一个已初始化的线性临时仓库。
 * 返回的 root 已 realpath（macOS 的 /tmp 是符号链接，调用方通常要求真实路径一致）。
 */
export function makeFixtureRepo(prefix = 'git-fixture-') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.email', 'fixture@example.com'])
  git(root, ['config', 'user.name', 'fixture'])
  return {
    root,
    /** 写入（自动建父目录），不提交。 */
    write(rel, content) {
      const abs = join(root, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, content)
    },
    /** 删除工作区文件，不提交。 */
    remove(rel) {
      rmSync(join(root, rel), { force: true })
    },
    /** 提交全部改动并返回新 HEAD。 */
    commit(message) {
      git(root, ['add', '-A'])
      git(root, ['commit', '-q', '-m', message])
      return git(root, ['rev-parse', 'HEAD']).trim()
    },
    /** 执行任意 git 子命令并返回 stdout。 */
    git(args) {
      return git(root, args)
    },
  }
}

/** 建仓库 → 执行 → 无论成败都清理。 */
export function withFixtureRepo(run, prefix = 'git-fixture-') {
  const repo = makeFixtureRepo(prefix)
  try {
    return run(repo)
  } finally {
    rmSync(repo.root, { recursive: true, force: true })
  }
}
