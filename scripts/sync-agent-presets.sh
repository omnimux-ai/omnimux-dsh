#!/usr/bin/env bash
# sync-agent-presets.sh — validate the shipped agent-preset roster (no writes).
#
# Since dsh 0.2.1-rc.3 every preset is a Loader declaration carried by the
# profile, and the shipped roster reaches the app through the packaged preset
# (`preset/agent-presets`) that `stage-preset-profile.ts` writes. Nothing reads
# the directories this script used to fill, and the asar header patch it used to
# apply invalidated the installed app's signature — so the materialization is
# gone and only the roster check remains.
#
# `KEEP` / `LEGACY_ALIASES` stay here on purpose: `presets/README.md` makes this
# list the registration point of the permanent-legacy-tombstone contract, and
# `scripts/verify-agent-presets.test.mjs` asserts both lists verbatim.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/presets"
KEEP=(cordis omni-agent tiktok-agent instagram-agent x-agent youtube-agent viral-video-agent ad-creative-agent)
LEGACY_ALIASES=(media-creator marketing-agent daily-work standard marketing-growth-team drama-agent)
ALL_PRESETS=("${KEEP[@]}" "${LEGACY_ALIASES[@]}")

if [ ! -d "$SRC/omni-agent" ] && [ ! -d "$SRC/tiktok-agent" ]; then
  echo "❌ presets/ 缺少出厂预设 (omni-agent 或 tiktok-agent)" >&2
  exit 1
fi

# `--target` / OMNIMUX_SYNC_TARGETS are accepted for callers (sync-to-app.sh
# still forwards them) and deliberately ignored: the profile needs no patch.
TARGET_FLAGS=()
for argument in "$@"; do
  case "$argument" in
    --target=*|--target)
      TARGET_FLAGS+=("$argument")
      ;;
    --prod|--all|--dsh|--skip-build)
      # Accepted from sync-to-app.sh; this script no longer writes anywhere.
      ;;
    *)
      echo "· 忽略未知参数: $argument" >&2
      ;;
  esac
done

missing=()
for preset in "${ALL_PRESETS[@]}"; do
  if [ ! -f "$SRC/$preset/preset.yml" ] || [ ! -f "$SRC/$preset/agent.cordis.yml" ]; then
    missing+=("$preset")
  fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "❌ presets/ 缺少预定义文件: ${missing[*]}" >&2
  exit 1
fi

if [ "${#TARGET_FLAGS[@]}" -gt 0 ]; then
  echo "· --target 已废弃并被忽略：预设随安装包分发，不再写入目标 home" >&2
fi

echo "✅ 出厂预设清单校验通过：${#KEEP[@]} 项主力 + ${#LEGACY_ALIASES[@]} 项历史兼容别名。"
echo "ℹ️ rc.3 起预设由打包期 preset/agent-presets 与壳侧声明承担；本脚本不再写盘。"
