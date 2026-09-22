#!/usr/bin/env bash
# ==============================================================================
# worktree.sh — Universal Git worktree lifecycle management tool.
# Enhanced for OmniMux DSH Plugin & Multi-Agent Collaboration.
#
# Implements standardized worktree contracts:
#   1. Primary checkout stays clean on default branch (main/master/omnimux).
#   2. Task work lives strictly in <repo>/.worktrees/<task>.
#   3. Remove task worktrees only after merge and applicable acceptance, or abandon.
#   4. Worktrees MUST NOT be created as repository siblings or long-lived in /tmp.
#   5. Task naming strictly conforms to ASCII kebab-case (^[a-z0-9][a-z0-9-]*$).
#
# Enhanced Features:
#   - Full worktree-ops compatibility (init, new, list, ship, remove, clean, prune).
#   - GitHub Issue & PR integration (--issue <id>, --pr <number>, auto-new <id>).
#   - Safe PR-First guard (verifies PR MERGED before destruction).
#   - Backward-compatible detection for legacy sibling worktrees (../*-wt-*).
# ==============================================================================

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "${ROOT}" ]; then
  echo "worktree.sh: not inside a git work tree" >&2
  exit 2
fi

WT_DIR="${ROOT}/.worktrees"
TASK_RE='^[a-z0-9][a-z0-9-]*$'

die() { echo "worktree.sh: ❌ $*" >&2; exit 1; }
say() { echo "==> $*"; }

# -----------------------------------------------------------------------------
# Remote & Branch Detection
# -----------------------------------------------------------------------------

detect_remote() {
  if [ -n "${WORKTREE_REMOTE:-}" ]; then
    echo "${WORKTREE_REMOTE}"
    return 0
  fi
  # Priority: origin (standard), then fork (if present)
  if git remote 2>/dev/null | grep -qx "origin"; then
    echo "origin"
    return 0
  fi
  if git remote 2>/dev/null | grep -qx "fork"; then
    echo "fork"
    return 0
  fi
  local first_remote
  first_remote="$(git remote 2>/dev/null | head -n 1 || true)"
  if [ -n "${first_remote}" ]; then
    echo "${first_remote}"
    return 0
  fi
  echo "origin"
}

REMOTE="$(detect_remote)"

detect_default_branch() {
  if [ -n "${WORKTREE_DEFAULT_BRANCH:-}" ]; then
    echo "${WORKTREE_DEFAULT_BRANCH}"
    return 0
  fi

  local current_branch
  current_branch="$(git -C "${ROOT}" symbolic-ref --short HEAD 2>/dev/null || true)"

  # 1. Detect symbolic ref of remote HEAD
  local remote_head
  remote_head="$(git symbolic-ref --short "refs/remotes/${REMOTE}/HEAD" 2>/dev/null || true)"
  if [ -n "${remote_head}" ]; then
    local target="${remote_head#"${REMOTE}/"}"
    if [ -n "${target}" ]; then
      echo "${target}"
      return 0
    fi
  fi

  # 2. Common branches: main -> master -> omnimux
  for b in "main" "master" "omnimux"; do
    if [ "${current_branch}" = "${b}" ] || \
       git show-ref --verify --quiet "refs/heads/${b}" || \
       git show-ref --verify --quiet "refs/remotes/${REMOTE}/${b}"; then
      echo "${b}"
      return 0
    fi
  done

  echo "main"
}

DEFAULT_BRANCH="$(detect_default_branch)"

# -----------------------------------------------------------------------------
# Input Validation & Resolvers
# -----------------------------------------------------------------------------

validate_task() {
  local task="$1"
  if [ -z "${task}" ]; then
    die "missing <task> (kebab-case, e.g. fix-node-runtime)"
  fi
  case "${task}" in
    main | master | omnimux | origin | fork | upstream | "${REMOTE}" | feat | fix | chore | agent | codex | merge | .git | .worktrees)
      die "reserved name: ${task}" ;;
  esac
  if ! printf '%s' "${task}" | grep -Eq "${TASK_RE}"; then
    die "task must be ASCII kebab-case (^[a-z0-9][a-z0-9-]*$): ${task}"
  fi
  if [ "${#task}" -gt 60 ]; then
    die "task too long (max 60 chars): ${task}"
  fi
}

resolve_worktree_dir() {
  local task="$1"
  # 1. Canonical path: inside .worktrees/
  if [ -d "${WT_DIR}/${task}" ]; then
    echo "${WT_DIR}/${task}"
    return 0
  fi

  # 2. Backward compatibility: check legacy sibling directories
  local parent_dir="$(cd "${ROOT}/.." && pwd)"
  local sibling_dir="${parent_dir}/$(basename "${ROOT}")-wt-${task}"
  if [ -d "${sibling_dir}" ]; then
    echo "${sibling_dir}"
    return 0
  fi

  # 3. Fuzzy prefix match in sibling directories
  local matched
  matched=$(ls -d "${parent_dir}/$(basename "${ROOT}")-wt-${task}"* 2>/dev/null | head -n 1 || true)
  if [ -n "${matched}" ] && [ -d "${matched}" ]; then
    echo "${matched}"
    return 0
  fi

  # Fallback to standard path
  echo "${WT_DIR}/${task}"
}

# -----------------------------------------------------------------------------
# Commands
# -----------------------------------------------------------------------------

cmd_init() {
  say "initializing worktree infrastructure in ${ROOT}"
  mkdir -p "${WT_DIR}"
  local gi="${ROOT}/.gitignore"
  local git_common_dir
  git_common_dir="$(git rev-parse --git-common-dir 2>/dev/null || echo "${ROOT}/.git")"
  case "${git_common_dir}" in
    /*) ;;
    *) git_common_dir="${ROOT}/${git_common_dir}" ;;
  esac
  local exclude="${git_common_dir}/info/exclude"

  # Ensure .worktrees/ is in .gitignore
  if [ ! -f "${gi}" ]; then
    echo ".worktrees/" > "${gi}"
    say "created .gitignore with .worktrees/"
  elif ! grep -q "^\.worktrees/\{0,1\}$" "${gi}" 2>/dev/null; then
    printf '\n# Git worktrees isolation directory\n.worktrees/\n' >> "${gi}"
    say "appended .worktrees/ to .gitignore"
  else
    say ".gitignore already ignores .worktrees/"
  fi

  # Defensive: ensure in .git/info/exclude
  if [ -f "${exclude}" ]; then
    if ! grep -q "^\.worktrees/\{0,1\}$" "${exclude}" 2>/dev/null; then
      printf '\n.worktrees/\n' >> "${exclude}"
    fi
    if ! grep -q "^node_modules/\{0,1\}$" "${exclude}" 2>/dev/null; then
      printf '\nnode_modules\n' >> "${exclude}"
    fi
  fi

  echo "✓ Initialization complete. Default remote: ${REMOTE}, default branch: ${DEFAULT_BRANCH}"
}

print_wt() {
  local wt="$1" branch="$2" rel dirty
  case "${wt}" in
    "${ROOT}") rel="(primary)" ;;
    "${ROOT}"/*) rel="${wt#${ROOT}/}" ;;
    *) rel="${wt} (legacy sibling)" ;;
  esac
  if [ -d "${wt}" ]; then
    dirty="$(git -C "${wt}" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  else
    dirty="missing"
  fi
  printf '  %-52s %-45s dirty:%s\n' "${rel}" "${branch}" "${dirty}"
}

cmd_new() {
  local task="" base="" btype="feat" issue_id=""
  
  while [ $# -gt 0 ]; do
    case "$1" in
      --type)
        shift
        [ $# -gt 0 ] || die "missing argument for --type (feat|fix|chore|agent)"
        btype="$1"
        ;;
      --issue)
        shift
        [ $# -gt 0 ] || die "missing argument for --issue"
        issue_id="$1"
        ;;
      *)
        if [ -z "${task}" ]; then
          task="$1"
        else
          base="$1"
        fi
        ;;
    esac
    shift
  done

  if [ -z "${task}" ] && [ -n "${issue_id}" ]; then
    task="issue-${issue_id}"
  fi

  validate_task "${task}"

  if ! printf '%s' "${btype}" | grep -Eq '^[a-z0-9_-]+$'; then
    die "invalid branch type: ${btype}"
  fi

  if [ -z "${base}" ]; then
    base="${REMOTE}/${DEFAULT_BRANCH}"
  fi

  local branch="${btype}/${task}"
  if [ -n "${issue_id}" ] && [[ "${task}" != *"issue-"* ]]; then
    branch="${btype}/${task}-issue-${issue_id}"
  fi

  local wt="${WT_DIR}/${task}"

  [ -e "${wt}" ] && die "worktree already exists: ${wt#${ROOT}/}"
  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    die "branch already exists: ${branch}"
  fi

  cmd_init >/dev/null 2>&1 || true

  say "fetch ${REMOTE} (refresh tracking refs)"
  git fetch "${REMOTE}" --prune 2>/dev/null || say "warning: git fetch ${REMOTE} failed, using local refs"

  if ! git rev-parse --verify --quiet "${base}^{commit}" >/dev/null 2>&1; then
    if git rev-parse --verify --quiet "${DEFAULT_BRANCH}^{commit}" >/dev/null 2>&1; then
      say "base ref '${base}' not found, falling back to local '${DEFAULT_BRANCH}'"
      base="${DEFAULT_BRANCH}"
    else
      die "unknown base ref: ${base}"
    fi
  fi

  say "creating worktree in .worktrees/${task} based on ${base}"
  git worktree add -b "${branch}" "${wt}" "${base}" || die "git worktree add failed"

  echo
  echo "✅ Worktree Created Successfully:"
  echo "    Path:   ${wt#${ROOT}/}"
  echo "    Branch: ${branch}"
  echo "    Base:   ${base}"
  echo "    Next:   cd ${wt#${ROOT}/}"
}

cmd_auto_new() {
  local issue_id="${1:-}"
  [ -n "${issue_id}" ] || die "usage: worktree.sh auto-new <issue_id>"

  command -v gh >/dev/null 2>&1 || die "gh CLI is required for auto-new"

  say "fetching issue #${issue_id} metadata via gh..."
  local issue_json
  issue_json=$(gh issue view "${issue_id}" --json title,labels 2>/dev/null) || die "failed to fetch issue #${issue_id}"

  local title
  title=$(echo "${issue_json}" | python3 -c "import sys, json; print(json.load(sys.stdin).get('title', ''))" 2>/dev/null || true)
  
  # Extract clean topic from title
  local topic
  topic=$(echo "${title}" | sed -E 's/^[a-zA-Z]+(\([^)]+\))?:[[:space:]]*//' | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed -E 's/^-+|-+$//g' | cut -c 1-35)
  [ -n "${topic}" ] || topic="task"

  local btype="agent"
  if echo "${title}" | grep -qiE "^fix"; then
    btype="fix"
  elif echo "${title}" | grep -qiE "^feat"; then
    btype="feat"
  elif echo "${title}" | grep -qiE "^docs"; then
    btype="chore"
  fi

  local full_task="${topic}-${issue_id}"
  cmd_new "${full_task}" --type "${btype}" --issue "${issue_id}"
}

cmd_list() {
  echo "== Active Worktrees in $(basename "${ROOT}") (Standard: <repo>/.worktrees/<task>) =="
  echo
  local wt="" branch=""
  while IFS= read -r line; do
    case "${line}" in
      worktree*)
        if [ -n "${wt}" ]; then print_wt "${wt}" "${branch}"; fi
        wt="${line#worktree }"
        branch=""
        ;;
      branch*)
        branch="${line#branch refs/heads/}"
        ;;
      detached)
        branch="(detached)"
        ;;
    esac
  done < <(git worktree list --porcelain)
  if [ -n "${wt}" ]; then print_wt "${wt}" "${branch}"; fi
  echo
}

# ---------------------------------------------------------------------------
# 自动物化与实机热重载辅助函数（Post-Merge Auto-Materialize & Live Reload）
# 合并一旦确认，改到已安装插件的提交必须装进开发版。两条收尾都走这里：
# ship 在快进之后，remove 在删除之后（正式版本已拉齐时也要补上这一次）。
# ---------------------------------------------------------------------------

# 开发版里这个插件是否已经包含给定范围的最终内容。
# 范围可能跨过多次提交：必须拿目标提交的每个改动文件去比，不能只看最新一次。
# 列不出文件、对不上内容，都算未一致，交给安装。一致才跳过。
dev_plugin_matches_range() {
  local plugin="$1" base_ref="$2" target_ref="$3"
  local dev_root="${OMNIMUX_DEV_SNAPSHOT:-${HOME}/.omnimux-dev/profiles/omnimux/.materialize-snapshots/plugins/${plugin}}"
  [ -d "${dev_root}" ] || return 1
  # 逐次提交看，不能只看两端净差：同一范围里删了又加回来的文件，
  # 净差是空的，开发版却还留着旧内容。
  local commits
  commits="$(git -C "${ROOT}" rev-list --reverse "${base_ref}..${target_ref}" 2>/dev/null || true)"
  [ -n "${commits}" ] || return 1
  local commit status path old_path src dest touched=0
  while IFS= read -r commit; do
    [ -n "${commit}" ] || continue
    local changes
    changes="$(git -C "${ROOT}" diff-tree --no-commit-id --name-status --find-renames -r -m --first-parent "${commit}" -- "plugins/${plugin}" 2>/dev/null || true)"
    [ -n "${changes}" ] || continue
    while IFS=$'\t' read -r status path old_path; do
      [ -n "${status}" ] || continue
      touched=1
      case "${status}" in
        R[0-9]*|C[0-9]*) ;;
        *) old_path="" ;;
      esac
      [ -n "${path}" ] || return 1
      src="${path#plugins/${plugin}/}"
      dest="${dev_root}/${src}"
      if git -C "${ROOT}" cat-file -e "${target_ref}:${path}" 2>/dev/null; then
        [ -f "${dest}" ] || return 1
        git -C "${ROOT}" show "${target_ref}:${path}" 2>/dev/null | cmp -s - "${dest}" || return 1
      else
        # 目标提交里已删除的文件，开发版里也不该还在。
        [ -e "${dest}" ] && return 1
      fi
      case "${status}" in
        R[0-9]*|C[0-9]*)
          [ -n "${old_path}" ] || return 1
          [ -e "${dev_root}/${old_path#plugins/${plugin}/}" ] && return 1
          ;;
      esac
    done <<< "${changes}"
  done <<< "${commits}"
  [ "${touched}" -eq 1 ] || return 1
  return 0
}

auto_materialize_and_reload() {
  local base_ref="${1:-HEAD~1}"
  local target_ref="${2:-HEAD}"

  if [ ! -f "${ROOT}/scripts/sync-to-app.sh" ]; then
    say "⚠️ 缺少安装脚本，开发版未更新。请在主检出运行: ./scripts/sync-to-app.sh"
    return 0
  fi

  # 只认插件目录。文档、流程、脚本、测试夹具不进开发版。
  # 逐次提交收集：同一范围里先改后还原的文件，两端净差是空的，不能因此跳过。
  local changed_paths changed_plugins=() pending=()
  changed_paths="$(git -C "${ROOT}" log --name-only --pretty=format: "${base_ref}..${target_ref}" -- plugins 2>/dev/null | grep -E '^plugins/' | sort -u || true)"
  while IFS= read -r p; do
    [ -n "${p}" ] && changed_plugins+=("${p}")
  done < <(printf '%s\n' "${changed_paths}" | cut -d'/' -f2 | sort -u)

  if [ "${#changed_plugins[@]}" -eq 0 ]; then
    say "ℹ️ 本次合入未包含 plugins/ 插件源码变更，无需物化。"
    return 0
  fi

  # 开发版已经包含整段范围的插件不再装第二遍。
  local plugin
  for plugin in "${changed_plugins[@]}"; do
    if dev_plugin_matches_range "${plugin}" "${base_ref}" "${target_ref}"; then
      say "ℹ️ ${plugin} 已包含 ${base_ref}..${target_ref}，跳过重复安装。"
    else
      pending+=("${plugin}")
    fi
  done
  if [ "${#pending[@]}" -eq 0 ]; then
    say "✅ 开发版已包含本次合入，无需重复安装。"
    return 0
  fi
  changed_plugins=("${pending[@]}")

  # Client 产物由 Web 服务按请求从磁盘读取，刷新页面即取得新版；其余插件文件（宿主路由、
  # 清单、构建期入口）只有宿主进程重新加载后才生效，必须走受控重启，否则会留下新旧混装。
  local needs_restart=0
  if printf '%s\n' "${changed_paths}" | grep -qvE '^plugins/[^/]+/src/client/'; then
    needs_restart=1
  fi

  say "🔄 自动物化：合并已确认，变更插件 [${changed_plugins[*]}] 开始装进开发版 (~/.omnimux-dev)，不写正式版..."
  if (cd "${ROOT}" && bash "${ROOT}/scripts/sync-to-app.sh" "${changed_plugins[@]}"); then
    say "✅ 增量物化成功！"
    # 自动探测 Dev App：宿主侧变更受控重启，纯 Client 变更刷新页面
    if [ -f "${ROOT}/scripts/reload-dev-app.mjs" ]; then
      if [ "${needs_restart}" -eq 1 ]; then
        node "${ROOT}/scripts/reload-dev-app.mjs" --restart 2>/dev/null || true
      else
        node "${ROOT}/scripts/reload-dev-app.mjs" 2>/dev/null || true
      fi
    fi
  else
    say "⚠️ 自动物化未成功，请手动在主检出运行: ./scripts/sync-to-app.sh ${changed_plugins[*]}"
  fi
}

cmd_ship() {
  local task="$1"
  shift || true
  local pr_number=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --pr) shift; pr_number="${1:-}" ;;
      *) die "unknown flag: $1" ;;
    esac
    shift
  done
  [[ "${pr_number}" =~ ^[0-9]+$ ]] || die "ship requires --pr <merged-pr-number>; merge through GitHub Merge Queue first"
  command -v gh >/dev/null 2>&1 || die "gh is required to verify the merged PR"

  local wt
  wt="$(resolve_worktree_dir "${task}")"
  [ -d "${wt}" ] || die "no worktree found for task: ${task}"

  local branch
  branch="$(git -C "${wt}" symbolic-ref --short HEAD 2>/dev/null || true)"
  [ -n "${branch}" ] || die "worktree is in detached HEAD state; cannot ship automatically"

  if [ -n "$(git -C "${wt}" status --porcelain 2>/dev/null)" ]; then
    die "worktree has uncommitted changes; commit or stash them first"
  fi

  # Primary checkout check
  local primary_branch
  primary_branch="$(git -C "${ROOT}" symbolic-ref --short HEAD 2>/dev/null || true)"
  if [ "${primary_branch}" != "${DEFAULT_BRANCH}" ]; then
    die "primary checkout is not on default branch (${DEFAULT_BRANCH}); got: ${primary_branch}"
  fi
  if [ -n "$(git -C "${ROOT}" diff --name-only)" ] || [ -n "$(git -C "${ROOT}" diff --cached --name-only)" ]; then
    die "primary checkout has tracked uncommitted changes; stash them before shipping"
  fi

  say "verifying GitHub PR #${pr_number} merge state and task revision..."
  local pr_info pr_state pr_branch pr_head pr_base
  pr_info=$(gh pr view "${pr_number}" --json state,headRefName,headRefOid,baseRefName \
    -q '[.state, .headRefName, .headRefOid, .baseRefName] | @tsv') || die "cannot read PR #${pr_number}"
  IFS=$'\t' read -r pr_state pr_branch pr_head pr_base <<< "${pr_info}"
  [ "${pr_state}" = "MERGED" ] || die "PR #${pr_number} is [${pr_state}], not MERGED"
  [ "${pr_branch}" = "${branch}" ] && [ "${pr_head}" = "$(git -C "${wt}" rev-parse HEAD)" ] \
    && [ "${pr_base}" = "${DEFAULT_BRANCH}" ] || die "PR #${pr_number} does not match this task branch, HEAD and base"
  git -C "${ROOT}" pull --ff-only "${REMOTE}" "${DEFAULT_BRANCH}"

  # 自动物化与桌面 Dev 应用热重载闭环
  auto_materialize_and_reload "HEAD~1" "HEAD"

  say "PR MERGED; applicable Dev materialization auto-completed, human acceptance is pending. Worktree retained: ${wt}"
  say "After acceptance, run: worktree.sh remove ${task} --pr ${pr_number}"
}

cmd_remove() {
  local task="$1"
  shift || true
  local discard=0 abandon=0 pr_number="" force=0 flags=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --discard) discard=1 ;;
      --abandon) abandon=1 ;;
      --force) force=1; discard=1; abandon=1 ;;
      --pr) shift; pr_number="${1:-}" ;;
      *) die "unknown flag: $1" ;;
    esac
    shift
  done

  local wt
  wt="$(resolve_worktree_dir "${task}")"
  [ -d "${wt}" ] || die "no worktree found for task: ${task}"

  local branch
  branch="$(git -C "${wt}" symbolic-ref --short HEAD 2>/dev/null || true)"

  # PR guard check if specified
  if [ -n "${pr_number}" ] && command -v gh >/dev/null 2>&1 && [ "${force}" -ne 1 ]; then
    say "verifying PR #${pr_number} merge state..."
    local pr_state
    pr_state=$(gh pr view "${pr_number}" --json state -q '.state' 2>/dev/null || true)
    if [ "${pr_state}" != "MERGED" ]; then
      die "PR #${pr_number} is [${pr_state}], not MERGED. Worktree deletion blocked to protect unmerged work."
    fi
    say "PR #${pr_number} confirmed MERGED."
  fi

  if [ -n "$(git -C "${wt}" status --porcelain 2>/dev/null)" ]; then
    if [ "${discard}" -eq 1 ]; then
      say "discarding uncommitted changes in ${wt}"
    else
      die "worktree has uncommitted changes; use --discard to force remove"
    fi
  fi

  # Merge check if not abandoned/forced
  if [ -n "${branch}" ] && [ "${abandon}" -ne 1 ] && [ "${force}" -ne 1 ]; then
    git fetch "${REMOTE}" --prune 2>/dev/null || true
    local merged=""
    merged="$(git for-each-ref --merged="${REMOTE}/${DEFAULT_BRANCH}" --format='%(refname:short)' refs/heads 2>/dev/null | grep -x "${branch}" || true)"
    if [ -z "${merged}" ] && git rev-parse --verify --quiet "${DEFAULT_BRANCH}" >/dev/null 2>&1; then
      merged="$(git for-each-ref --merged="${DEFAULT_BRANCH}" --format='%(refname:short)' refs/heads 2>/dev/null | grep -x "${branch}" || true)"
    fi
    if [ -z "${merged}" ] && [ -z "${pr_number}" ]; then
      die "branch ${branch} is not merged into ${DEFAULT_BRANCH}; use --abandon to drop"
    fi
  fi

  [ "${discard}" -eq 1 ] && flags="--force"
  say "git worktree remove ${flags} ${wt}"
  git worktree remove ${flags} "${wt}" 2>/dev/null || rm -rf "${wt}"

  if [ -n "${branch}" ] && git show-ref --verify --quiet "refs/heads/${branch}"; then
    if [ "${abandon}" -eq 1 ] || [ "${force}" -eq 1 ]; then
      git branch -D "${branch}" 2>/dev/null || true
    else
      git branch -d "${branch}" 2>/dev/null || git branch -D "${branch}" 2>/dev/null || true
    fi
  fi

  git worktree prune
  say "done: ${task} removed"

  # 合并确认后必装开发版。正式版本落后时先快进再装这次拉进来的范围；
  # 已经拉齐时也不能跳过——这次合并可能走了别的收尾，开发版还停在上一版。
  if [ -n "${pr_number}" ] && [ -z "$(git -C "${ROOT}" status --porcelain 2>/dev/null)" ]; then
    local cur_branch
    cur_branch="$(git -C "${ROOT}" symbolic-ref --short HEAD 2>/dev/null || true)"
    if [ "${cur_branch}" = "${DEFAULT_BRANCH}" ]; then
      git -C "${ROOT}" fetch "${REMOTE}" "${DEFAULT_BRANCH}" 2>/dev/null || true
      local local_head remote_head
      local_head="$(git -C "${ROOT}" rev-parse HEAD 2>/dev/null || true)"
      remote_head="$(git -C "${ROOT}" rev-parse "${REMOTE}/${DEFAULT_BRANCH}" 2>/dev/null || true)"
      if [ -n "${local_head}" ] && [ -n "${remote_head}" ] && [ "${local_head}" != "${remote_head}" ]; then
        say "🔄 自动同步：主工作区落后于远端主干，正在自动拉取最新代码并物化..."
        if git -C "${ROOT}" pull --ff-only "${REMOTE}" "${DEFAULT_BRANCH}" 2>/dev/null; then
          auto_materialize_and_reload "${local_head}" "HEAD"
        fi
      elif [ -n "${remote_head}" ]; then
        local first_parent
        first_parent="$(git -C "${ROOT}" rev-parse "${remote_head}^1" 2>/dev/null || true)"
        if [ -n "${first_parent}" ]; then
          auto_materialize_and_reload "${first_parent}" "${remote_head}"
        else
          say "⚠️ 无法确定本次合并的起点，开发版未更新。请在主检出运行: ./scripts/sync-to-app.sh"
        fi
      fi
    fi
  fi
}

cmd_prune() {
  say "git worktree prune"
  git worktree prune
  echo
  echo "local branches merged into ${DEFAULT_BRANCH} (safe to delete):"
  if git rev-parse --verify --quiet "${DEFAULT_BRANCH}" >/dev/null 2>&1; then
    git for-each-ref --merged="${DEFAULT_BRANCH}" --format='%(refname:short)' \
      refs/heads/feat refs/heads/fix refs/heads/chore refs/heads/agent refs/heads/codex 2>/dev/null \
      | sed 's/^/  - /' || echo "  (none)"
  fi
  echo
  cmd_list
}

cmd_clean() {
  local force=0 pr_number=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --force) force=1 ;;
      --pr) shift; pr_number="${1:-}" ;;
    esac
    shift
  done

  say "fetch ${REMOTE} (sweep against default branch: ${DEFAULT_BRANCH})"
  git fetch "${REMOTE}" --prune 2>/dev/null || true

  local merged=""
  if git rev-parse --verify --quiet "${REMOTE}/${DEFAULT_BRANCH}" >/dev/null 2>&1; then
    merged="$(git for-each-ref --merged="${REMOTE}/${DEFAULT_BRANCH}" --format='%(refname:short)' refs/heads)"
  elif git rev-parse --verify --quiet "${DEFAULT_BRANCH}" >/dev/null 2>&1; then
    merged="$(git for-each-ref --merged="${DEFAULT_BRANCH}" --format='%(refname:short)' refs/heads)"
  else
    die "cannot resolve default branch: ${DEFAULT_BRANCH}"
  fi

  local wt="" branch=""
  while IFS= read -r line; do
    case "${line}" in
      worktree*)
        if [ -n "${wt}" ]; then clean_one "${wt}" "${branch}" "${merged}"; fi
        wt="${line#worktree }"
        branch=""
        ;;
      branch*)
        branch="${line#branch refs/heads/}"
        ;;
      detached)
        branch=""
        ;;
    esac
  done < <(git worktree list --porcelain)
  if [ -n "${wt}" ]; then clean_one "${wt}" "${branch}" "${merged}"; fi

  # Check orphans in .worktrees
  local registered="" orphans=0
  if [ -d "${WT_DIR}" ]; then
    while IFS= read -r line; do
      case "${line}" in
        worktree*) registered="${registered}${line#worktree }
" ;;
      esac
    done < <(git worktree list --porcelain)
    for d in "${WT_DIR}"/*; do
      [ -e "${d}" ] || continue
      if ! printf '%s\n' "${registered}" | grep -Fqx "${d}"; then
        echo "  - orphan directory: ${d#${ROOT}/}"
        orphans=$((orphans+1))
      fi
    done
  fi

  git worktree prune
  say "clean sweep finished. Orphan directories: ${orphans}"
}

clean_one() {
  local wt="$1" branch="$2" merged_list="$3"
  if [ "${wt}" = "${ROOT}" ]; then return 0; fi

  # Clean inside .worktrees/ OR legacy sibling directories
  local is_canonical=0
  case "${wt}" in
    "${WT_DIR}"/*) is_canonical=1 ;;
    *"$(basename "${ROOT}")-wt-"*) is_canonical=0 ;;
    *) return 0 ;;
  esac

  if [ -z "${branch}" ]; then return 0; fi

  if ! printf '%s\n' "${merged_list}" | grep -qx "${branch}"; then
    return 0
  fi

  if [ -n "$(git -C "${wt}" status --porcelain 2>/dev/null)" ]; then
    say "skip ${wt}: uncommitted changes (use: worktree.sh remove <task> --discard)"
    return 0
  fi

  say "removing merged worktree: ${wt} (branch: ${branch})"
  git worktree remove "${wt}" 2>/dev/null || rm -rf "${wt}"
  git branch -d "${branch}" 2>/dev/null || true
}

usage() {
  cat <<EOF
worktree.sh — Universal Git worktree lifecycle management.
Enhanced for OmniMux DSH Plugin & Multi-Agent Collaboration.

Remote:         ${REMOTE}
Default Branch: ${DEFAULT_BRANCH}

Usage:
  worktree.sh init                           create .worktrees/ and configure .gitignore
  worktree.sh new <task> [base] [--type ...] create .worktrees/<task>
  worktree.sh auto-new <issue_id>            fetch GitHub Issue and create worktree automatically
  worktree.sh list                           show active worktrees and dirty counts
  worktree.sh ship <task> --pr <num>         verify matching PR MERGED, sync ${DEFAULT_BRANCH}, retain acceptance workspace
  worktree.sh remove <task> [flags]          safely remove worktree (--discard, --abandon, --pr <num>)
  worktree.sh prune                          drop stale worktree records & list safe-to-delete branches
  worktree.sh clean                          batch clean merged & clean worktrees
  worktree.sh help

Flags (remove / clean):
  --discard   drop uncommitted dirty changes
  --abandon   drop unmerged branch
  --force     combine --discard and --abandon
  --pr <num>  verify GitHub PR is MERGED before removal
EOF
}

# -----------------------------------------------------------------------------
# Dispatcher
# -----------------------------------------------------------------------------

cmd="${1:-}"
shift || true
case "${cmd}" in
  init)     cmd_init ;;
  new)      [ "$#" -ge 1 ] || die "usage: worktree.sh new <task> [base] [--type feat|fix|chore|agent] [--issue <id>]"; cmd_new "$@" ;;
  auto-new) [ "$#" -ge 1 ] || die "usage: worktree.sh auto-new <issue_id>"; cmd_auto_new "$@" ;;
  list)     cmd_list ;;
  ship)     [ "$#" -ge 1 ] || die "usage: worktree.sh ship <task> --pr <num>"; cmd_ship "$@" ;;
  finish)   [ "$#" -ge 1 ] || die "usage: worktree.sh ship <task> --pr <num>"; cmd_ship "$@" ;;
  remove)   [ "$#" -ge 1 ] || die "usage: worktree.sh remove <task> [--discard] [--abandon] [--pr <num>]"; cmd_remove "$@" ;;
  prune)    cmd_prune ;;
  clean)    cmd_clean "$@" ;;
  help | -h | --help) usage ;;
  "")       usage; exit 1 ;;
  *)        die "unknown command: ${cmd} (see: worktree.sh help)" ;;
esac
