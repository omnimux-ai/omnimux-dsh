#!/usr/bin/env bash
# Shared, read-only source gate for every materialization entrypoint.
assert_omnimux_sync_main() (
  local root="$1" variable top branch dirty head upstream
  # An inherited Git worktree/index override must not attest another checkout.
  for variable in ${!GIT_@}; do unset "$variable"; done
  top=$(git -C "$root" rev-parse --show-toplevel 2>/dev/null) || {
    echo '❌ sync: 非 git 工作区，Git 源码身份无法证明。' >&2; return 1;
  }
  if [ "$(cd "$top" && pwd -P)" != "$(cd "$root" && pwd -P)" ]; then
    echo '❌ sync: 源目录必须是 Git 仓库根目录。' >&2; return 1
  fi
  # 主检出（非 linked worktree，.git 为目录）严格要求分支名必须为 main；
  # linked worktree（.git 为文件）不以分支名称代替已合并身份，放行精确对齐最新 origin/main 的干净树。
  if [ -d "$root/.git" ]; then
    branch=$(git -C "$root" symbolic-ref --quiet --short HEAD 2>/dev/null) || branch='detached'
    if [ "$branch" != 'main' ]; then
      echo "❌ sync: 当前分支是 [$branch]，物化只允许在已合并且对齐 origin/main 的 main 上执行。" >&2
      return 1
    fi
  fi
  dirty=$(git -C "$root" status --porcelain --untracked-files=all 2>/dev/null) || {
    echo '❌ sync: 无法读取工作区状态，拒绝物化。' >&2; return 1;
  }
  if [ -n "$dirty" ]; then
    echo '❌ sync: 工作区有未提交改动，拒绝物化。' >&2
    printf '%s\n' "$dirty" >&2
    return 1
  fi
  if git -C "$root" remote | grep -qx 'origin'; then
    git -C "$root" fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main' 2>/dev/null || {
      echo '❌ sync: 无法 fetch 最新 origin/main，拒绝物化。' >&2
      return 1
    }
  else
    echo '❌ sync: 无法 fetch 最新 origin/main，拒绝物化。' >&2
    return 1
  fi
  head=$(git -C "$root" rev-parse --verify 'HEAD^{commit}' 2>/dev/null) || return 1
  upstream=$(git -C "$root" rev-parse --verify 'refs/remotes/origin/main^{commit}' 2>/dev/null) || {
    echo '❌ sync: origin/main 不可用，拒绝物化。' >&2; return 1;
  }
  if [ "$head" != "$upstream" ]; then
    echo "❌ sync: HEAD [$head] 不等于最新 origin/main [$upstream]；领先、落后或未合并 tip 均禁止物化。" >&2
    echo "   请在 PR MERGED 后使用精确对齐最新 origin/main 的干净工作树。" >&2
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
