#!/bin/bash
# omnimux-env.sh — omnimux-dsh 统一 Node / pnpm 解析器（可 source 或独立跑）
#
# 背景：在 DSH Desktop 会话里跑 `pnpm`/`npm`/`node` 时，PATH 第一位常被 DSH
# Desktop 注入为其 `runtime-commands/bin`（一个 `ELECTRON_RUN_AS_NODE` 垫片），
# 导致任何 `pnpm`/`node` 都 exec 成 DSH 主二进制，并以 GUI App 方式启动 ——
# 表现为屏幕上一排图标疯狂闪烁 + 反复的 `did-become-active` 前台激活循环。
#
# 本脚本把 node 解析到真实 Node
# （优先 OMNIMUX_NODE_BIN / $NVM_BIN，剔除 Yarn xfs 临时 node、DSH shim），
# 剔除 PATH 中的 DSH `runtime-commands/bin`，并导出真实可执行路径：
#   OMNIMUX_NODE   —— 真实 node
#   OMNIMUX_PNPM   —— 经 corepack 解析的 pnpm（遵循 packageManager: pnpm@11.x）
# 这样 package.json 里的 `pnpm` 调用始终走到本工作区自身的 Node/pnpm，而不是
# DSH 的 GUI 化垫片 —— 不再闪烁，且在 dsh-desktop 与 omnimux-desktop-fork 通用。
#
# 用法：
#   source scripts/omnimux-env.sh            # 在当前 shell 设置 PATH 与变量
#   bash scripts/omnimux-env.sh              # 直接打印解析结果（自检）
set -euo pipefail

# ---- 解析真实 node ----
resolve_node_bin() {
  local candidate
  if [ -n "${OMNIMUX_NODE_BIN:-}" ] && [ -x "$OMNIMUX_NODE_BIN" ]; then
    printf '%s\n' "$OMNIMUX_NODE_BIN"
    return 0
  fi
  if [ -n "${NVM_BIN:-}" ] && [ -x "$NVM_BIN/node" ]; then
    printf '%s\n' "$NVM_BIN/node"
    return 0
  fi
  candidate="$(command -v node 2>/dev/null || true)"
  case "$candidate" in
    */xfs-*/node|*/xfs-*/nodejs) candidate="" ;;
  esac
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf '%s\n' node
}

NODE_BIN="$(resolve_node_bin)"
NODE_DIR="$(dirname "$NODE_BIN")"

# ---- 剔除 DSH `/runtime-commands` 垫片目录，重建 PATH，首位放真实 node ----
CLEAN_PATH="$NODE_DIR"
OLD_IFS="$IFS"
IFS=':'
for path_entry in ${PATH:-}; do
  case "$path_entry" in
    */xfs-*) continue ;;
    */DSH\ Desktop/runtime-commands*|*/DSH\ Desktop/*/runtime-commands*) continue ;;
  esac
  [ -n "$path_entry" ] && CLEAN_PATH="$CLEAN_PATH:$path_entry"
done
IFS="$OLD_IFS"
export PATH="$CLEAN_PATH"

# ---- 解析真实 pnpm（经 corepack，遵循 packageManager: pnpm@11.x）----
# 优先用已真实化的 node 自带的 corepack；没有则回落到 command -v pnpm。
if [ -x "$NODE_DIR/corepack" ]; then
  OMNIMUX_PNPM="$NODE_DIR/corepack"
  OMNIMUX_PNPM_PREFIX="pnpm"        # corepack pnpm ...
elif command -v corepack >/dev/null 2>&1; then
  OMNIMUX_PNPM="$(command -v corepack)"
  OMNIMUX_PNPM_PREFIX="pnpm"
else
  OMNIMUX_PNPM="$(command -v pnpm || true)"
  OMNIMUX_PNPM_PREFIX=""
fi

export OMNIMUX_NODE="$NODE_BIN"
export OMNIMUX_PNPM
export OMNIMUX_PNPM_PREFIX

# pnpm 会对"刚发布的依赖"做最小发布年龄校验（minimumReleaseAge）。DSH 的 pnpm shim
# 用 `--config.minimumReleaseAge=0` 豁免它；这里保持一致，避免 corepack 真实 pnpm
# 因新版 lockfile 刚提交而被 ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION 拦下。
export OMNIMUX_PNPM_MINIMUM_RELEASE_AGE=0

# 让被 source 的 shell 里 `pnpm`/`npm`/`node` 都走真实路径
alias node="$NODE_BIN" 2>/dev/null || true

# ---- 自检模式：直接运行则打印解析结果 ----
if [ "${BASH_SOURCE[0]:-}" = "${0:-}" ]; then
  printf 'OMNIMUX_NODE=%s\n' "$NODE_BIN"
  printf 'OMNIMUX_PNPM=%s\n' "$OMNIMUX_PNPM"
  printf 'OMNIMUX_PNPM_PREFIX=%s\n' "$OMNIMUX_PNPM_PREFIX"
  printf 'OMNIMUX_PNPM_MINIMUM_RELEASE_AGE=%s\n' "$OMNIMUX_PNPM_MINIMUM_RELEASE_AGE"
  printf 'PATH=%s\n' "$PATH"
fi
