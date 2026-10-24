/**
 * 本地门禁的证据夹具注入（`pnpm test:gates` 通过 `--import` 加载）。
 *
 * CI 由 `.github/workflows/quality-gate.yml` 现场造一份合成 git 夹具，并把
 * `EVIDENCE_FIXTURE_REPO/ROOT/SHA` 写进 `$GITHUB_ENV`；本机没有等价步骤，于是
 * `evidence-contract.test.mjs` 与 `guard-quality-loop.test.mjs` 的夹具用例直接抛
 * `EVIDENCE_FIXTURE_ENV_REQUIRED`。
 *
 * 这里为每个测试进程造一份**等价**夹具（一个提交的合成 git 仓库，含 `.gitignore` 与
 * `source.txt`）并注入变量；CI 已注入时什么都不做，CI 行为完全不变。
 * 夹具只写临时目录，进程退出即删。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FIXTURE_VARS = ['EVIDENCE_FIXTURE_REPO', 'EVIDENCE_FIXTURE_ROOT', 'EVIDENCE_FIXTURE_SHA']

function alreadyProvided() {
  return FIXTURE_VARS.every(name => typeof process.env[name] === 'string' && process.env[name].length > 0)
}

function provisionFixture() {
  // 必须是规范化路径：macOS 上 tmpdir() 走 /var 软链，而用例会按 realpath 比对（CI 侧同样要求）。
  const fixture = mkdtempSync(join(realpathSync(tmpdir()), 'omnimux-evidence-fixture-'))
  const primary = join(fixture, 'primary')
  const gitEnv = {
    PATH: process.env.PATH,
    HOME: fixture,
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
  }
  const git = args => spawnSync('git', args, { encoding: 'utf8', env: gitEnv })
  const step = (args, label) => {
    const result = git(args)
    if (result.status !== 0) throw new Error(`evidence fixture ${label} failed: ${result.stderr || result.stdout}`)
    return result
  }
  mkdirSync(primary, { recursive: true })
  step(['init', '--template=', '-b', 'fixture-seed', primary], 'init')
  step(['-C', primary, 'config', 'core.autocrlf', 'false'], 'config')
  writeFileSync(join(primary, '.gitignore'), '.worktrees/\n.workbuddy/evidence/\n')
  writeFileSync(join(primary, 'source.txt'), 'synthetic public evidence source\n')
  step(['-C', primary, 'add', '--', '.gitignore', 'source.txt'], 'add')
  step(['-C', primary, '-c', 'user.name=EvidenceFixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture'], 'commit')
  const sha = step(['-C', primary, 'rev-parse', '--verify', 'HEAD^{commit}'], 'resolve').stdout.trim()
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`evidence fixture resolve produced an unexpected sha: ${sha}`)
  return { fixture, primary, sha }
}

if (!alreadyProvided()) {
  try {
    const { fixture, primary, sha } = provisionFixture()
    process.env.EVIDENCE_FIXTURE_REPO = primary
    process.env.EVIDENCE_FIXTURE_ROOT = primary
    process.env.EVIDENCE_FIXTURE_SHA = sha
    process.on('exit', () => {
      try {
        rmSync(fixture, { recursive: true, force: true })
      } catch (error) {
        process.stderr.write(`evidence fixture cleanup failed: ${error?.message ?? error}\n`)
      }
    })
  } catch (error) {
    // 造不出来时保持原样：用例会照旧报 EVIDENCE_FIXTURE_ENV_REQUIRED，并带上这里的原因。
    process.stderr.write(`${error?.message ?? error}\n`)
  }
}
