import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Plugin ids a full `sync-stable.sh` run materializes, read from its
 * `ALL_PLUGINS=(...)` array so fixtures cannot drift from the script.
 * @returns {string[]}
 */
export function syncStablePluginIds() {
  const here = dirname(fileURLToPath(import.meta.url))
  const source = readFileSync(join(here, 'sync-stable.sh'), 'utf8')
  const match = /^ALL_PLUGINS=\(([^)]*)\)/m.exec(source)
  if (!match) throw new Error('sync-stable.sh: ALL_PLUGINS=(...) not found')
  return match[1].trim().split(/\s+/)
}

/**
 * Sync scripts install profile dependencies through `corepack pnpm`. Fail with
 * an actionable message instead of a dozen opaque "corepack: command not
 * found" assertion failures when the shell's node has no corepack shim.
 */
export function assertCorepackOnPath() {
  const probe = spawnSync('corepack', ['--version'], { encoding: 'utf8' })
  if (probe.status !== 0) {
    throw new Error(
      'corepack is not on PATH (`' + (probe.error?.message || probe.stderr || 'no output').trim() + '`). '
      + 'Sync tests run `corepack pnpm`; put a Node install that ships corepack (e.g. nvm) first on PATH, '
      + 'or run `corepack enable`. See docs/contracts/plugin-qa.md#本机门禁前置条件.',
    )
  }
}

export function copySyncScripts(root) {
  const here = dirname(fileURLToPath(import.meta.url))
  mkdirSync(join(root, 'scripts'), { recursive: true })
  for (const name of ['sync-stable.sh', 'sync-to-app.sh', 'sync-main.sh', 'resolve-omnimux-profile.sh', 'plugin-lifecycle.mjs', 'managed-tarball-archive.py', 'verify-profile-preflight.mjs']) {
    copyFileSync(join(here, name), join(root, 'scripts', name))
  }
  mkdirSync(join(root, 'plugins/omnimux/src'), { recursive: true })
  copyFileSync(join(here, '../plugins/omnimux/src/plugin-lifecycle.json'), join(root, 'plugins/omnimux/src/plugin-lifecycle.json'))
}

/** Mock only Git's read boundary; production scripts have no fixture switch. */
export function fakeGitPath(directory, root, inheritedPath = process.env.PATH) {
  const bin = join(directory, 'git-boundary')
  mkdirSync(bin, { recursive: true })
  const executable = join(bin, 'git')
  writeFileSync(executable, `#!/bin/bash
set -eu
[ "$1" = '-C' ] && [ "$2" = ${JSON.stringify(root)} ] || exit 91
shift 2
case "$*" in
  'rev-parse --show-toplevel') printf '%s\\n' ${JSON.stringify(root)} ;;
  'symbolic-ref --quiet --short HEAD') echo main ;;
  'status --porcelain --untracked-files=no') ;;
  'ls-files --others --exclude-standard') ;;
  'remote') echo origin ;;
  'fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main') ;;
  'rev-parse --verify HEAD^{commit}'|'rev-parse --verify refs/remotes/origin/main^{commit}') echo 1111111111111111111111111111111111111111 ;;
  *) echo "Unexpected fixture git call: $*" >&2; exit 92 ;;
esac
`)
  chmodSync(executable, 0o755)
  return `${bin}:${inheritedPath}`
}
