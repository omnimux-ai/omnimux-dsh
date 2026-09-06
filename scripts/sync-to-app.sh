#!/bin/bash
# sync-to-app.sh — L2/L3 日常迭代：先构建产物，再物化进目标 profile。
#
# 默认行为：仅物化到开发版 ~/.omnimux-dev（安全隔离，避免污染生产/官方环境）。
# 可选参数：可通过 --prod / --dsh / --all 或 --target 指定同步到其他环境。
# 规范：docs/contracts/dev-pipeline.md
#
# 用法：
#   ./scripts/sync-to-app.sh                     # 默认：构建并同步全部清单插件到 ~/.omnimux-dev
#   ./scripts/sync-to-app.sh omnimux-assets       # 默认：只同步一个插件到 ~/.omnimux-dev
#   ./scripts/sync-to-app.sh --prod               # 同步到正式版 ~/.omnimux
#   ./scripts/sync-to-app.sh --dsh                # 同步到官方底座 ~/.dsh
#   ./scripts/sync-to-app.sh --all                # 广播同步到全部 Profile (~/.omnimux-dev, ~/.omnimux, ~/.dsh)
#   ./scripts/sync-to-app.sh --target=dev,prod    # 自定义多目标同步
#   ./scripts/sync-to-app.sh --skip-build omnimux-assets
#
# 主入口（推荐）：在 omnimux-desktop-fork 里跑
#   yarn omnimux:sync [插件...] [--prod|--dsh|--all]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGINS_ROOT="${OMNIMUX_PLUGINS_DIR:-$ROOT/plugins}"
source "$ROOT/scripts/resolve-omnimux-profile.sh"
SKIP_BUILD=0
PLUGINS=()
TARGET_SELECTION=()
TARGET_FLAGS=()
EXPLICIT_PLUGIN_SCOPE=0
ALPHA_PLUGINS=()
if ! alpha_plugins_output="$(node "$ROOT/scripts/plugin-lifecycle.mjs" list-alpha-plugins)"; then
  echo "❌ 无法读取 Alpha 插件生命周期注册表，拒绝物化。" >&2
  exit 1
fi
[ -n "$alpha_plugins_output" ] || { echo "❌ Alpha 插件生命周期注册表为空，拒绝物化。" >&2; exit 1; }
ALPHA_PLUGINS_LABEL="${alpha_plugins_output//$'\n'/ }"
while IFS= read -r plugin_name; do
  [ -n "$plugin_name" ] && ALPHA_PLUGINS+=("$plugin_name")
done <<< "$alpha_plugins_output"

is_alpha_plugin() {
  local candidate="$1"
  for alpha_plugin in "${ALPHA_PLUGINS[@]}"; do
    [ "$candidate" = "$alpha_plugin" ] && return 0
  done
  return 1
}

assert_origin_main_aligned() {
  # —— 未合并物化旁路（仅限 L2 独立任务目录）——
  # 旧布尔旁路 OMNIMUX_ALLOW_UNMERGED_MATERIALIZE 已废弃：未合并物化必须显式
  # 指定目标前缀 OMNIMUX_ALLOW_UNMERGED_TARGET，且只允许落在 ~/.dsh-dev/tasks/ 下
  # （合并前测试请走 pnpm wt:dev，独立 L2 端口；公共 dev/prod 严禁未合并物化）。
  local unmerged_target="${OMNIMUX_ALLOW_UNMERGED_TARGET:-}"
  if [ "${OMNIMUX_ALLOW_UNMERGED_MATERIALIZE:-0}" = "1" ] && [ -z "$unmerged_target" ]; then
    echo "❌ OMNIMUX_ALLOW_UNMERGED_MATERIALIZE 已废弃：未合并物化必须同时设置 OMNIMUX_ALLOW_UNMERGED_TARGET=<~/.dsh-dev/tasks/... 前缀>，且只允许指向 L2 任务目录。" >&2
    echo "   合并前测试请用 pnpm wt:dev <topic>（独立 L2 端口），不要物化进公共 dev/prod。" >&2
    exit 1
  fi
  if [ -n "$unmerged_target" ]; then
    local tasks_prefix="$HOME/.dsh-dev/tasks"
    case "$unmerged_target" in
      "$tasks_prefix"|"$tasks_prefix"/*) ;;
      *)
        echo "❌ OMNIMUX_ALLOW_UNMERGED_TARGET 必须以 ${tasks_prefix}/ 开头（当前: ${unmerged_target}）。公共 dev/prod 严禁未合并物化。" >&2
        exit 1
        ;;
    esac
    if [ "${#TARGET_HOMES[@]}" -gt 0 ]; then
      for h in "${TARGET_HOMES[@]}"; do
        case "$h" in
          "$unmerged_target"|"$unmerged_target"/*) ;;
          *)
            echo "❌ 未合并物化目标 [$h] 不在允许前缀 [$unmerged_target] 内。" >&2
            exit 1
            ;;
        esac
      done
    fi
    echo "⚠ OMNIMUX_ALLOW_UNMERGED_TARGET=${unmerged_target}：放行 L2 任务目录的未合并物化（仅开发验证）"
    return 0
  fi
  if [ "${OMNIMUX_ALLOW_UNMERGED_MATERIALIZE:-0}" = "1" ]; then
    echo "⚠ OMNIMUX_ALLOW_UNMERGED_MATERIALIZE=1：跳过 origin/main 对齐门禁（仅排障使用）"
    return 0
  fi
  if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "· 非 git 工作区，跳过远端对齐检查"
    return 0
  fi
  if ! git -C "$ROOT" rev-parse --verify origin/main >/dev/null 2>&1; then
    echo "⚠ origin/main 不可用，跳过远端对齐检查"
    return 0
  fi
  local branch ahead dirty
  branch=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [ "$branch" != "main" ]; then
    echo "❌ sync-to-app: 当前分支是 [$branch]，物化只允许在已对齐的 main 上执行。" >&2
    echo "   请等待 PR MERGED 后在主仓 git pull origin main，或显式设置 OMNIMUX_ALLOW_UNMERGED_MATERIALIZE=1。" >&2
    exit 1
  fi
  dirty=$(git -C "$ROOT" status --porcelain)
  if [ -n "$dirty" ]; then
    echo "❌ sync-to-app: 工作区有未提交改动，禁止把本地脏状态物化进 App。" >&2
    echo "$dirty" >&2
    exit 1
  fi
  ahead=$(git -C "$ROOT" rev-list --count origin/main..HEAD 2>/dev/null || echo "0")
  if [ "${ahead:-0}" -gt 0 ]; then
    echo "❌ sync-to-app: 本地 main 领先 origin/main ${ahead} 个提交。禁止物化未推送/未 MERGED 的提交（上次丢代码事故路径）。" >&2
    echo "   正确流程: 推特性分支 → PR MERGED → git pull origin main → 再 pnpm sync。" >&2
    echo "   排障旁路: OMNIMUX_ALLOW_UNMERGED_MATERIALIZE=1" >&2
    exit 1
  fi
  echo "✓ HEAD 已对齐 origin/main，允许物化"
}

usage() {
  sed -n '2,16p' "$0"
  exit 1
}

for arg in "${@:-}"; do
  if [ "$arg" = "-h" ] || [ "$arg" = "--help" ]; then
    usage
  fi
done

# ---------------------------------------------------------------------------
# 目标 Profiles 解析与参数处理
# ---------------------------------------------------------------------------
if [ -n "${OMNIMUX_SYNC_TARGETS:-}" ]; then
  IFS=',' read -ra ENV_TARGETS <<< "$OMNIMUX_SYNC_TARGETS"
  for t in "${ENV_TARGETS[@]}"; do
    t=$(normalize_omnimux_sync_target "$t")
    [ -n "$t" ] && TARGET_SELECTION+=("$t")
  done
fi

parse_target_value() {
  local val="$1"
  IFS=',' read -ra PARTS <<< "$val"
  for p in "${PARTS[@]}"; do
    p=$(normalize_omnimux_sync_target "$p")
    [ -n "$p" ] && TARGET_SELECTION+=("$p")
  done
}

usage() {
  sed -n '2,16p' "$0"
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --dev|--omnimux-dev)
      TARGET_SELECTION+=("dev")
      TARGET_FLAGS+=("$1")
      shift ;;
    --prod|--omnimux)
      TARGET_SELECTION+=("prod")
      TARGET_FLAGS+=("$1")
      shift ;;
    --dsh)
      TARGET_SELECTION+=("dsh")
      TARGET_FLAGS+=("$1")
      shift ;;
    --all|--broadcast|--all-profiles)
      TARGET_SELECTION+=("all")
      TARGET_FLAGS+=("$1")
      shift ;;
    --target=*|--profile=*)
      val="${1#*=}"
      parse_target_value "$val"
      TARGET_FLAGS+=("$1")
      shift ;;
    --target|--profile)
      if [ $# -lt 2 ]; then
        echo "❌ $1 需要提供参数值 (dev | prod | dsh | all)" >&2
        exit 1
      fi
      parse_target_value "$2"
      TARGET_FLAGS+=("$1" "$2")
      shift 2 ;;
    --*) echo "未知参数: $1" >&2; usage ;;
    *) PLUGINS+=("$1"); shift ;;
  esac
done

if [ ${#PLUGINS[@]} -gt 0 ]; then
  EXPLICIT_PLUGIN_SCOPE=1
fi

TARGET_HOMES=()
add_target_home() {
  local h="$1"
  if [ "${#TARGET_HOMES[@]}" -gt 0 ]; then
    for existing in "${TARGET_HOMES[@]}"; do
      [ "$existing" = "$h" ] && return 0
    done
  fi
  TARGET_HOMES+=("$h")
}

if [ ${#TARGET_SELECTION[@]} -eq 0 ]; then
  # 默认只给 .omnimux-dev
  add_target_home "$HOME/.omnimux-dev"
else
  for item in "${TARGET_SELECTION[@]}"; do
    case "$item" in
      all|broadcast)
        add_target_home "$HOME/.omnimux-dev"
        add_target_home "$HOME/.omnimux"
        add_target_home "$HOME/.dsh"
        ;;
      dev|omnimux-dev)
        add_target_home "$HOME/.omnimux-dev"
        ;;
      prod|omnimux|omnimux-prod)
        add_target_home "$HOME/.omnimux"
        ;;
      dsh|dsh-desktop)
        add_target_home "$HOME/.dsh"
        ;;
      /*|"~"|"~/"*)
        expanded_path=$(expand_omnimux_sync_target_home "$item") || exit 1
        add_target_home "$expanded_path"
        ;;
      *)
        echo "⚠ 未知同步目标 [$item]，忽略。可选值: dev | prod | dsh | all" >&2
        ;;
    esac
  done
fi

TARGET_PROFILES=()

# 对齐门禁在目标解析后执行：未合并旁路（OMNIMUX_ALLOW_UNMERGED_TARGET）能基于
# 真实 TARGET_HOMES 做白名单校验（只允许 ~/.dsh-dev/tasks/ 下的 L2 任务目录）。
assert_origin_main_aligned

for home_dir in "${TARGET_HOMES[@]}"; do
  prof_dir="$(resolve_omnimux_profile_dir "$home_dir")" || exit 1
  if [ -d "$prof_dir" ] || [ -d "$home_dir" ]; then
    already=0
    if [ "${#TARGET_PROFILES[@]}" -gt 0 ]; then
      for p in "${TARGET_PROFILES[@]}"; do
        if [ "$p" = "$prof_dir" ]; then
          already=1
          break
        fi
      done
    fi
    if [ "$already" -eq 0 ]; then
      TARGET_PROFILES+=("$prof_dir")
    fi
  fi
done

DEFAULT_PLUGINS=(omnimux omnimux-accounts omnimux-assets omnimux-products omnimux-workflow omnimux-market omnimux-inspiration omnimux-clip omnimux-video omnimux-analytics omnimux-publish)
if [ ${#PLUGINS[@]} -eq 0 ]; then
  PLUGINS=("${DEFAULT_PLUGINS[@]}")
fi
SYNC_PLUGINS=("${PLUGINS[@]}")
BUILD_PLUGINS=("${SYNC_PLUGINS[@]}")

# Production policy applies to the target, including named-plugin syncs. A
# mixed dev+prod run keeps Alpha in Dev while sync-stable filters Prod.
HAS_PRODUCTION_TARGET=0
HAS_NON_PRODUCTION_TARGET=0
for home_dir in "${TARGET_HOMES[@]}"; do
  release_channel=$(resolve_omnimux_release_channel "$(resolve_omnimux_profile_dir "$home_dir")")
  if [ "$release_channel" = "production" ]; then
    HAS_PRODUCTION_TARGET=1
  else
    HAS_NON_PRODUCTION_TARGET=1
  fi
done
if [ "$HAS_PRODUCTION_TARGET" -eq 1 ]; then
  has_hub=0
  for plugin_name in "${BUILD_PLUGINS[@]}"; do
    [ "$plugin_name" = "omnimux" ] && has_hub=1
  done
  [ "$has_hub" -eq 1 ] || BUILD_PLUGINS+=(omnimux)
fi
if [ "$HAS_PRODUCTION_TARGET" -eq 1 ] && [ "$HAS_NON_PRODUCTION_TARGET" -eq 0 ]; then
  RELEASE_PLUGINS=()
  for plugin_name in "${BUILD_PLUGINS[@]}"; do
    is_alpha_plugin "$plugin_name" || RELEASE_PLUGINS+=("$plugin_name")
  done
  BUILD_PLUGINS=("${RELEASE_PLUGINS[@]}")
fi

# ---------------------------------------------------------------------------
# dsh-ui-kit 版本漂移防护 (Issue #200)
#
# 策略：node_modules 只由 stable 的 pnpm 输出。完整同步只更新既有受管 kit
# snapshot；官方完整 Profile rebuild 负责首次建立该 snapshot。
# ---------------------------------------------------------------------------
MANAGED_DSH_UI_KIT_RELATIVE_PATH='.materialize-snapshots/plugins/dsh-ui-kit'

if [ -z "${OMNIMUX_DSH_UI_KIT_DIR:-}" ]; then
  for candidate in \
    "$ROOT/../personal/dsh-ui-kit" \
    "$ROOT/../../personal/dsh-ui-kit" \
    "$ROOT/../../../personal/dsh-ui-kit"; do
    if [ -d "$candidate" ]; then
      DSH_UI_KIT_DIR="$candidate"
      break
    fi
  done
  DSH_UI_KIT_DIR="${DSH_UI_KIT_DIR:-$ROOT/../personal/dsh-ui-kit}"
else
  DSH_UI_KIT_DIR="$OMNIMUX_DSH_UI_KIT_DIR"
fi

managed_dsh_ui_kit_dir() {
  local PROFILE="$1"
  local MANAGED_KIT_SOURCE="${PROFILE}/${MANAGED_DSH_UI_KIT_RELATIVE_PATH}"
  printf '%s\n' "$MANAGED_KIT_SOURCE"
}

assert_managed_dsh_ui_kit_is_ready() {
  local PROFILE MANAGED_KIT_SOURCE
  for PROFILE in "${TARGET_PROFILES[@]}"; do
    MANAGED_KIT_SOURCE="${PROFILE}/${MANAGED_DSH_UI_KIT_RELATIVE_PATH}"
    if [ ! -f "$MANAGED_KIT_SOURCE/package.json" ] || [ ! -f "$MANAGED_KIT_SOURCE/lib/index.js" ]; then
      echo "✗ 缺少受管 dsh-ui-kit: ${MANAGED_KIT_SOURCE}；请先通过官方完整 profile rebuild 建立稳定源。" >&2
      return 1
    fi
  done
}

materialize_authoritative_dsh_ui_kit() {
  local profile="$1" managed_kit parent temporary backup=''
  managed_kit="$(managed_dsh_ui_kit_dir "$profile")"
  parent="$(dirname "$managed_kit")"
  if ! temporary="$(mktemp -d "$parent/.dsh-ui-kit.next.XXXXXX")"; then
    echo "❌ 无法创建受管 dsh-ui-kit 临时目录：${parent}。" >&2
    return 1
  fi
  if [ -z "$temporary" ] || [ "$temporary" = / ] || [ ! -d "$temporary" ] || [ "$(dirname "$temporary")" != "$parent" ]; then
    echo "❌ 非法受管 dsh-ui-kit 临时目录，拒绝物化。" >&2
    return 1
  fi

  if ! rsync -a --delete --exclude 'node_modules/' "$DSH_UI_KIT_DIR/" "$temporary/"; then
    rm -rf "$temporary"
    echo "❌ 无法物化权威 dsh-ui-kit 到 ${managed_kit}。" >&2
    return 1
  fi
  if [ ! -f "$temporary/package.json" ] || [ ! -f "$temporary/lib/index.js" ]; then
    rm -rf "$temporary"
    echo "❌ 权威 dsh-ui-kit 不完整：需要 package.json 与 lib/index.js。" >&2
    return 1
  fi

  backup="$parent/.dsh-ui-kit.previous.$$"
  if ! mv "$managed_kit" "$backup"; then
    rm -rf "$temporary"
    echo "❌ 无法备份受管 dsh-ui-kit：${managed_kit}。" >&2
    return 1
  fi
  if mv "$temporary" "$managed_kit"; then
    rm -rf "$backup"
    echo "  ✓ 已物化权威 dsh-ui-kit → ${managed_kit}"
    return 0
  fi
  if ! mv "$backup" "$managed_kit"; then
    echo "❌ 无法恢复受管 dsh-ui-kit：${managed_kit}。" >&2
  fi
  rm -rf "$temporary"
  echo "❌ 无法替换受管 dsh-ui-kit：${managed_kit}。" >&2
  return 1
}

ensure_dsh_ui_kit_fresh() {
  assert_managed_dsh_ui_kit_is_ready || exit 1
  if [ ! -f "$DSH_UI_KIT_DIR/package.json" ] || [ ! -f "$DSH_UI_KIT_DIR/lib/index.js" ]; then
    echo "❌ 权威 dsh-ui-kit 不完整：${DSH_UI_KIT_DIR}。" >&2
    echo "   请修复权威 source；完整同步不会从已安装 kit 回退。" >&2
    exit 1
  fi
  if [ "${OMNIMUX_SKIP_KIT_BUILD:-0}" = "1" ]; then
    echo "· OMNIMUX_SKIP_KIT_BUILD=1，跳过权威 kit 构建"
  else
    echo "== kit 构建: dsh-ui-kit =="
    if ! (cd "$DSH_UI_KIT_DIR" && corepack pnpm build >/dev/null 2>&1); then
      echo "❌ dsh-ui-kit 构建失败，禁止物化（否则插件会消费到残缺 kit）。" >&2
      echo "   请先在 $DSH_UI_KIT_DIR 修复构建。" >&2
      exit 1
    fi
  fi

  local profile
  for profile in "${TARGET_PROFILES[@]}"; do
    materialize_authoritative_dsh_ui_kit "$profile" || exit 1
  done
}

plugin_declares_dsh_ui_kit() {
  local package_file="$1"
  node --input-type=commonjs - "$package_file" <<'EOF'
const fs = require('fs')
const packageFile = process.argv[2]
try {
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
  process.exit(pkg.dependencies?.['dsh-ui-kit'] ? 0 : 1)
} catch {
  process.exit(1)
}
EOF
}

assert_dsh_ui_kit_scope_is_ready() {
  local name package_file requires_kit=0
  for name in "${BUILD_PLUGINS[@]}"; do
    package_file="$PLUGINS_ROOT/$name/package.json"
    if plugin_declares_dsh_ui_kit "$package_file"; then
      requires_kit=1
      break
    fi
  done

  if [ "$requires_kit" -eq 0 ]; then
    echo "· 命名插件不声明 dsh-ui-kit，跳过 shared kit 校验"
    return 0
  fi

  assert_managed_dsh_ui_kit_is_ready || exit 1

  local source_kit="$DSH_UI_KIT_DIR/lib/index.js"
  if [ ! -f "$source_kit" ]; then
    echo "❌ 命名插件依赖 dsh-ui-kit，但无法读取 ${source_kit}。" >&2
    echo "   单插件同步不会重建 shared kit；请先修复 kit 构建，或执行无插件参数的完整 yarn omnimux:sync。" >&2
    exit 1
  fi

  local source_hash target_hash profile target_kit
  source_hash=$(shasum -a 256 "$source_kit" | awk '{print $1}')
  for profile in "${TARGET_PROFILES[@]}"; do
    target_kit="$(managed_dsh_ui_kit_dir "$profile")/lib/index.js"
    target_hash=$(shasum -a 256 "$target_kit" | awk '{print $1}')
    if [ "$source_hash" != "$target_hash" ]; then
      echo "❌ dsh-ui-kit 漂移: ${profile}。" >&2
      echo "   单插件同步不会覆盖 shared kit；请执行无插件参数的完整 yarn omnimux:sync。" >&2
      exit 1
    fi
  done
  echo "  ✓ 命名插件所需受管 dsh-ui-kit 已就绪（未写 shared kit）"
}

if [ "$EXPLICIT_PLUGIN_SCOPE" -eq 1 ]; then
  assert_dsh_ui_kit_scope_is_ready
else
  ensure_dsh_ui_kit_fresh
fi

build_one() {
  local name="$1"
  local dir="$PLUGINS_ROOT/$name"
  if [ ! -f "$dir/package.json" ]; then
    echo "✗ 源码缺失: $dir" >&2
    exit 1
  fi

  case "$name" in
    omnimux|omnimux-accounts|omnimux-assets|omnimux-products|omnimux-inspiration|omnimux-clip|omnimux-analytics|omnimux-publish)
      echo "→ build $name (client)"
      (cd "$dir" && node scripts/build-client.mjs)
      ;;
    omnimux-workflow)
      echo "→ build $name (host + client + canvas)"
      (cd "$dir" && node scripts/build-host.mjs && node scripts/build-client.mjs && node scripts/build-canvas.mjs)
      ;;
    omnimux-market)
      echo "→ build $name (tsc + concat-client)"
      (cd "$dir" && npm run build --silent)
      ;;
    omnimux-video|omnimux-analytics)
      echo "· $name 无构建产物（源码直读），跳过 build"
      ;;
    *)
      if [ -f "$dir/scripts/build-client.mjs" ]; then
        echo "→ build $name (client, 推断)"
        (cd "$dir" && node scripts/build-client.mjs)
      elif node --input-type=commonjs -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.exit(p.scripts&&p.scripts.build?0:1)" "$dir/package.json" >/dev/null 2>&1; then
        echo "→ build $name (package.json scripts.build)"
        (cd "$dir" && npm run build --silent)
      else
        echo "· $name 无已知构建步骤，跳过 build"
      fi
      ;;
  esac
}

echo "== sync-to-app: 目标 Profile = [${TARGET_HOMES[*]}] | 请求插件 = [${SYNC_PLUGINS[*]}] =="
if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "== 1/3 build =="
  for name in "${BUILD_PLUGINS[@]}"; do
    build_one "$name"
  done
else
  echo "== 1/3 build 跳过 (--skip-build) =="
fi

echo "== 2/3 物化进 Profile 目录 =="
SYNC_STABLE_ARGS=()
if [ "${#TARGET_FLAGS[@]}" -gt 0 ]; then
  SYNC_STABLE_ARGS+=("${TARGET_FLAGS[@]}")
fi
SYNC_STABLE_ARGS+=("${SYNC_PLUGINS[@]}")
OMNIMUX_SYNC_VIA=sync-to-app "$ROOT/scripts/sync-stable.sh" "${SYNC_STABLE_ARGS[@]}"

if [ "$EXPLICIT_PLUGIN_SCOPE" -eq 1 ]; then
  echo "== 3/3 跳过 Agent Presets（命名插件同步不修改预设或应用包）=="
else
  echo "== 3/3 物化出厂 Agent Presets =="
  "$ROOT/scripts/sync-agent-presets.sh" ${TARGET_FLAGS[@]+"${TARGET_FLAGS[@]}"}
fi

cat <<EOF

✓ 已完成物化到目标 Profile（零副作用，未重启任何进程）。
  【同步目标】: ${TARGET_HOMES[*]}
  【发布策略】: Dev 保留 Alpha；正式版自动剔除 Alpha (${ALPHA_PLUGINS_LABEL})
  【提示】默认仅同步开发版 (~/.omnimux-dev)。指定其他目标可用参数：
    - 同步正式版: ./scripts/sync-to-app.sh --prod
    - 同步底座版: ./scripts/sync-to-app.sh --dsh
    - 广播全同步: ./scripts/sync-to-app.sh --all
  【多 Agent 并发与生效规则】
  - 前端 Client 修改：在浏览器或已打开的客户端窗口中刷新（Cmd+R）即可加载最新 bundle。
  - 后端 Host/插件扩展修改：产物已静默就绪，在应用下次自然启动或用户闲时手动重启后生效。
  - 【安全红线】Agent 严禁强杀或重启任何桌面 App（测试验证一律在 L2 独立隔离环境内闭环）。
EOF

if [ "$EXPLICIT_PLUGIN_SCOPE" -eq 1 ]; then
  echo "  - 会话预设下拉：本次命名插件同步未更新预设或应用包。"
else
  echo "  - 会话预设下拉：已同步为「标准模式 / 社媒内容创作专家团 / 社媒互动增长专家团」，需重启 Host 后生效。"
fi
