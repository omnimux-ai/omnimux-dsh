#!/usr/bin/env bash
# Shared target-home → profile resolver for sync-to-app.sh and sync-stable.sh.
# Every target home uses profiles/omnimux.

normalize_omnimux_sync_target() {
  local target="$1"
  case "$target" in
    /*|"~"|"~/"*)
      printf '%s\n' "$target"
      ;;
    *)
      printf '%s\n' "$target" | tr '[:upper:]' '[:lower:]' | xargs
      ;;
  esac
}

expand_omnimux_sync_target_home() {
  local target="$1"
  case "$target" in
    '~')
      printf '%s\n' "$HOME"
      ;;
    '~/'*)
      printf '%s/%s\n' "$HOME" "${target:2}"
      ;;
    /*)
      printf '%s\n' "$target"
      ;;
    *)
      echo "❌ sync target [$target] 必须是绝对路径或 ~/ 开头。" >&2
      return 1
      ;;
  esac
}

# Compare filesystem identity so aliases cannot turn a production write into
# development policy. Missing profile directories resolve through their parent.
resolve_omnimux_release_channel() {
  node - "$1" "$HOME/.omnimux/profiles/omnimux" <<'EOF'
const fs = require('node:fs')
const path = require('node:path')
function canonical(candidate) {
  const suffix = []
  for (;;) {
    try { return path.resolve(fs.realpathSync.native(candidate), ...suffix) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = path.dirname(candidate)
      if (parent === candidate) throw error
      suffix.unshift(path.basename(candidate))
      candidate = parent
    }
  }
}
const [target, production] = process.argv.slice(2)
process.stdout.write(canonical(target) === canonical(production) ? 'production\n' : 'development\n')
EOF
}

resolve_omnimux_profile_dir() {
  local home_dir="$1"
  printf '%s\n' "$home_dir/profiles/omnimux"
}
