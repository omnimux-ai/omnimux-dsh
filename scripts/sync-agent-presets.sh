#!/usr/bin/env bash
# sync-agent-presets.sh — 把 OmniMux 出厂四项 Agent Preset 物化进运行时
#
# 默认（无参数 / yarn sync:presets / sync-to-app 不带 target）：
#   只改 OmniMux Dev.app + ~/.omnimux-dev
# 可选（显式加参，默认不是 --all）：
#   --prod     → 再改 OmniMux.app + ~/.omnimux
#   --dsh      → 只碰 ~/.dsh/profiles/omnimux*（不写 DSH Desktop.app，不清用户预设）
#   --all      → Dev + Prod + ~/.dsh/omnimux*（仍不写 DSH Desktop.app，仍不清用户预设）
#
# 硬边界：
# - 永不写入 /Applications/DSH Desktop.app
# - 永不改写 ~/.dsh/.agent-presets（用户花名册：dsh-plugin-team / software-company 等）
# - 写入 ~/.dsh/profiles 时只碰 omnimux*，跳过 desktop / web
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/resolve-omnimux-profile.sh"
SRC="$ROOT/presets"
KEEP=(tiktok-agent standard daily-work cordis content-creation-team)

if [ ! -d "$SRC/tiktok-agent" ] || [ ! -d "$SRC/standard" ] || [ ! -d "$SRC/daily-work" ] || [ ! -d "$SRC/cordis" ] || [ ! -d "$SRC/content-creation-team" ]; then
  echo "❌ presets/ 缺少出厂预设 (tiktok-agent, standard, daily-work, cordis, content-creation-team)" >&2
  exit 1
fi

TARGET_SELECTION=()
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
    *)
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

HAS_DEV=0
HAS_PROD=0
HAS_DSH=0

if [ ${#TARGET_SELECTION[@]} -eq 0 ]; then
  add_target_home "$HOME/.omnimux-dev"
  HAS_DEV=1
else
  for item in "${TARGET_SELECTION[@]}"; do
    case "$item" in
      all|broadcast)
        add_target_home "$HOME/.omnimux-dev"
        add_target_home "$HOME/.omnimux"
        add_target_home "$HOME/.dsh"
        HAS_DEV=1
        HAS_PROD=1
        HAS_DSH=1
        ;;
      dev|omnimux-dev)
        add_target_home "$HOME/.omnimux-dev"
        HAS_DEV=1
        ;;
      prod|omnimux|omnimux-prod)
        add_target_home "$HOME/.omnimux"
        HAS_PROD=1
        ;;
      dsh|dsh-desktop)
        # 只允许碰 ~/.dsh 下的 omnimux* profile；绝不写 DSH Desktop.app / 用户预设根
        add_target_home "$HOME/.dsh"
        HAS_DSH=1
        ;;
      /*|"~"|"~/"*)
        expanded_path=$(expand_omnimux_sync_target_home "$item") || exit 1
        add_target_home "$expanded_path"
        ;;
    esac
  done
fi

is_omnimux_profile() {
  local home="$1"
  local base
  base=$(basename "$home")
  case "$base" in
    omnimux|omnimux-*) return 0 ;;
    *) return 1 ;;
  esac
}

# ~/.dsh 是共享 Host 家：其中 desktop/web 是 DSH 开发工具 profile，禁止物化社媒两项覆盖。
should_materialize_profile() {
  local profile_home="$1"
  local base
  base=$(basename "$profile_home")
  if [ "$base" = "node_modules" ] || [[ "$base" == .* ]]; then
    return 1
  fi
  local home_dir
  home_dir=$(dirname "$(dirname "$profile_home")")
  if [ "$home_dir" = "$HOME/.dsh" ]; then
    is_omnimux_profile "$profile_home"
    return $?
  fi
  return 0
}

materialize_into() {
  local dest="$1"
  if [ ! -d "$dest" ]; then
    echo "· skip missing $dest"
    return 0
  fi
  echo "==> 物化 Agent Presets → $dest"
  for child in "$dest"/*; do
    [ -e "$child" ] || continue
    base=$(basename "$child")
    keep=0
    for k in "${KEEP[@]}"; do
      if [ "$base" = "$k" ]; then keep=1; break; fi
    done
    if [ "$keep" -eq 0 ]; then
      rm -rf "$child"
      echo "  - removed $base"
    fi
  done
  for k in "${KEEP[@]}"; do
    rm -rf "$dest/$k"
    mkdir -p "$dest/$k"
    cp -R "$SRC/$k/." "$dest/$k/"
    echo "  + synced $k"
  done
}

# 1) profiles under target homes that vendor @deepseek-ai/dsh
shopt -s nullglob
for home_dir in "${TARGET_HOMES[@]}"; do
  if [ -d "$home_dir" ] && [ "$home_dir" != "$HOME/.dsh" ]; then
    mkdir -p "$home_dir/agent-presets-shipped"
    materialize_into "$home_dir/agent-presets-shipped"
  fi

  for profile_home in "$home_dir/profiles"/*; do
    [ -d "$profile_home" ] || continue
    if ! should_materialize_profile "$profile_home"; then
      echo "· skip non-omnimux profile under ~/.dsh: $profile_home"
      continue
    fi
    dest="$profile_home/node_modules/@deepseek-ai/dsh/config/agent-presets"
    materialize_into "$dest"
    mkdir -p "$profile_home/agent-presets-shipped"
    materialize_into "$profile_home/agent-presets-shipped"
  done
done

# 2) OmniMux App unpacked preset folders + asar headers + Plist integrity sync — never DSH Desktop.app
patch_asar_preset_header() {
  local asar="$1"
  local unpacked="$2"
  [ -f "$asar" ] && [ -d "$unpacked" ] || return 0
  echo "==> 同步 Asar Header 与 Info.plist 完整性哈希: $asar"
  ELECTRON_NO_ASAR=1 node "$ROOT/scripts/patch-asar-agent-presets.mjs" "$asar" "$unpacked" || echo "· asar header patch failed for $asar"
}

if [ "$HAS_DEV" -eq 1 ]; then
  materialize_into "/Applications/OmniMux Dev.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/config/agent-presets"
  materialize_into "/Applications/OmniMux Dev.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-agent-presets/presets"
  if [ -d "/Applications/OmniMux Dev.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-agent-presets/presets" ]; then
    patch_asar_preset_header "/Applications/OmniMux Dev.app/Contents/Resources/app.asar" "/Applications/OmniMux Dev.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-agent-presets/presets"
  else
    patch_asar_preset_header "/Applications/OmniMux Dev.app/Contents/Resources/app.asar" "/Applications/OmniMux Dev.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/config/agent-presets"
  fi
fi

if [ "$HAS_PROD" -eq 1 ]; then
  materialize_into "/Applications/OmniMux.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/config/agent-presets"
  materialize_into "/Applications/OmniMux.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-agent-presets/presets"
  if [ -d "/Applications/OmniMux.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-agent-presets/presets" ]; then
    patch_asar_preset_header "/Applications/OmniMux.app/Contents/Resources/app.asar" "/Applications/OmniMux.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-agent-presets/presets"
  else
    patch_asar_preset_header "/Applications/OmniMux.app/Contents/Resources/app.asar" "/Applications/OmniMux.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/config/agent-presets"
  fi
fi

if [ "$HAS_DSH" -eq 1 ]; then
  echo "· --dsh：只物化 ~/.dsh/profiles/omnimux*；跳过 DSH Desktop.app 与 ~/.dsh/.agent-presets"
fi

# 3) OmniMux profile patch only — never rewrite desktop/web includeUserRoot
patch_profile() {
  local patch="$1"
  [ -f "$patch" ] || return 0
  if grep -q "id: agent-presets" "$patch" 2>/dev/null; then
    echo "· $patch 已含 agent-presets，跳过自动改写"
    return 0
  fi
  if grep -qE '^\[\]\s*$' "$patch"; then
    cat > "$patch" <<'YAML'
# Product defaults for the OmniMux desktop profile. Edit freely.
# Applied after every bundle layer. Do not put API keys here.

# OmniMux 出厂会话预设：tiktok-agent (TikTokAgent) + standard (代码开发) + daily-work (日常工作) + cordis (组建团队)
- id: agent-presets
  config:
    default: tiktok-agent
    includeUserRoot: false
YAML
    echo "  ✓ wrote agent-presets patch → $patch"
  else
    cat >> "$patch" <<'YAML'

# OmniMux 出厂会话预设：tiktok-agent (TikTokAgent) + standard (代码开发) + daily-work (日常工作) + cordis (组建团队)
- id: agent-presets
  config:
    default: tiktok-agent
    includeUserRoot: false
YAML
    echo "  ✓ appended agent-presets patch → $patch"
  fi
}

for home_dir in "${TARGET_HOMES[@]}"; do
  for patch in "$home_dir/profiles"/*/cordis.patch.yml; do
    [ -f "$patch" ] || continue
    profile_home=$(dirname "$patch")
    if ! should_materialize_profile "$profile_home"; then
      echo "· skip patch for non-omnimux profile: $patch"
      continue
    fi
    patch_profile "$patch"
  done
done

echo "✅ OmniMux Agent Presets 物化完成。请重启对应 OmniMux Host（不要指望本脚本改 DSH Desktop 用户预设）。"
