import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function copySyncScripts(root) {
  const here = dirname(fileURLToPath(import.meta.url))
  mkdirSync(join(root, 'scripts'), { recursive: true })
  for (const name of ['sync-stable.sh', 'sync-to-app.sh', 'sync-main.sh', 'resolve-omnimux-profile.sh', 'plugin-lifecycle.mjs', 'managed-tarball-archive.py']) {
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
  'status --porcelain --untracked-files=all') ;;
  'rev-parse --verify HEAD^{commit}'|'rev-parse --verify refs/remotes/origin/main^{commit}') echo 1111111111111111111111111111111111111111 ;;
  *) echo "Unexpected fixture git call: $*" >&2; exit 92 ;;
esac
`)
  chmodSync(executable, 0o755)
  return `${bin}:${inheritedPath}`
}
