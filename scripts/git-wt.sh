#!/usr/bin/env bash
# ==============================================================================
# OmniMux DSH Plugin - Multi-Agent Worktree & Branch Lifecycle Manager
# Contracts: docs/contracts/plugin-git-pr.md, docs/contracts/agent-issue-lifecycle.md
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<'EOF'
OmniMux 多 Agent Worktree 隔离与管理工具 (支持 GitHub Issue 绑定与自动解析)

用法:
  ./scripts/git-wt.sh start <plugin> <topic> [issue_id]   从 origin/main 切出专属 Worktree
  ./scripts/git-wt.sh auto-start <issue_id>               根据 Issue ID 自动解析创建 Worktree
  ./scripts/git-wt.sh finish <topic> [issue_id] [flags]   本地门禁 → 推送特性分支 → 创建/核验 PR（禁止本地合 main）
  ./scripts/git-wt.sh clean <topic> [issue_id]            PR MERGED 后安全销毁 Worktree 及本地分支
  ./scripts/git-wt.sh list                                列出当前全部活跃的 Worktree 与对应分支
  ./scripts/git-wt.sh doctor                              检查主目录纯净度、远端同步与 Worktree 隔离状态

选项 (finish 指令):
  --skip-test     跳过本地单元测试门禁
  --skip-sync     即使 PR 已 MERGED 也跳过 App 物化
  --skip-push     跳过推送特性分支（交付未完成，保留沙箱）

示例:
  # 推荐: 绑定 GitHub Issue ID
  ./scripts/git-wt.sh start workflow table-node 42
  ./scripts/git-wt.sh finish table-node 42
  ./scripts/git-wt.sh clean table-node 42

  # 兼容: 无 Issue ID 形式
  ./scripts/git-wt.sh start clip timeline-tools
  ./scripts/git-wt.sh finish timeline-tools --skip-push
  ./scripts/git-wt.sh clean timeline-tools
EOF
}

resolve_plugin_pkg() {
  local input="$1"
  [ -z "$input" ] && return
  if [ "$input" = "common" ] || [ "$input" = "global" ] || [ "$input" = "all" ]; then
    return
  fi
  if [ -d "$REPO_ROOT/plugins/$input" ]; then
    echo "$input"
    return
  fi
  if [ -d "$REPO_ROOT/plugins/omnimux-$input" ]; then
    echo "omnimux-$input"
    return
  fi
}

detect_repo_name() {
  if [ -n "$OMNIMUX_REPO" ]; then
    echo "$OMNIMUX_REPO"
    return
  fi
  local origin_url
  origin_url=$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)
  if [ -n "$origin_url" ]; then
    local parsed
    parsed=$(echo "$origin_url" | sed -E 's#^.*github\.com[:/]([^/]+/[^/.]+)(\.git)?$#\1#' || true)
    if [ -n "$parsed" ] && [ "$parsed" != "$origin_url" ]; then
      echo "$parsed"
      return
    fi
  fi
  echo "laozhong86/omnimux-dsh"
}

detect_plugin_name() {
  local b="$1"
  local top="$2"
  local raw="${b#agent/}"

  # 1. 优先按 -${top} 及其后部分切割提取前缀
  local candidate="${raw%%-${top}*}"
  if [ -n "$candidate" ] && [ "$candidate" != "$raw" ]; then
    local resolved=$(resolve_plugin_pkg "$candidate")
    if [ -n "$resolved" ]; then
      echo "$resolved"
      return
    fi
  fi

  # 2. 遍历 plugins 目录匹配前缀
  for pdir in "$REPO_ROOT/plugins"/*; do
    if [ -d "$pdir" ]; then
      local pname=$(basename "$pdir")
      local pshort="${pname#omnimux-}"
      if [[ "$raw" == "$pname"* ]] || [[ "$raw" == "$pshort"* ]]; then
        echo "$pname"
        return
      fi
    fi
  done
  echo ""
}

cmd_auto_start() {
  local raw_issue="$1"
  if [ -z "$raw_issue" ]; then
    echo "❌ 错误: 必须提供 <issue_id>"
    echo "示例: ./scripts/git-wt.sh auto-start 42"
    exit 1
  fi
  local clean_issue=$(echo "$raw_issue" | sed 's/^[^0-9]*//g')

  echo "==> 正在查询 GitHub Issue #${clean_issue} 元数据..."
  local issue_json=""
  local repo_name=$(detect_repo_name)
  if command -v gh >/dev/null 2>&1; then
    issue_json=$(gh issue view "$clean_issue" -R "$repo_name" --json title,labels 2>/dev/null || true)
  fi

  local plugin="common"
  local topic="task"

  if [ -n "$issue_json" ]; then
    # 解析 title 形如 feat(workflow): xxx 或 scope 标签
    local extracted_plugin=$(echo "$issue_json" | grep -oE 'feat\([^)]+\)|fix\([^)]+\)|scope:[a-zA-Z0-9_-]+' | head -1 | sed -E 's/(feat\(|fix\(|scope:)//;s/\)//' || true)
    if [ -n "$extracted_plugin" ]; then
      plugin="$extracted_plugin"
    fi
    local title=$(echo "$issue_json" | grep -oE '"title":"[^"]+"' | head -1 | cut -d: -f2 | tr -d '"')
    if [ -n "$title" ]; then
      topic=$(echo "$title" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/^-\+//;s/-\+$//' | cut -c1-20)
    fi
  fi

  [ -z "$topic" ] && topic="issue-${clean_issue}"

  echo "==> 自动解析结果: Plugin=[$plugin], Topic=[$topic], Issue=[#$clean_issue]"
  cmd_start "$plugin" "$topic" "$clean_issue"
}

cmd_start() {
  local plugin="$1"
  local topic="$2"
  local raw_issue="$3"

  if [ -z "$plugin" ] || [ -z "$topic" ]; then
    echo "❌ 错误: 必须提供 <plugin> 和 <topic>"
    echo "示例: ./scripts/git-wt.sh start workflow table-node 42"
    exit 1
  fi

  local clean_issue=""
  local branch="agent/${plugin}-${topic}"
  local wt_suffix="${topic}"

  if [ -n "$raw_issue" ]; then
    clean_issue=$(echo "$raw_issue" | sed 's/^[^0-9]*//g')
    if [ -n "$clean_issue" ]; then
      branch="agent/${plugin}-${topic}-issue-${clean_issue}"
      wt_suffix="${topic}-${clean_issue}"
    fi
  fi

  local wt_dir="$(cd "$REPO_ROOT/.." && pwd)/omnimux-dsh-wt-${wt_suffix}"

  if [ -d "$wt_dir" ]; then
    echo "⚠️  Worktree 目录已存在: $wt_dir"
    exit 1
  fi

  echo "==> 1. 获取最新远程主干 origin/main..."
  git -C "$REPO_ROOT" fetch origin main

  echo "==> 2. 创建独立 Worktree: $wt_dir (分支: $branch)..."
  git -C "$REPO_ROOT" worktree add -b "$branch" "$wt_dir" origin/main

  echo ""
  echo "✅ Worktree 已就绪！"
  echo "👉 请进入专属工作区开工:"
  echo "   cd $wt_dir"
  echo "   (在该目录下修改代码、构建与测试，互不干扰)"
}

cmd_finish() {
  local topic=""
  local raw_issue=""
  local skip_test=0
  local skip_sync=0
  local skip_push=0
  local positional=()

  while [ $# -gt 0 ]; do
    case "$1" in
      --skip-test)
        skip_test=1
        shift
        ;;
      --skip-sync)
        skip_sync=1
        shift
        ;;
      --skip-push)
        skip_push=1
        shift
        ;;
      -h|--help)
        echo "用法: ./scripts/git-wt.sh finish <topic> [issue_id] [--skip-test] [--skip-sync] [--skip-push]"
        return 0
        ;;
      --*)
        echo "❌ 未知参数: $1" >&2
        return 1
        ;;
      *)
        positional+=("$1")
        shift
        ;;
    esac
  done

  topic="${positional[0]:-}"
  raw_issue="${positional[1]:-}"

  if [ -z "$topic" ]; then
    echo "❌ 错误: 必须提供 <topic>" >&2
    echo "用法: ./scripts/git-wt.sh finish <topic> [issue_id] [--skip-test] [--skip-sync] [--skip-push]" >&2
    exit 1
  fi

  local clean_issue=""
  local wt_suffix="${topic}"
  if [ -n "$raw_issue" ]; then
    clean_issue=$(echo "$raw_issue" | sed 's/^[^0-9]*//g')
    if [ -n "$clean_issue" ]; then
      wt_suffix="${topic}-${clean_issue}"
    fi
  fi

  local wt_dir="$(cd "$REPO_ROOT/.." && pwd)/omnimux-dsh-wt-${wt_suffix}"
  if [ ! -d "$wt_dir" ]; then
    if [ -n "$clean_issue" ] && [ -d "$(cd "$REPO_ROOT/.." && pwd)/omnimux-dsh-wt-${topic}" ]; then
      wt_dir="$(cd "$REPO_ROOT/.." && pwd)/omnimux-dsh-wt-${topic}"
      wt_suffix="${topic}"
    else
      local matched_dir
      matched_dir=$(ls -d "$(cd "$REPO_ROOT/.." && pwd)/omnimux-dsh-wt-${topic}"* 2>/dev/null | head -1 || true)
      if [ -n "$matched_dir" ] && [ -d "$matched_dir" ]; then
        wt_dir="$matched_dir"
        wt_suffix=$(basename "$wt_dir" | sed 's/^omnimux-dsh-wt-//')
      else
        echo "❌ 错误: 未找到 Worktree 目录: $wt_dir" >&2
        echo "当前活跃的 Worktree 清单:" >&2
        git -C "$REPO_ROOT" worktree list >&2
        exit 1
      fi
    fi
  fi

  echo "==> 步骤 1: 检查 Worktree 状态与就绪度 ($wt_dir)..."
  local branch
  branch=$(git -C "$wt_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
    echo "❌ 错误: Worktree 目录处于游离 HEAD 或无法识别分支！" >&2
    exit 1
  fi
  echo "✓ 目标分支: $branch"

  local wt_dirty
  wt_dirty=$(git -C "$wt_dir" status --porcelain)
  if [ -n "$wt_dirty" ]; then
    echo "❌ 错误: Worktree 存在未提交的改动！" >&2
    echo "请在 Worktree 目录中完成提交 (git commit) 或清理改动后再执行 finish。" >&2
    echo "未提交文件清单:" >&2
    echo "$wt_dirty" >&2
    exit 1
  fi
  echo "✓ Worktree 工作区干净，无未提交改动"

  local target_pkg
  target_pkg=$(detect_plugin_name "$branch" "$topic")
  if [ -n "$target_pkg" ]; then
    echo "✓ 识别对应插件模块: [$target_pkg]"
  else
    echo "· 未识别到特定插件模块，将按全局通用门禁处理"
  fi

  # 步骤 2: 核心门禁验证
  if [ "$skip_test" -eq 1 ]; then
    echo "==> 步骤 2: 跳过本地门禁测试 (--skip-test)"
  else
    echo "==> 步骤 2: 执行本地门禁验证与插槽静态契约卡点..."
    if [ -f "$wt_dir/scripts/verify-slot-contracts.mjs" ]; then
      echo "==> 运行静态插槽契约扫描 (工作区: $wt_dir)..."
      if ! (cd "$wt_dir" && node scripts/verify-slot-contracts.mjs); then
        echo "❌ 插槽契约静态扫描失败！已阻断交付。Worktree 现场已保留供排障: $wt_dir" >&2
        exit 1
      fi
    fi
    if [ -n "$target_pkg" ]; then
      echo "==> 运行插件 [$target_pkg] 单元测试 (工作区: $wt_dir)..."
      if ! (cd "$wt_dir" && pnpm --filter "$target_pkg" test); then
        echo "❌ 门禁测试失败！已阻断交付。Worktree 现场已保留供排障: $wt_dir" >&2
        exit 1
      fi
    else
      echo "==> 运行通用门禁测试 (工作区: $wt_dir)..."
      if ! (cd "$wt_dir" && pnpm test); then
        echo "❌ 门禁测试失败！已阻断交付。Worktree 现场已保留供排障: $wt_dir" >&2
        exit 1
      fi
    fi
    echo "✓ 本地门禁测试全绿通过"
  fi

  # 步骤 3: 主仓必须停留在干净的 main，只允许 fast-forward 对齐远端（禁止把特性分支合进本地 main）
  echo "==> 步骤 3: 检查主仓 main 纯净度与远端状态..."
  cd "$REPO_ROOT"
  local current_main_branch
  current_main_branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
  if [ "$current_main_branch" != "main" ]; then
    echo "==> 正在将主仓切回 main 分支..."
    git -C "$REPO_ROOT" checkout main
  fi

  local main_dirty
  main_dirty=$(git -C "$REPO_ROOT" status --porcelain)
  if [ -n "$main_dirty" ]; then
    echo "❌ 错误: 主仓库工作区存在未提交的脏改动，已中止交付！" >&2
    echo "请保持主仓纯净后再尝试 finish。脏改动清单:" >&2
    echo "$main_dirty" >&2
    exit 1
  fi
  echo "✓ 主仓位于 main 且工作区纯净"

  if git -C "$REPO_ROOT" remote get-url origin >/dev/null 2>&1; then
    echo "==> 检查并同步远端 origin/main..."
    if git -C "$REPO_ROOT" fetch origin main 2>/dev/null; then
      local behind_count
      behind_count=$(git -C "$REPO_ROOT" rev-list --count main..origin/main 2>/dev/null || echo "0")
      if [ "$behind_count" -gt 0 ]; then
        echo "⚠️  本地 main 落后 origin/main $behind_count 个提交，正在尝试 fast-forward 同步..."
        if ! git -C "$REPO_ROOT" merge --ff-only origin/main 2>/dev/null; then
          echo "❌ 错误: 本地 main 与 origin/main 产生分叉，无法自动 fast-forward。禁止把特性分支合进本地 main。" >&2
          exit 1
        fi
        echo "✓ 本地 main 已成功 fast-forward 同步至 origin/main"
      else
        echo "✓ 本地 main 与远端保持同步"
      fi
    else
      echo "⚠️  警告: fetch origin main 失败 (网络或权限原因)，跳过远端拉取校验"
    fi
  fi

  local plugin_label="${target_pkg:-common}"
  local pushed=0
  local pr_url=""
  local pr_state=""
  local merged=0
  local synced=0

  # 步骤 4: 只推特性分支，严禁直推主干 / 把特性分支合进本地 main
  if [ "$skip_push" -eq 1 ]; then
    echo "==> 步骤 4: 推送特性分支已跳过 (--skip-push)"
  else
    echo "==> 步骤 4: 推送特性分支 [$branch] 到 origin（禁止直推 main）..."
    if git -C "$REPO_ROOT" remote get-url origin >/dev/null 2>&1; then
      if git -C "$wt_dir" push -u origin "HEAD:${branch}" 2>&1; then
        echo "✓ 特性分支已推送: origin/${branch}"
        pushed=1
      else
        echo "❌ 错误: 特性分支推送失败。主仓 main 未被修改，Worktree 已保留。" >&2
        exit 1
      fi
    else
      echo "❌ 错误: 未配置 origin 远端，无法完成 PR 交付通道。" >&2
      exit 1
    fi
  fi

  # 步骤 5: 创建或核验 PR（不在本地合 main；仅对真实 GitHub origin 调 gh）
  echo "==> 步骤 5: 创建/核验 Pull Request..."
  local origin_url=""
  origin_url=$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)
  local is_github_origin=0
  local repo_name=$(detect_repo_name)
  case "$origin_url" in
    *github.com*) is_github_origin=1 ;;
  esac
  if [ "$skip_push" -eq 1 ]; then
    echo "⏩ 未推送特性分支，跳过 PR 创建"
  elif [ "$is_github_origin" -eq 1 ] && command -v gh >/dev/null 2>&1; then
    local existing
    existing=$(gh pr list -R "$repo_name" --head "$branch" --json number,url,state --jq '.[0]' 2>/dev/null || true)
    if [ -n "$existing" ] && [ "$existing" != "null" ]; then
      pr_url=$(echo "$existing" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
      pr_state=$(echo "$existing" | sed -n 's/.*"state":"\([^"]*\)".*/\1/p')
      echo "✓ 已有 PR: $pr_url (state=$pr_state)"
    else
      local pr_title="feat(${plugin_label}): ${topic}"
      local pr_body="Closes #${clean_issue:-0}"
      [ -z "$clean_issue" ] && pr_body="Automated finish for ${topic} on \`${branch}\`. Do not merge locally; wait for GitHub MERGED."
      if pr_url=$(gh pr create -R "$repo_name" --base main --head "$branch" --title "$pr_title" --body "$pr_body" 2>/dev/null); then
        pr_state="OPEN"
        echo "✓ 已创建 PR: $pr_url"
      else
        echo "⚠️  gh pr create 未成功（可能已存在或无权限）。请手动开 PR：gh pr create --base main --head $branch"
      fi
    fi
    if [ -n "$pr_url" ]; then
      local pr_json
      pr_json=$(gh pr view "$pr_url" --json state,mergedAt,mergeCommit 2>/dev/null || true)
      pr_state=$(echo "$pr_json" | sed -n 's/.*"state":"\([^"]*\)".*/\1/p')
      if [ "$pr_state" = "MERGED" ]; then
        merged=1
        echo "✓ PR 已确认 MERGED"
      fi
    fi
  elif [ "$is_github_origin" -eq 0 ]; then
    echo "⏩ origin 不是 GitHub 产品仓，跳过 gh pr create。特性分支已推送的话，请在对应远端开 PR，禁止把特性分支合进本地 main 或直推主干。"
  else
    echo "⚠️  未安装 gh。特性分支已推送的话，请手动创建 PR，禁止把特性分支合进本地 main 或直推主干。"
  fi

  # 步骤 6: 仅在远端 main 已包含该提交时才物化
  echo "==> 步骤 6: 物化门禁（仅 MERGED / origin/main 已包含特性提交）..."
  local feature_sha
  feature_sha=$(git -C "$wt_dir" rev-parse HEAD)
  if [ "$skip_sync" -eq 1 ]; then
    echo "⏩ 自动物化已跳过 (--skip-sync)"
  elif [ "$merged" -eq 1 ] || git -C "$REPO_ROOT" merge-base --is-ancestor "$feature_sha" origin/main 2>/dev/null; then
    git -C "$REPO_ROOT" merge --ff-only origin/main >/dev/null 2>&1 || true
    if [ -n "$target_pkg" ] && [ -f "$REPO_ROOT/scripts/sync-to-app.sh" ]; then
      echo "==> PR 已在远端合入，触发插件 [$target_pkg] 编译与物化..."
      if bash "$REPO_ROOT/scripts/sync-to-app.sh" "$target_pkg"; then
        echo "✅ 插件 [$target_pkg] 已物化同步至 App"
        synced=1
      else
        echo "❌ 错误: sync-to-app.sh 失败。Worktree 保留，禁止假装交付完成。" >&2
        exit 1
      fi
    else
      echo "· 未识别到单一插件模块，跳过自动单一物化"
    fi
  else
    echo "⏩ 远端 origin/main 尚未包含该提交，禁止物化。请等待 PR MERGED 后再 pnpm sync / git-wt.sh clean。"
  fi

  echo "==> 步骤 7: 保留验收现场..."
  echo "⏩ Worktree 与特性分支已保留: $wt_dir"
  echo "   合并后完成适用的 Dev 验收，再显式运行 clean；物化不等于验收通过。"

  echo ""
  echo "================================================================================"
  echo "📋 OmniMux 任务交付透明看板 (Delivery Board)"
  echo "================================================================================"
  echo "  🌿 目标主题/模块:  [${plugin_label}] - ${topic}"
  echo "  🔀 特性分支:      ${branch}"
  if [ "$merged" -eq 1 ]; then
    echo "  🎯 交付状态:      ✅ PR MERGED，主干已对齐远端"
  else
    echo "  🎯 交付状态:      ⏳ 未完成（禁止宣称 100% 完成）"
  fi
  if [ "$skip_push" -eq 1 ]; then
    echo "  🌐 远端同步:      ⏩ 跳过 (--skip-push)，特性分支未推送"
  elif [ "$pushed" -eq 1 ]; then
    echo "  🌐 远端同步:      ✅ 已推送 origin/${branch}（未直推 main）"
  else
    echo "  🌐 远端同步:      ❌ 未推送"
  fi
  if [ -n "$pr_url" ]; then
    echo "  📬 Pull Request:   ${pr_url} (${pr_state:-OPEN})"
  else
    echo "  📬 Pull Request:   ⏳ 未创建 — 下一步: gh pr create --base main --head ${branch}"
  fi
  if [ "$merged" -eq 1 ]; then
    echo "  🧬 主干合并:      ✅ origin/main 已包含 ${feature_sha:0:8}"
  else
    echo "  🧬 主干合并:      ⏳ 本地 main 未合入特性分支（防丢失）"
  fi
  if [ "$skip_sync" -eq 1 ]; then
    echo "  🚀 Dev 物化:  ⏩ 跳过 (--skip-sync)"
  elif [ "$synced" -eq 1 ]; then
    echo "  🚀 Dev 物化:  ✅ 已同步（HEAD 已等于 origin/main）"
  else
    echo "  🚀 Dev 物化:  ⏳ 未执行（等待 PR MERGED）"
  fi
  echo "  🧪 Dev 运行验收:  ⏳ 尚未由本命令验证，按变更面完成适用验收"
  echo "  🧹 沙箱环境:      ⏳ 已保留 $wt_dir"
  echo "================================================================================"
  echo ""
}

cmd_clean() {
  local topic=""
  local raw_issue=""
  local pr_number=""
  local force_flag=""
  local positional=()

  # flags 先解析，避免 --force / --pr 被当作 issue_id 吞掉（clean <topic> --force）
  while [ $# -gt 0 ]; do
    case "$1" in
      --pr)
        pr_number="$2"
        shift 2
        ;;
      --force)
        force_flag="1"
        shift
        ;;
      -h|--help)
        echo "用法: ./scripts/git-wt.sh clean <topic> [issue_id] [--pr <pr_number>] [--force]"
        return 0
        ;;
      *)
        positional+=("$1")
        shift
        ;;
    esac
  done

  topic="${positional[0]:-}"
  raw_issue="${positional[1]:-}"

  if [ -z "$topic" ]; then
    echo "❌ 错误: 必须提供 <topic>"
    echo "示例: ./scripts/git-wt.sh clean table-node 42 [--pr <pr_number>]"
    exit 1
  fi

  local wt_suffix="${topic}"
  if [ -n "$raw_issue" ]; then
    local clean_issue=$(echo "$raw_issue" | sed 's/^[^0-9]*//g')
    if [ -n "$clean_issue" ]; then
      wt_suffix="${topic}-${clean_issue}"
    fi
  fi

  local wt_dir="$(cd "$REPO_ROOT/.." && pwd)/omnimux-dsh-wt-${wt_suffix}"
  if [ ! -d "$wt_dir" ]; then
    # 前缀匹配：clean <topic>（不带 issue）时也能找到 omnimux-dsh-wt-<topic>-<issue>
    local matched_dir
    matched_dir=$(ls -d "$(cd "$REPO_ROOT/.." && pwd)/omnimux-dsh-wt-${topic}"* 2>/dev/null | head -1 || true)
    if [ -n "$matched_dir" ] && [ -d "$matched_dir" ]; then
      wt_dir="$matched_dir"
      wt_suffix=$(basename "$wt_dir" | sed 's/^omnimux-dsh-wt-//')
    fi
  fi

  if [ -n "$pr_number" ] && command -v gh >/dev/null 2>&1 && [ "$force_flag" != "1" ]; then
    echo "==> 校验 PR #${pr_number} 合入状态..."
    local pr_state
    local repo_name=$(detect_repo_name)
    pr_state=$(gh pr view "$pr_number" -R "$repo_name" --json state,mergedAt -q '.state' 2>/dev/null || true)
    if [ "$pr_state" != "MERGED" ]; then
      echo "❌ 安全守卫拦截：PR #${pr_number} 状态为 [$pr_state]，未确认 MERGED 严禁清理现场！" >&2
      exit 1
    fi
    echo "✓ PR #${pr_number} 已确认 MERGED"
  elif [ "$force_flag" != "1" ] && [ "${OMNIMUX_MERGE_CONFIRMED:-0}" != "1" ]; then
    echo "⚠️ 未声明 --pr / --force 且未置位 OMNIMUX_MERGE_CONFIRMED；若要强制清理，请显式传入 --force" >&2
    exit 1
  fi

  echo "==> 1. 移除 Worktree 目录..."
  if [ -d "$wt_dir" ]; then
    git -C "$REPO_ROOT" worktree remove "$wt_dir" 2>/dev/null || git -C "$REPO_ROOT" worktree remove "$wt_dir" --force 2>/dev/null || rm -rf "$wt_dir"
    git -C "$REPO_ROOT" worktree prune
    echo "✓ 目录 $wt_dir 已移除"
  else
    echo "· Worktree 目录不存在，跳过目录删除"
  fi

  echo "==> 2. 同步远程并清理本地跟踪分支..."
  git -C "$REPO_ROOT" fetch origin --prune

  # 匹配可能的分支名 (带 issue 或不带 issue)
  local branches=$(git -C "$REPO_ROOT" branch --list "agent/*-${topic}*" "agent/*-${wt_suffix}")
  if [ -n "$branches" ]; then
    for b in $branches; do
      local clean_b=$(echo "$b" | tr -d ' *+')
      git -C "$REPO_ROOT" branch -D "$clean_b" 2>/dev/null || true
      echo "✓ 已删除本地分支: $clean_b"
    done
  fi

  echo "✅ Topic [${wt_suffix}] 对应的 Worktree 与分支清理完成。"
}

cmd_list() {
  echo "== OmniMux 活跃 Worktree 清单 =="
  git -C "$REPO_ROOT" worktree list
}

cmd_doctor() {
  echo "== 检查主仓库纯净度 =="
  local current_branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
  if [ "$current_branch" != "main" ]; then
    echo "⚠️  警告: 主仓库当前位于 [$current_branch]，规范要求主仓库必须停留在 [main]！"
  else
    echo "✓ 主仓库处于 main 分支"
  fi

  local dirty=$(git -C "$REPO_ROOT" status --porcelain)
  if [ -n "$dirty" ]; then
    echo "⚠️  警告: 主仓库存在未提交的脏改动:"
    echo "$dirty"
  else
    echo "✓ 主仓库工作区纯净 (零脏改动)"
  fi

  echo ""
  echo "== 检查主仓库与远端同步状态 =="
  if git -C "$REPO_ROOT" rev-parse --verify origin/main >/dev/null 2>&1; then
    local counts=$(git -C "$REPO_ROOT" rev-list --left-right --count main...origin/main 2>/dev/null || echo "")
    local ahead=$(echo "$counts" | awk '{print $1}')
    local behind=$(echo "$counts" | awk '{print $2}')
    if [ "$ahead" = "0" ] && [ "$behind" = "0" ]; then
      echo "✓ 主仓库 main 与 origin/main 保持同步 (0 ahead, 0 behind)"
    elif [ "$ahead" -gt 0 ] && [ "$behind" = "0" ]; then
      echo "ℹ️  主仓库 main 领先 origin/main ($ahead ahead, 0 behind)"
    elif [ "$behind" -gt 0 ] && [ "$ahead" = "0" ]; then
      echo "⚠️  警告: 主仓库 main 落后 origin/main (0 ahead, $behind behind)，建议执行 git pull origin main"
    else
      echo "⚠️  警告: 主仓库 main 与 origin/main 产生分叉 ($ahead ahead, $behind behind)"
    fi
  else
    echo "· 远程 origin/main 未配置或不可达"
  fi

  echo ""
  echo "== 活跃 Worktree 数量 =="
  local count=$(git -C "$REPO_ROOT" worktree list | wc -l | tr -d ' ')
  echo "当前共有 $count 个工作树 (含主树)"
}

case "$1" in
  start)
    shift
    cmd_start "$@"
    ;;
  auto-start)
    shift
    cmd_auto_start "$@"
    ;;
  finish)
    shift
    cmd_finish "$@"
    ;;
  clean)
    shift
    cmd_clean "$@"
    ;;
  list)
    cmd_list
    ;;
  doctor)
    cmd_doctor
    ;;
  *)
    usage
    exit 1
    ;;
esac
