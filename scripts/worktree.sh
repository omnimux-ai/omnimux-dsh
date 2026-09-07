#!/usr/bin/env bash
# ==============================================================================
# worktree.sh — Universal Git worktree lifecycle management tool.
# Enhanced for OmniMux DSH Plugin & Multi-Agent Collaboration.
#
# Implements standardized worktree contracts:
#   1. Primary checkout stays clean on default branch (main/master/omnimux).
#   2. Task work lives strictly in <repo>/.worktrees/<task>.
#   3. Worktrees MUST be removed after merge or abandon; no orphaned dirs.
#   4. Worktrees MUST NOT be created as repository siblings or long-lived in /tmp.
#   5. Task naming strictly conforms to ASCII kebab-case (^[a-z0-9][a-z0-9-]*$).
#
# Enhanced Features:
#   - Full worktree-ops compatibility (init, new, list, ship, remove, clean, prune).
#   - GitHub Issue & PR integration (--issue <id>, --pr <number>, auto-new <id>).
#   - Safe PR-First guard (verifies PR MERGED before destruction).
#   - L2 Task Environment hooks (auto recycles dev-env.sh ports upon cleanup).
#   - Backward-compatible detection for legacy sibling worktrees (../*-wt-*).
#   - L2 Dev shortcut (worktree.sh dev <task>).
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
# L2 Task Environment Lifecycle Hook
# -----------------------------------------------------------------------------

recycle_l2_environment() {
  local task="$1"
  local dev_env_script="${ROOT}/scripts/dev-env.sh"
  if [ -f "${dev_env_script}" ]; then
    if bash "${dev_env_script}" ls 2>/dev/null | grep -qE "(omnimux-dev-${task}[[:space:]])"; then
      say "releasing L2 task environment: omnimux-dev-${task}"
      bash "${dev_env_script}" rm "${task}" 2>&1 | tail -3 || true
    fi
  fi
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

cmd_ship() {
  local task="$1"
  shift || true
  local pr_number=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --pr) shift; pr_number="${1:-}" ;;
    esac
    shift
  done

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

  say "fetch ${REMOTE}"
  git fetch "${REMOTE}" --prune 2>/dev/null || true

  say "push ${branch} to ${REMOTE}"
  git -C "${wt}" push "${REMOTE}" "${branch}" || say "note: push branch upstream failed or rejected"

  # If PR verification specified, verify PR MERGED instead of local merge
  if [ -n "${pr_number}" ] && command -v gh >/dev/null 2>&1; then
    say "verifying GitHub PR #${pr_number} merge state..."
    local pr_state
    pr_state=$(gh pr view "${pr_number}" --json state -q '.state' 2>/dev/null || true)
    if [ "${pr_state}" != "MERGED" ]; then
      die "PR #${pr_number} is in state [${pr_state}], not MERGED. Cannot finish shipping."
    fi
    say "PR #${pr_number} is confirmed MERGED. Syncing primary branch..."
    git -C "${ROOT}" pull --ff-only "${REMOTE}" "${DEFAULT_BRANCH}"
  else
    say "sync primary ${DEFAULT_BRANCH} with ${REMOTE}"
    git -C "${ROOT}" pull --ff-only "${REMOTE}" "${DEFAULT_BRANCH}" 2>/dev/null || true

    say "merging ${branch} into ${DEFAULT_BRANCH}"
    if ! git -C "${ROOT}" merge --ff-only "${branch}" 2>/dev/null; then
      git -C "${ROOT}" merge -m "merge: ${branch}" --no-ff "${branch}" || die "merge failed; resolve in primary checkout"
    fi

    say "push ${REMOTE} ${DEFAULT_BRANCH}"
    git -C "${ROOT}" push "${REMOTE}" "${DEFAULT_BRANCH}" 2>/dev/null || say "note: push ${DEFAULT_BRANCH} skipped/failed"
  fi

  say "removing worktree directory and branch..."
  git worktree remove "${wt}" || die "git worktree remove failed; run 'worktree.sh prune'"
  git branch -d "${branch}" 2>/dev/null || git branch -D "${branch}" 2>/dev/null || true
  git worktree prune

  recycle_l2_environment "${task}"
  say "done: ${branch} shipped and worktree cleaned up"
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
  recycle_l2_environment "${task}"
  say "done: ${task} removed"
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
  local task_name="$(basename "${wt}" | sed "s/^$(basename "${ROOT}")-wt-//")"
  recycle_l2_environment "${task_name}"
}

cmd_dev() {
  local task="${1:-}"
  local plugin="${2:-}"
  [ -n "${task}" ] || die "usage: worktree.sh dev <task> [plugin]"

  local dev_env_script="${ROOT}/scripts/dev-env.sh"
  [ -f "${dev_env_script}" ] || die "scripts/dev-env.sh not found"

  say "launching L2 task environment for ${task}..."
  exec bash "${dev_env_script}" start "${task}" ${plugin}
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
  worktree.sh dev <task> [plugin]            launch isolated L2 task environment (port 44201+)
  worktree.sh ship <task> [--pr <num>]       finish & sync: merge to ${DEFAULT_BRANCH} or verify PR MERGED
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
  dev)      [ "$#" -ge 1 ] || die "usage: worktree.sh dev <task> [plugin]"; cmd_dev "$@" ;;
  ship)     [ "$#" -ge 1 ] || die "usage: worktree.sh ship <task> [--pr <num>]"; cmd_ship "$@" ;;
  finish)   [ "$#" -ge 1 ] || die "usage: worktree.sh ship <task> [--pr <num>]"; cmd_ship "$@" ;;
  remove)   [ "$#" -ge 1 ] || die "usage: worktree.sh remove <task> [--discard] [--abandon] [--pr <num>]"; cmd_remove "$@" ;;
  prune)    cmd_prune ;;
  clean)    cmd_clean "$@" ;;
  help | -h | --help) usage ;;
  "")       usage; exit 1 ;;
  *)        die "unknown command: ${cmd} (see: worktree.sh help)" ;;
esac
