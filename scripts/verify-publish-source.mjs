#!/usr/bin/env node
/**
 * scripts/verify-publish-source.mjs
 *
 * Refuses to publish a package whose bytes no commit can reproduce.
 *
 * Background: several packages were published with a version bumped only in the
 * working tree. npm then records a `gitHead`, but that commit still carries the
 * old version, so the published tarball cannot be rebuilt from it and nobody can
 * tell which release a checkout corresponds to.
 *
 * The check answers one question — would `npm pack` right now produce bytes that
 * some commit reproduces? — and fails when the answer is no:
 *
 *   1. every tracked file must be committed (an unstaged or staged edit means the
 *      published bytes exist only on this machine);
 *   2. for that package, the committed `version` must equal the working `version`
 *      (a bump that was never committed is the exact failure this exists for);
 *   3. a tracked file that is absent from the commit fails, because the tarball
 *      would then carry a file the commit does not have.
 *
 * Run it through `pnpm publish` (see each package's `prepublishOnly`). It reads
 * only git and the working tree, so it needs no network and no credentials.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/** Runs git in `cwd` and returns trimmed stdout. */
function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

/** True when `cwd` is inside a git work tree. */
export function isGitWorktree(cwd) {
  try {
    return git(cwd, ['rev-parse', '--is-inside-work-tree']) === 'true'
  } catch {
    return false
  }
}

/**
 * Paths under `packageDir` that differ from HEAD, including untracked ones.
 * @returns {string[]} repository-relative paths, sorted.
 */
export function uncommittedPaths(repoRoot, packageDir) {
  // realpath both sides: on macOS /tmp is a symlink to /private/tmp, and git
  // reports the resolved root while the caller may hold the unresolved path.
  const scope = relative(realpathSync(repoRoot), realpathSync(packageDir)) || '.'
  const split = (text) => text.split('\n').filter(Boolean)
  const changed = split(git(repoRoot, ['diff', '--name-only', 'HEAD', '--', scope]))
  const untracked = split(git(repoRoot, ['ls-files', '--others', '--exclude-standard', '--', scope]))
  // `diff` reports paths relative to the repository root, which is what callers
  // compare against; sort so the message reads the same on every run.
  return [...new Set([...changed, ...untracked])].sort()
}

/** The committed `version` for `relPath`, or null when the file is not in HEAD. */
export function committedVersion(repoRoot, relPath) {
  try {
    const raw = execFileSync('git', ['-C', repoRoot, 'show', `HEAD:${relPath}`], { encoding: 'utf8' })
    const value = JSON.parse(raw).version
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

/** The working-tree `version` for `packageDir`. */
export function workingVersion(packageDir) {
  try {
    const value = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')).version
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

/**
 * Decides whether publishing from `packageDir` would be reproducible.
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function verifyPublishSource(packageDir) {
  const dir = resolve(packageDir)
  const problems = []
  if (!isGitWorktree(dir)) {
    return { ok: false, problems: ['./ is not inside a git work tree, so provenance cannot be recorded'] }
  }
  const repoRoot = realpathSync(git(dir, ['rev-parse', '--show-toplevel']))
  const dirty = uncommittedPaths(repoRoot, dir)
  if (dirty.length > 0) {
    problems.push(`uncommitted changes would ship bytes no commit has: ${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? ` (+${dirty.length - 5} more)` : ''}`)
  }
  const rel = relative(repoRoot, realpathSync(dir))
  const manifest = rel ? `${rel}/package.json` : 'package.json'
  const committed = committedVersion(repoRoot, manifest)
  const working = workingVersion(dir)
  if (working === null) {
    problems.push('package.json has no readable version')
  } else if (committed === null) {
    problems.push(`${manifest} is not in HEAD`)
  } else if (committed !== working) {
    problems.push(`version ${working} is not committed (HEAD has ${committed}); commit the bump so the published tarball has a commit that reproduces it`)
  }
  return { ok: problems.length === 0, problems }
}

function main() {
  const packageDir = process.argv[2] ?? process.cwd()
  const { ok, problems } = verifyPublishSource(packageDir)
  if (ok) return
  console.error(`Refusing to publish ${packageDir}:`)
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('Commit the change (or revert it) and publish again.')
  process.exit(1)
}

if (process.argv[1] === new URL(import.meta.url).pathname) main()
