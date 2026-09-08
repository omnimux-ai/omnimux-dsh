#!/bin/bash
# sync-stable.sh — 【内部实现】把已构建好的插件目录物化进目标 profile。
#
# ⚠ 日常请勿直调本脚本。统一入口：
#   cd ~/Desktop/Project/omnimux-desktop-fork
#   yarn omnimux:sync [插件...] [--prod|--dsh|--all]   # 会先 build 再调本脚本
#   yarn omnimux:restart dev                          # 需要时再重启 App
#
# 默认行为：仅物化到 ~/.omnimux-dev；可通过 --prod / --dsh / --all 参数扩展到其他环境。
# 本脚本只做 rsync 物化 + file: 依赖声明 + dsh.profile.bundles 幂等入名单 + pnpm install，**不 build**。
# 物化源固定在 profile 的 .materialize-snapshots/plugins/；node_modules 只由 pnpm 管理。
# 直调容易把陈旧 lib/client.js 推进生产（已踩过坑）。禁止手动 rsync/cp 进 profile。
#
# 规范：docs/contracts/dev-pipeline.md
set -euo pipefail

if [ "${OMNIMUX_SYNC_VIA:-}" != "sync-to-app" ] && [ "${OMNIMUX_SYNC_VIA:-}" != "internal" ]; then
  echo "⚠ sync-stable.sh 是内部实现。日常请用：yarn omnimux:sync [插件...] [--prod|--dsh|--all]" >&2
  echo "  （若你确认已手动 build 且只要物化，可设 OMNIMUX_SYNC_VIA=internal 消掉本提示）" >&2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGINS_ROOT="${OMNIMUX_PLUGINS_DIR:-$ROOT/plugins}"
MANAGED_DSH_UI_KIT_RELATIVE_PATH='.materialize-snapshots/plugins/dsh-ui-kit'
# Keep L2 task profiles aligned with dev-env.sh; shared with sync-to-app.sh.
source "$ROOT/scripts/resolve-omnimux-profile.sh"

ORIGINAL_ARGS=("$@")
for arg in "$@"; do
  case "$arg" in
    --managed-tarball*|--expect-*|--recover-managed-tarball*)
      request="$(node "$ROOT/scripts/managed-tarball.mjs" request "$@")" || { printf '%s\n' "$request"; exit 2; }
      profile="$(printf '%s' "$request" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>process.stdout.write(JSON.parse(s).profile))')"
      lock_status=0
      python3 "$ROOT/scripts/managed-tarball-archive.py" check-locks "$profile" || lock_status=$?
      if [ "$lock_status" -eq 10 ]; then
        exec python3 "$ROOT/scripts/managed-tarball-archive.py" lock "$profile" -- bash "$0" "$@"
      elif [ "$lock_status" -ne 0 ]; then
        exit 4
      fi
      printf '%s' "$request" | node "$ROOT/scripts/managed-tarball.mjs" run
      exit $?
      ;;
  esac
done
TARGET_SELECTION=()
PLUGINS=()
ALPHA_PLUGINS=()
if ! alpha_plugins_output="$(node "$ROOT/scripts/plugin-lifecycle.mjs" list-alpha-plugins)"; then
  echo "✗ 无法读取 Alpha 插件生命周期注册表，拒绝物化。" >&2
  exit 1
fi
[ -n "$alpha_plugins_output" ] || { echo "✗ Alpha 插件生命周期注册表为空，拒绝物化。" >&2; exit 1; }
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

while [ $# -gt 0 ]; do
  case "$1" in
    --dev|--omnimux-dev)
      TARGET_SELECTION+=("dev")
      shift ;;
    --prod|--omnimux)
      TARGET_SELECTION+=("prod")
      shift ;;
    --dsh)
      TARGET_SELECTION+=("dsh")
      shift ;;
    --all|--broadcast|--all-profiles)
      TARGET_SELECTION+=("all")
      shift ;;
    --target=*|--profile=*)
      val="${1#*=}"
      parse_target_value "$val"
      shift ;;
    --target|--profile)
      if [ $# -ge 2 ]; then
        parse_target_value "$2"
        shift 2
      else
        shift
      fi ;;
    --skip-build)
      shift ;;
    --*)
      # 忽略其他不认识的参数
      shift ;;
    *)
      PLUGINS+=("$1")
      shift ;;
  esac
done

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
        ;;
    esac
  done
fi

PROFILES=()
for home_candidate in "${TARGET_HOMES[@]}"; do
  prof_dir=$(resolve_omnimux_profile_dir "$home_candidate") || exit 1
  if [ -d "$prof_dir" ] || [ -d "$home_candidate" ]; then
    already=0
    if [ "${#PROFILES[@]}" -gt 0 ]; then
      for p in "${PROFILES[@]}"; do
        if [ "$p" = "$prof_dir" ]; then
          already=1
          break
        fi
      done
    fi
    if [ "$already" -eq 0 ]; then
      PROFILES+=("$prof_dir")
    fi
  fi
done

if [ "${#PROFILES[@]}" -gt 0 ]; then
  lock_status=0
  python3 "$ROOT/scripts/managed-tarball-archive.py" check-locks "${PROFILES[@]}" || lock_status=$?
  if [ "$lock_status" -eq 10 ]; then
    exec python3 "$ROOT/scripts/managed-tarball-archive.py" lock "${PROFILES[@]}" -- bash "$0" ${ORIGINAL_ARGS[@]+"${ORIGINAL_ARGS[@]}"}
  elif [ "$lock_status" -ne 0 ]; then
    exit 4
  fi
  python3 "$ROOT/scripts/managed-tarball-archive.py" pending "${PROFILES[@]}" || exit 7
fi

# 产品树垂直（含产品库 / 插件市场 / 剪辑）+ omnimux-video + omnimux-analytics（埋点）+ omnimux-publish（发布中心）
ALL_PLUGINS=(omnimux omnimux-accounts omnimux-assets omnimux-products omnimux-workflow omnimux-market omnimux-inspiration omnimux-clip omnimux-video omnimux-analytics omnimux-publish)

if [ ${#PLUGINS[@]} -gt 0 ]; then
  TARGET_PLUGINS=("${PLUGINS[@]}")
else
  TARGET_PLUGINS=("${ALL_PLUGINS[@]}")
fi

for PROFILE in "${PROFILES[@]}"; do
  echo "== 同步目标 Profile: $PROFILE =="
  MANAGED_SOURCE_ROOT="$PROFILE/.materialize-snapshots/plugins"
  MANAGED_KIT_SOURCE="$PROFILE/$MANAGED_DSH_UI_KIT_RELATIVE_PATH"
  MANAGED_PLUGINS=()
  MANAGES_KIT=0
  LEGACY_KIT_SELF_REFERENCE=0
  RELEASE_CHANNEL=$(resolve_omnimux_release_channel "$PROFILE")
  PROFILE_TARGET_PLUGINS=()
  for name in "${TARGET_PLUGINS[@]}"; do
    if [ "$RELEASE_CHANNEL" != "production" ] || ! is_alpha_plugin "$name"; then
      PROFILE_TARGET_PLUGINS+=("$name")
    fi
  done
  profile_has_hub() {
    [ -f "$MANAGED_SOURCE_ROOT/omnimux/package.json" ] && return 0
    [ -e "$PROFILE/node_modules/omnimux" ] && return 0
    node -e "const fs=require('fs');try{const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.exit(p.dependencies?.omnimux||p.dsh?.profile?.bundles?.includes('omnimux')?0:1)}catch{process.exit(1)}" "$PROFILE/package.json"
  }
  if [ "$RELEASE_CHANNEL" = "production" ]; then
    has_hub=0
    for name in "${PROFILE_TARGET_PLUGINS[@]-}"; do
      [ "$name" = "omnimux" ] && has_hub=1
    done
    if [ "$has_hub" -eq 0 ] && profile_has_hub; then
      PROFILE_TARGET_PLUGINS+=(omnimux)
    fi
    echo "  · production channel: Alpha 插件将被剔除 (${ALPHA_PLUGINS_LABEL})"
  fi

  contains_managed_plugin() {
    local candidate="$1"
    for existing in "${MANAGED_PLUGINS[@]-}"; do
      [ "$existing" = "$candidate" ] && return 0
    done
    return 1
  }

  add_managed_plugin() {
    local candidate="$1"
    contains_managed_plugin "$candidate" || MANAGED_PLUGINS+=("$candidate")
  }

  targets_plugin() {
    local candidate="$1"
    for selected in "${PROFILE_TARGET_PLUGINS[@]}"; do
      [ "$selected" = "$candidate" ] && return 0
    done
    return 1
  }

  is_product_plugin() {
    local candidate="$1"
    for known in "${ALL_PLUGINS[@]}"; do
      [ "$known" = "$candidate" ] && return 0
    done
    return 1
  }

  syncs_all_plugins=1
  for name in "${ALL_PLUGINS[@]}"; do
    if [ "$RELEASE_CHANNEL" = "production" ] && is_alpha_plugin "$name"; then
      continue
    fi
    targets_plugin "$name" || syncs_all_plugins=0
  done

  # pnpm removes every self-reference from node_modules before resolving the
  # selected packages. We can rebuild only product packages and the verified
  # profile-local kit below; reject every other old profile entry before any
  # source, manifest, or node_modules write.
  while IFS=$'\t' read -r dependency_name dependency_spec; do
    [ -n "$dependency_name" ] || continue
    case "$dependency_spec" in
      "file:node_modules/$dependency_name"|"file:./node_modules/$dependency_name")
        if [ "$dependency_name" = "dsh-ui-kit" ]; then
          LEGACY_KIT_SELF_REFERENCE=1
        fi
        if [ "$dependency_name" != "dsh-ui-kit" ] && ! is_product_plugin "$dependency_name"; then
          echo "✗ 检测到非产品旧自引用 $dependency_name = ${dependency_spec}；sync-stable 无法重建该依赖，请先通过官方完整 profile 安装建立它。" >&2
          exit 1
        fi
        ;;
    esac
  done < <(node -e "const fs=require('fs');try{const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));for(const [n,s] of Object.entries(m.dependencies||{}))if(typeof s==='string')process.stdout.write(n+'\\t'+s+'\\n')}catch{}" "$PROFILE/package.json")

  # `file:node_modules/<name>` is an obsolete self-reference, not a source
  # we can preserve. A sync can establish the new layout only when its caller
  # explicitly selected every still-legacy package from the current source.
  for name in "${ALL_PLUGINS[@]}"; do
    if [ "$RELEASE_CHANNEL" = "production" ] && is_alpha_plugin "$name"; then
      continue
    fi
    dependency_spec=$(node -e "const fs=require('fs');const p=process.argv[1];const n=process.argv[2];try{const m=JSON.parse(fs.readFileSync(p,'utf8'));process.stdout.write(m.dependencies?.[n]||'')}catch{}" "$PROFILE/package.json" "$name")
    case "$dependency_spec" in
      "file:node_modules/$name"|"file:./node_modules/$name")
        if ! targets_plugin "$name"; then
          echo "✗ 检测到未选中的旧物化依赖 $name = ${dependency_spec}；请用包含所有旧依赖的完整 sync 建立受管源。" >&2
          exit 1
        fi
        ;;
      "file:.materialize-snapshots/plugins/$name")
        if [ ! -f "$MANAGED_SOURCE_ROOT/$name/package.json" ]; then
          echo "✗ 受管物化源缺失: $MANAGED_SOURCE_ROOT/$name" >&2
          exit 1
        fi
        add_managed_plugin "$name"
        ;;
      "")
        ;;
      *)
        if ! targets_plugin "$name"; then
          echo "✗ 检测到未选中的非受管依赖 $name = ${dependency_spec}；请用包含该依赖的完整 sync 建立受管源。" >&2
          exit 1
        fi
        ;;
    esac
  done

  ensure_managed_kit() {
    if [ ! -f "$MANAGED_KIT_SOURCE/package.json" ]; then
      echo "✗ 缺少受管 dsh-ui-kit: ${MANAGED_KIT_SOURCE}；请先通过官方完整 profile rebuild 建立稳定源。" >&2
      exit 1
    fi
    local kit_name
    kit_name=$(node -e "const fs=require('fs');process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],'utf8')).name||'')" "$MANAGED_KIT_SOURCE/package.json")
    if [ "$kit_name" != "dsh-ui-kit" ]; then
      echo "✗ 受管 dsh-ui-kit 身份错误: $MANAGED_KIT_SOURCE" >&2
      exit 1
    fi
    MANAGES_KIT=1
    echo "✓ 使用受管 dsh-ui-kit → $MANAGED_KIT_SOURCE"
  }

  package_needs_managed_kit() {
    node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(p.dependencies?.['dsh-ui-kit']==='file:../dsh-ui-kit'?'1':'0')" "$1"
  }

  requires_managed_kit="$LEGACY_KIT_SELF_REFERENCE"
  managed_kit_spec=$(node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(p.dependencies?.['dsh-ui-kit']||'')" "$PROFILE/package.json")
  if [ "$managed_kit_spec" = "file:$MANAGED_DSH_UI_KIT_RELATIVE_PATH" ]; then
    requires_managed_kit=1
  fi
  for name in "${MANAGED_PLUGINS[@]-}"; do
    [ -n "$name" ] || continue
    if [ "$(package_needs_managed_kit "$MANAGED_SOURCE_ROOT/$name/package.json")" = "1" ]; then
      requires_managed_kit=1
    fi
  done
  if [ "$requires_managed_kit" -eq 1 ]; then
    ensure_managed_kit
  fi

  # Validate every selected source and its stable-kit prerequisite before
  # materializing the first one, so a missing kit cannot leave a partial sync.
  for name in "${PROFILE_TARGET_PLUGINS[@]}"; do
    src="$PLUGINS_ROOT/$name"
    if [ ! -f "$src/package.json" ]; then
      echo "✗ 源码缺失: $src" >&2
      exit 1
    fi
    needs_kit=$(node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(typeof p.dependencies?.['dsh-ui-kit']==='string'&&p.dependencies['dsh-ui-kit'].startsWith('file:')?'1':'0')" "$src/package.json")
    if [ "$needs_kit" = "1" ]; then
      ensure_managed_kit
    fi
  done

  mkdir -p "$PROFILE/node_modules" "$MANAGED_SOURCE_ROOT"

  materialize_plugin_source() {
    local name="$1" src="$2" dst="$MANAGED_SOURCE_ROOT/$1"
    local needs_kit
    needs_kit=$(node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(typeof p.dependencies?.['dsh-ui-kit']==='string'&&p.dependencies['dsh-ui-kit'].startsWith('file:')?'1':'0')" "$src/package.json")
    mkdir -p "$dst"
    rsync -aL --delete \
      --exclude node_modules \
      --exclude '*.test.js' \
      --exclude '*.spec.js' \
      "$src/" "$dst/"
    if [ "$name" = "omnimux" ]; then
      mkdir -p "$dst/src"
      node - "$dst/src/release-channel.json" "$RELEASE_CHANNEL" <<'EOF'
const fs = require('fs')
const [file, channel] = process.argv.slice(2)
if (!['development', 'production'].includes(channel)) throw new Error(`invalid release channel: ${channel}`)
fs.writeFileSync(file, JSON.stringify({ channel }, null, 2) + '\n', 'utf8')
EOF
    fi
    if [ "$needs_kit" = "1" ]; then
      node - "$dst/package.json" <<'EOF'
const fs = require('fs')
const file = process.argv[2]
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
manifest.dependencies['dsh-ui-kit'] = 'file:../dsh-ui-kit'
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
EOF
    fi
    add_managed_plugin "$name"
  }

  for name in "${PROFILE_TARGET_PLUGINS[@]}"; do
    src="$PLUGINS_ROOT/$name"
    materialize_plugin_source "$name" "$src"
    echo "✓ $name 已物化进 $MANAGED_SOURCE_ROOT"
  done

  managed_plugins_csv=""
  if [ "${#MANAGED_PLUGINS[@]}" -gt 0 ]; then
    managed_plugins_csv=$(IFS=,; printf '%s' "${MANAGED_PLUGINS[*]}")
  fi

  # 依赖声明统一回 profile 外的受管 file: 源；声明了 dsh.bundle 的插件幂等写入加载名单。
  alpha_plugins_csv=$(IFS=,; printf '%s' "${ALPHA_PLUGINS[*]}")
  node - "$PROFILE" "$MANAGED_SOURCE_ROOT" "$syncs_all_plugins" "$MANAGES_KIT" "$managed_plugins_csv" "$RELEASE_CHANNEL" "$alpha_plugins_csv" <<'EOF'
const fs = require('fs')
const path = require('path')
const [profile, managedRoot, pruneLegacy, managesKit, pluginsCsv, releaseChannel, alphaPluginsCsv] = process.argv.slice(2)
const isProduction = releaseChannel === 'production'
const alphaPlugins = alphaPluginsCsv ? alphaPluginsCsv.split(',') : []
const plugins = pluginsCsv ? pluginsCsv.split(',') : []
const file = path.join(profile, 'package.json')
if (!fs.existsSync(file)) {
  process.exit(0)
}
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
if (!manifest.dependencies) manifest.dependencies = {}
if (!manifest.dsh) manifest.dsh = {}
if (!manifest.dsh.profile) manifest.dsh.profile = {}
if (!Array.isArray(manifest.dsh.profile.bundles)) manifest.dsh.profile.bundles = []
const bundles = manifest.dsh.profile.bundles
let depChanged = false
let bundleChanged = false

function declaresBundle(name) {
  const pkgFile = path.join(managedRoot, name, 'package.json')
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
    return pkg?.dsh?.bundle != null
  } catch {
    return false
  }
}

// 清理已知历史废弃/更名前的包名，避免 Cordis 重复注册 Service 冲突导致 Host 启动失败崩溃
const LEGACY_PRUNE_NAMES = pruneLegacy === '1' ? ['dsh-video', 'dsh-omnimux', 'dsh-drama', 'dsh-publish'] : []
for (const legacy of LEGACY_PRUNE_NAMES) {
  if (manifest.dependencies[legacy]) {
    delete manifest.dependencies[legacy]
    depChanged = true
  }
  const idx = bundles.indexOf(legacy)
  if (idx >= 0) {
    bundles.splice(idx, 1)
    bundleChanged = true
  }
  const legacyDir = path.join(profile, 'node_modules', legacy)
  if (fs.existsSync(legacyDir)) {
    fs.rmSync(legacyDir, { recursive: true, force: true })
    console.log(`  - 已清理历史残留包目录: ${legacy}`)
  }
  fs.rmSync(path.join(managedRoot, legacy), { recursive: true, force: true })
}

if (isProduction) {
  for (const excluded of alphaPlugins) {
    if (manifest.dependencies[excluded]) {
      delete manifest.dependencies[excluded]
      depChanged = true
    }
    let idx
    while ((idx = bundles.indexOf(excluded)) >= 0) {
      bundles.splice(idx, 1)
      bundleChanged = true
    }
    const excludedDir = path.join(profile, 'node_modules', excluded)
    if (fs.existsSync(excludedDir)) {
      fs.rmSync(excludedDir, { recursive: true, force: true })
      console.log(`  - [production] 已清理 Alpha 运行时包目录: ${excluded}`)
    }
    fs.rmSync(path.join(managedRoot, excluded), { recursive: true, force: true })
    const virtualStore = path.join(profile, 'node_modules', '.pnpm')
    if (fs.existsSync(virtualStore)) {
      for (const entry of fs.readdirSync(virtualStore)) {
        if (entry === excluded || entry.startsWith(`${excluded}@`)) {
          fs.rmSync(path.join(virtualStore, entry), { recursive: true, force: true })
        }
      }
    }
  }
}

if (managesKit === '1') {
  manifest.dependencies['dsh-ui-kit'] = 'file:.materialize-snapshots/plugins/dsh-ui-kit'
  depChanged = true
}

for (const name of plugins) {
  const targetSpec = `file:.materialize-snapshots/plugins/${name}`
  if (manifest.dependencies[name] !== targetSpec) {
    manifest.dependencies[name] = targetSpec
    depChanged = true
  }
  if (declaresBundle(name)) {
    if (!bundles.includes(name)) {
      bundles.push(name)
      bundleChanged = true
    }
  } else {
    const idx = bundles.indexOf(name)
    if (idx >= 0) {
      bundles.splice(idx, 1)
      bundleChanged = true
    }
  }
}

// Bundle patch order is load order. dsh-base inserts the shared rows
// (including `llm-pi-ai`); product plugins like omnimux patch those rows by
// id. If omnimux is listed before dsh-base, the loader logs
// `patch: entry llm-pi-ai not found`, the omnimux LLM route never registers,
// and workflow textComplete fails with NO_ADAPTER for provider "omnimux".
const CORE_BUNDLE_PREFIX = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
]
function normalizeBundleOrder(list) {
  const seen = new Set()
  const ordered = []
  for (const name of CORE_BUNDLE_PREFIX) {
    if (list.includes(name) && !seen.has(name)) {
      ordered.push(name)
      seen.add(name)
    }
  }
  for (const name of list) {
    if (!seen.has(name)) {
      ordered.push(name)
      seen.add(name)
    }
  }
  return ordered
}
const normalized = normalizeBundleOrder(bundles)
if (normalized.length !== bundles.length || normalized.some((name, i) => name !== bundles[i])) {
  manifest.dsh.profile.bundles = normalized
  bundleChanged = true
  console.log('  ✓ 纠正 bundles 顺序：核心包 (@deepseek-ai/dsh-base …) 必须先于 omnimux')
}

if (depChanged || bundleChanged) {
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`  ✓ 更新 ${file} (dependencies/bundles)`)
}
EOF

  # pnpm 11 对同版本 directory file: 依赖会保留现有安装入口，即使受管 source
  # 已由本轮 rsync 替换。只暂存本轮显式选中、且 manifest 精确声明为受管 file:
  # 的入口，使 pnpm install 重装它们；link: 入口（例如 L2 的 workflow）绝不触碰。
  REFRESH_FILE_PACKAGES=()
  add_refresh_file_package() {
    local candidate="$1" existing
    for existing in "${REFRESH_FILE_PACKAGES[@]-}"; do
      [ "$existing" = "$candidate" ] && return 0
    done
    REFRESH_FILE_PACKAGES+=("$candidate")
  }
  for name in "${PROFILE_TARGET_PLUGINS[@]}"; do
    dependency_spec=$(node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(p.dependencies?.[process.argv[2]]||'')" "$PROFILE/package.json" "$name")
    if [ "$dependency_spec" = "file:.materialize-snapshots/plugins/$name" ]; then
      add_refresh_file_package "$name"
    fi
  done
  if [ "$syncs_all_plugins" -eq 1 ] && [ "$MANAGES_KIT" -eq 1 ]; then
    dependency_spec=$(node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(p.dependencies?.['dsh-ui-kit']||'')" "$PROFILE/package.json")
    if [ "$dependency_spec" = "file:.materialize-snapshots/plugins/dsh-ui-kit" ]; then
      add_refresh_file_package "dsh-ui-kit"
    fi
  fi

  # L2 可以保留唯一一条当前 worktree 的在研 link。pnpm 会尝试为这条 link
  # 的源目录补齐依赖；先暂存它，让 install 只读取 profile 内的受管 snapshot，
  # 随后立即还原 link。其它 profile、多个 link 或任何非当前源路径都不放行。
  if ! IN_PROGRESS_LINK_NAME="$(node - "$PROFILE" "$MANAGED_SOURCE_ROOT" "$PLUGINS_ROOT" <<'EOF'
const fs = require('fs')
const path = require('path')
const [profile, managedRoot, pluginsRoot] = process.argv.slice(2)
const reject = reason => {
  console.error(`✗ 非法 L2 在研 link: ${reason}`)
  process.exit(1)
}
try {
  const taskRoot = path.dirname(path.dirname(profile))
  if (path.basename(path.dirname(taskRoot)) !== 'tasks' || path.basename(path.dirname(path.dirname(taskRoot))) !== '.dsh-dev') process.exit(0)
  const modules = path.join(profile, 'node_modules')
  const links = fs.readdirSync(modules).filter(name => fs.lstatSync(path.join(modules, name)).isSymbolicLink())
  if (links.length === 0) process.exit(0)
  if (links.length !== 1) reject(`顶层 link 数 ${links.length}（必须为 1）`)
  const name = links[0]
  const manifest = JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'))
  if (manifest.dependencies?.[name] !== `file:.materialize-snapshots/plugins/${name}`) reject(`${name} 未声明为受管 snapshot`)
  if (!fs.existsSync(path.join(managedRoot, name, 'package.json'))) reject(`${name} 缺少受管 snapshot`)
  const installed = path.join(modules, name)
  const source = path.join(pluginsRoot, name)
  if (fs.realpathSync(installed) !== fs.realpathSync(source)) reject(`${name} 未指向当前 worktree source`)
  if (JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')).name !== name) reject(`${name} 包身份错误`)
  process.stdout.write(name)
} catch (error) {
  reject(error instanceof Error ? error.message : String(error))
}
EOF
)"; then
    exit 1
  fi

  REFRESH_BACKUP_DIR=""
  REFRESH_BACKED_UP=()
  backup_refresh_entry() {
    local package_name="$1" installed existing
    for existing in "${REFRESH_BACKED_UP[@]-}"; do
      [ "$existing" = "$package_name" ] && return 0
    done
    installed="$PROFILE/node_modules/$package_name"
    if [ -e "$installed" ] || [ -L "$installed" ]; then
      mkdir -p "$REFRESH_BACKUP_DIR/$(dirname "$package_name")"
      mv "$installed" "$REFRESH_BACKUP_DIR/$package_name" || return 1
      REFRESH_BACKED_UP+=("$package_name")
    fi
  }
  restore_refresh_entries() {
    local package_name installed backup
    [ -n "$REFRESH_BACKUP_DIR" ] || return 0
    for package_name in "${REFRESH_BACKED_UP[@]-}"; do
      installed="$PROFILE/node_modules/$package_name"
      backup="$REFRESH_BACKUP_DIR/$package_name"
      if [ -e "$backup" ] || [ -L "$backup" ]; then
        if [ -e "$installed" ] || [ -L "$installed" ]; then
          rm -rf "$installed"
        fi
        mkdir -p "$(dirname "$installed")"
        mv "$backup" "$installed"
      fi
    done
    rm -rf "$REFRESH_BACKUP_DIR"
    REFRESH_BACKUP_DIR=""
  }
  restore_in_progress_link() {
    local installed backup
    [ -n "$IN_PROGRESS_LINK_NAME" ] || return 0
    installed="$PROFILE/node_modules/$IN_PROGRESS_LINK_NAME"
    backup="$REFRESH_BACKUP_DIR/$IN_PROGRESS_LINK_NAME"
    if [ -e "$backup" ] || [ -L "$backup" ]; then
      if [ -e "$installed" ] || [ -L "$installed" ]; then
        rm -rf "$installed"
      fi
      mkdir -p "$(dirname "$installed")"
      mv "$backup" "$installed"
    fi
  }
  if [ "${#REFRESH_FILE_PACKAGES[@]}" -gt 0 ] || [ -n "$IN_PROGRESS_LINK_NAME" ]; then
    if ! REFRESH_BACKUP_DIR="$(mktemp -d "$PROFILE/.pnpm-file-refresh.XXXXXX")"; then
      echo "✗ 无法创建 profile-local file: 刷新备份目录: ${PROFILE}" >&2
      exit 1
    fi
    for name in "${REFRESH_FILE_PACKAGES[@]}"; do
      if ! backup_refresh_entry "$name"; then
        restore_refresh_entries
        echo "✗ 无法暂存受管 file: 安装入口: $PROFILE/node_modules/$name" >&2
        exit 1
      fi
    done
    if [ -n "$IN_PROGRESS_LINK_NAME" ] && ! backup_refresh_entry "$IN_PROGRESS_LINK_NAME"; then
      restore_refresh_entries
      echo "✗ 无法暂存 L2 在研 link: $PROFILE/node_modules/$IN_PROGRESS_LINK_NAME" >&2
      exit 1
    fi
    echo "  → 刷新本轮受管 file: 入口 (${REFRESH_FILE_PACKAGES[*]})"
  fi

  # 写入后由 pnpm 构造 profile 下的 node_modules 符号拓扑。安装失败恢复被暂存的
  # 入口，避免留下缺包；成功后仍由下方的全内容 fingerprint 校验最终结果。
  echo "  → 刷新 profile 依赖 (corepack pnpm install)..."
  # The selected entries were moved above; workspace freshness cannot prove they exist.
  if ! (cd "$PROFILE" && pnpm_config_frozen_lockfile=false pnpm_config_optimistic_repeat_install=false corepack pnpm install); then
    restore_refresh_entries
    echo "✗ pnpm 刷新 profile 依赖失败；已恢复本轮暂存的 file: 安装入口。" >&2
    exit 1
  fi
  if ! restore_in_progress_link; then
    restore_refresh_entries
    echo "✗ 无法还原 L2 在研 link: $PROFILE/node_modules/$IN_PROGRESS_LINK_NAME" >&2
    exit 1
  fi
  # 安装后同时核验 package 身份、声明入口和内容指纹；不能只相信 pnpm 退出码。
  if ! node - "$PROFILE" "$MANAGED_SOURCE_ROOT" "$MANAGES_KIT" "$managed_plugins_csv" "$PLUGINS_ROOT" "$RELEASE_CHANNEL" "$alpha_plugins_csv" <<'EOF'
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const [profile, managedRoot, managesKit, pluginsCsv, pluginsRoot, releaseChannel, alphaPluginsCsv] = process.argv.slice(2)
const plugins = pluginsCsv ? pluginsCsv.split(',') : []
const alphaPlugins = alphaPluginsCsv ? alphaPluginsCsv.split(',') : []
const manifest = JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'))
const fingerprint = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const packedFiles = root => {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '--loglevel', 'silent'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim() || `exit ${result.status}`
    throw new Error(`npm pack 物化核验失败: ${root}: ${detail}`)
  }
  const records = JSON.parse(result.stdout)
  const files = Array.isArray(records) ? records.flatMap(record => record?.files || []) : []
  return files.map(item => typeof item === 'string' ? item : item?.path).filter(item => typeof item === 'string')
}
const isFile = file => {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}
const inside = (root, file) => {
  const rel = path.relative(root, file)
  return rel && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)
}
const verifyPackedFiles = (name, sourceRoot, installedRoot) => {
  for (const rel of packedFiles(sourceRoot)) {
    const sourceFile = path.resolve(sourceRoot, rel)
    const installedFile = path.resolve(installedRoot, rel)
    if (!inside(sourceRoot, sourceFile) || !inside(installedRoot, installedFile) || !isFile(sourceFile) || !isFile(installedFile)) {
      throw new Error(`已安装包打包文件缺失: ${name} → ${rel}`)
    }
    if (fingerprint(sourceFile) !== fingerprint(installedFile)) {
      throw new Error(`已安装包打包文件指纹不匹配: ${name} → ${rel}`)
    }
  }
}
const profileModules = fs.realpathSync(path.join(profile, 'node_modules'))
const isL2TaskProfile = path.basename(path.dirname(path.dirname(path.dirname(profile)))) === 'tasks'
  && path.basename(path.dirname(path.dirname(path.dirname(path.dirname(profile))))) === '.dsh-dev'
const topLevelLinks = () => fs.readdirSync(profileModules).filter(name => fs.lstatSync(path.join(profileModules, name)).isSymbolicLink())
const isCurrentL2InProgressLink = (name, installedRoot) => {
  if (!isL2TaskProfile || !fs.lstatSync(installedRoot).isSymbolicLink() || topLevelLinks().length !== 1) return false
  return fs.realpathSync(installedRoot) === fs.realpathSync(path.join(pluginsRoot, name))
}
if (releaseChannel === 'production') {
  const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : []
  const virtualStore = path.join(profileModules, '.pnpm')
  const virtualEntries = fs.existsSync(virtualStore) ? fs.readdirSync(virtualStore) : []
  for (const name of alphaPlugins) {
    if (manifest.dependencies?.[name] || bundles.includes(name)) throw new Error(`production manifest retains Alpha plugin: ${name}`)
    if (fs.existsSync(path.join(managedRoot, name))) throw new Error(`production snapshot retains Alpha plugin: ${name}`)
    if (fs.existsSync(path.join(profileModules, name))) throw new Error(`production node_modules retains Alpha plugin: ${name}`)
    if (virtualEntries.some(entry => entry === name || entry.startsWith(`${name}@`))) {
      throw new Error(`production pnpm store retains Alpha plugin: ${name}`)
    }
  }
}
if (managesKit === '1') {
  const kitSource = path.join(managedRoot, 'dsh-ui-kit')
  const kitInstalled = path.join(profile, 'node_modules', 'dsh-ui-kit')
  if (manifest.dependencies?.['dsh-ui-kit'] !== 'file:.materialize-snapshots/plugins/dsh-ui-kit') {
    throw new Error('受管 dsh-ui-kit 依赖声明错误')
  }
  if (!inside(profileModules, fs.realpathSync(kitInstalled))) {
    throw new Error('已安装 dsh-ui-kit 解析到 profile 外部')
  }
  verifyPackedFiles('dsh-ui-kit', kitSource, kitInstalled)
}
for (const name of plugins) {
  const expectedSpec = `file:.materialize-snapshots/plugins/${name}`
  if (manifest.dependencies?.[name] !== expectedSpec) {
    throw new Error(`受管依赖声明错误: ${name} = ${manifest.dependencies?.[name] ?? '(missing)'}`)
  }
  const sourceRoot = path.join(managedRoot, name)
  const installedRoot = path.join(profile, 'node_modules', name)
  if (isCurrentL2InProgressLink(name, installedRoot)) {
    const linkedPackage = JSON.parse(fs.readFileSync(path.join(installedRoot, 'package.json'), 'utf8'))
    if (linkedPackage.name !== name) throw new Error(`L2 在研 link 身份不匹配: ${name}`)
    console.log(`  ✓ 保留 L2 在研 link: ${name} → ${fs.realpathSync(installedRoot)}`)
    continue
  }
  if (!inside(profileModules, fs.realpathSync(installedRoot))) {
    throw new Error(`已安装包解析到 profile 外部: ${name}`)
  }
  const sourcePackage = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'))
  const installedPackage = JSON.parse(fs.readFileSync(path.join(installedRoot, 'package.json'), 'utf8'))
  if (installedPackage.name !== sourcePackage.name || installedPackage.version !== sourcePackage.version) {
    throw new Error(`已安装包身份不匹配: ${name}`)
  }
  const entry = typeof sourcePackage.main === 'string' ? sourcePackage.main : 'index.js'
  const sourceEntry = path.resolve(sourceRoot, entry)
  const installedEntry = path.resolve(installedRoot, entry)
  if (!inside(sourceRoot, sourceEntry) || !inside(installedRoot, installedEntry) || !isFile(sourceEntry) || !isFile(installedEntry)) {
    throw new Error(`已安装包入口缺失: ${name} → ${entry}`)
  }
  const packed = packedFiles(sourceRoot)
  verifyPackedFiles(name, sourceRoot, installedRoot)
  if (sourcePackage.dependencies?.['dsh-ui-kit'] === 'file:../dsh-ui-kit') {
    const resolvedKitPackage = require.resolve('dsh-ui-kit/package.json', { paths: [installedRoot] })
    if (!inside(fs.realpathSync(path.join(profile, 'node_modules')), resolvedKitPackage) || fingerprint(resolvedKitPackage) !== fingerprint(path.join(managedRoot, 'dsh-ui-kit', 'package.json'))) {
      throw new Error(`已安装包 dsh-ui-kit 解析错误: ${name}`)
    }
  }
  console.log(`  ✓ 已核验 ${name}@${sourcePackage.version} ${entry} + ${packed.length} 个打包文件`)
}
EOF
  then
    restore_refresh_entries
    echo "✗ profile 依赖刷新后的物化核验失败；已恢复本轮暂存的 file: 安装入口。" >&2
    exit 1
  fi
  if [ -n "$REFRESH_BACKUP_DIR" ]; then
    rm -rf "$REFRESH_BACKUP_DIR"
    REFRESH_BACKUP_DIR=""
  fi
done

echo "✅ 插件物化完成。"
