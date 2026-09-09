#!/usr/bin/env bash
# Shared, read-only source gate for every materialization entrypoint.
assert_omnimux_sync_main() (
  local root="$1" variable top branch dirty head upstream
  # An inherited Git worktree/index override must not attest another checkout.
  for variable in ${!GIT_@}; do unset "$variable"; done
  top=$(git -C "$root" rev-parse --show-toplevel) || {
    echo '❌ sync: Git 工作区不可用，拒绝物化。' >&2; return 1;
  }
  if [ "$(cd "$top" && pwd -P)" != "$(cd "$root" && pwd -P)" ]; then
    echo '❌ sync: 源目录必须是 Git 仓库根目录。' >&2; return 1
  fi
  branch=$(git -C "$root" symbolic-ref --quiet --short HEAD) || branch='detached'
  if [ "$branch" != 'main' ]; then
    echo "❌ sync: 当前分支是 [$branch]，物化只允许在已合并且对齐 origin/main 的 main 上执行。" >&2
    return 1
  fi
  dirty=$(git -C "$root" status --porcelain --untracked-files=all) || return 1
  if [ -n "$dirty" ]; then
    echo '❌ sync: 工作区有未提交改动，拒绝物化。' >&2
    printf '%s\n' "$dirty" >&2
    return 1
  fi
  head=$(git -C "$root" rev-parse --verify 'HEAD^{commit}') || return 1
  upstream=$(git -C "$root" rev-parse --verify 'refs/remotes/origin/main^{commit}') || {
    echo '❌ sync: origin/main 不可用，拒绝物化。' >&2; return 1;
  }
  if [ "$head" != "$upstream" ]; then
    echo '❌ sync: HEAD 未对齐 origin/main；请等待 PR MERGED 并同步 main 后再物化。' >&2
    return 1
  fi
)

assert_omnimux_sync_plugins() {
  local root="$1" plugins="$2" expected actual
  expected="$(cd "$root" && pwd -P)/plugins"
  actual=$(cd "$plugins" && pwd -P) || return 1
  if [ "$actual" != "$expected" ]; then
    echo '❌ sync: 插件源必须是已对齐 main 的 ROOT/plugins，不允许覆盖为外部源码。' >&2
    return 1
  fi
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  assert_omnimux_sync_main "$1"
fi
