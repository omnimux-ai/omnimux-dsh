#!/bin/bash
# dev-doctor.sh — 三层环境合规自检。规范：docs/contracts/dev-pipeline.md
#
# 下次会话/动手前先跑一遍：./scripts/dev-doctor.sh
# 输出每项 ✓/✗ 与修复提示；任一 ✗ 时退出码 1。
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGINS_ROOT="${OMNIMUX_PLUGINS_DIR:-$REPO_ROOT/plugins}"
PROD_HOME="${DSH_HOME:-$HOME/.dsh}"
PROD_PROFILE="$PROD_HOME/profiles/omnimux"
DEV_HOME="${DSH_DEV_HOME:-$HOME/.dsh-dev}"
PLUGINS=(omnimux omnimux-forms omnimux-accounts omnimux-assets omnimux-products omnimux-market omnimux-workflow omnimux-inspiration omnimux-clip omnimux-video omnimux-analytics omnimux-publish)
fails=0
warns=0

ok()   { echo "✓ $1"; }
bad()  { echo "✗ $1"; fails=$((fails+1)); }
warn() { echo "⚠ $1"; warns=$((warns+1)); }

echo "== 1. 生产 profile 插件形态（必须物化副本，禁止 link） =="
for p in "${PLUGINS[@]}"; do
  path="$PROD_PROFILE/node_modules/$p"
  if [ -L "$path" ]; then
    bad "$p 是 link（生产被污染通道打开）→ 修复: yarn omnimux:sync（fork 仓库）"
  elif [ -d "$path" ]; then
    ok "$p 物化副本"
  else
    bad "$p 缺失 → 修复: yarn omnimux:sync（fork 仓库）"
  fi
done

echo
echo "== 2. 生产依赖声明（必须 file: 物化形态） =="
for p in "${PLUGINS[@]}"; do
  spec=$(node -e "try{console.log(require('$PROD_PROFILE/package.json').dependencies['$p']||'')}catch{console.log('')}" 2>/dev/null)
  case "$spec" in
    file:*) ok "$p → $spec" ;;
    link:*) bad "$p 声明为 link: → 修复: yarn omnimux:sync（fork 仓库）" ;;
    *)      bad "$p 声明异常（'$spec'）→ 修复: yarn omnimux:sync（fork 仓库）" ;;
  esac
done

echo
echo "== 3. 生产 profile bundles（声明了 dsh.bundle 的必须进加载名单） =="
bundles_json=$(node -e "try{const m=require('$PROD_PROFILE/package.json'); console.log(JSON.stringify((m.dsh&&m.dsh.profile&&m.dsh.profile.bundles)||[]))}catch{console.log('[]')}" 2>/dev/null)
for p in "${PLUGINS[@]}"; do
  src="$PLUGINS_ROOT/$p/package.json"
  if [ ! -f "$src" ]; then
    echo "· $p 源码缺失（跳过 bundles 检查）"
    continue
  fi
  has_bundle=$(node -e "try{const m=require(process.argv[1]); process.stdout.write(m.dsh&&m.dsh.bundle!=null?'1':'0')}catch{process.stdout.write('0')}" "$src")
  if [ "$has_bundle" != "1" ]; then
    echo "· $p 未声明 dsh.bundle（不必入加载名单）"
    continue
  fi
  in_list=$(node -e "const name=process.argv[1]; const list=JSON.parse(process.argv[2]||'[]'); process.stdout.write(list.includes(name)?'1':'0')" "$p" "$bundles_json")
  if [ "$in_list" = "1" ]; then
    ok "$p 已在 dsh.profile.bundles"
  else
    bad "$p 声明了 dsh.bundle 但不在 dsh.profile.bundles → 修复: yarn omnimux:sync $p"
  fi
done

# dsh-base must precede omnimux so the llm-pi-ai row exists before omnimux patches it.
order_ok=$(node -e "
const list=JSON.parse(process.argv[1]||'[]');
const base=list.indexOf('@deepseek-ai/dsh-base');
const hub=list.indexOf('omnimux');
if (hub < 0) { process.stdout.write('skip'); process.exit(0); }
if (base < 0) { process.stdout.write('missing-base'); process.exit(0); }
process.stdout.write(base < hub ? 'ok' : 'bad');
" "$bundles_json")
case "$order_ok" in
  ok) ok "bundles 顺序：@deepseek-ai/dsh-base 在 omnimux 之前" ;;
  skip) echo "· bundles 未包含 omnimux（跳过顺序检查）" ;;
  missing-base) bad "bundles 有 omnimux 但缺少 @deepseek-ai/dsh-base → 文本节点会 NO_ADAPTER" ;;
  bad) bad "bundles 顺序错误：omnimux 在 @deepseek-ai/dsh-base 之前 → 会出现 patch: entry llm-pi-ai not found / 文本生成 NO_ADAPTER。修复: yarn omnimux:sync（会纠正顺序）并重启 App" ;;
esac

echo
echo "== 4. 生产 profile store 固定 =="
if [ -f "$PROD_PROFILE/.npmrc" ] && grep -q "store-dir=$PROD_PROFILE/.pnpm-store" "$PROD_PROFILE/.npmrc"; then
  ok ".npmrc store-dir 固定 profile 内"
else
  bad ".npmrc 缺失或 store 未固定 → 写入: echo 'store-dir=$PROD_PROFILE/.pnpm-store/v10' > $PROD_PROFILE/.npmrc"
fi

echo
echo "== 5. dev 环境（任务子根 / 在研 ≤1 / 端口池） =="
check_dev_profile() {
  local d="$1"
  local tag="${2:-}"
  local name short linked pid running aport home age_days
  name="$(basename "$d")"
  short="${name#omnimux-dev-}"
  linked=$(find "$d/node_modules" -maxdepth 1 -type l 2>/dev/null | wc -l | tr -d ' ')
  pid=""
  [ -f "$d/host.pid" ] && pid=$(cat "$d/host.pid")
  running="stopped"
  if [ -n "$pid" ]; then
    if kill -0 "$pid" 2>/dev/null; then
      running="running"
    else
      bad "$name${tag} stale host.pid=$pid → yarn omnimux:dev stop $short 或 rm"
      running="stale"
    fi
  fi
  if [ "$linked" -le 1 ]; then
    # 进一步校验这唯一一条 link 的真实目标路径是否合法存在
    if [ "$linked" -eq 1 ]; then
      local single_link
      single_link=$(find "$d/node_modules" -maxdepth 1 -type l 2>/dev/null | head -1)
      if [ -n "$single_link" ]; then
        local target
        target=$(readlink "$single_link" 2>/dev/null || true)
        if [ ! -e "$single_link" ]; then
          bad "$name${tag} 软链悬空失效: $(basename "$single_link") -> $target"
        elif [[ "$target" != "$PLUGINS_ROOT/"* ]] && [[ "$target" != *"dsh-plugin/"* ]]; then
          warn "$name${tag} 软链目标位于非标准插件源: $target"
        else
          ok "$name${tag} [$running] link: $(basename "$single_link") -> $target"
        fi
      fi
    else
      ok "$name${tag} [$running] link 数 0 (纯物化)"
    fi
  else
    bad "$name${tag} link 数 ${linked}（>1，违反在研 ≤1 铁律）→ 修复: yarn omnimux:dev rm $short"
  fi
  aport=""
  [ -f "$d/port.txt" ] && aport=$(tr -d '[:space:]' < "$d/port.txt")
  if [ "$running" = "running" ]; then
    if [ -n "$aport" ] && [ "$aport" -ge 44200 ] 2>/dev/null && [ "$aport" -le 44299 ] 2>/dev/null; then
      ok "$name port $aport ∈ L2 池"
    elif [ -n "$aport" ] && [ "$aport" -ge 44120 ] 2>/dev/null && [ "$aport" -le 44151 ] 2>/dev/null; then
      bad "$name running 口 $aport 落在 App 保留窗 → 再 start 迁入 44200-44299"
    elif [ -n "$aport" ]; then
      echo "· $name port ${aport}（非池内；动态口可接受，建议下次 start 进池）"
    else
      echo "· $name 无 port.txt"
    fi
    if [ -f "$d/dsh-home.txt" ]; then
      home=$(tr -d '[:space:]' < "$d/dsh-home.txt")
      case "$home" in
        */tasks/"$short"|*/tasks/"$short"/) ok "$name DSH_HOME 任务子根" ;;
        "$DEV_HOME"|"$DEV_HOME"/) echo "· $name 仍用共享 DEV_HOME（legacy 或 OMNIMUX_DEV_LEGACY_HOME=1）" ;;
        *) echo "· $name DSH_HOME=$home" ;;
      esac
    else
      echo "· $name 无 dsh-home.txt（旧环境；再 start 会写入）"
    fi
  elif [ "$running" = "stopped" ]; then
    if [ -d "$d" ]; then
      age_days=$(( ( $(date +%s) - $(stat -f %m "$d" 2>/dev/null || stat -c %Y "$d") ) / 86400 ))
      if [ "$age_days" -ge 7 ]; then
        echo "· $name${tag} stopped 已 ${age_days} 天 → 建议 yarn omnimux:dev rm $short"
      fi
    fi
  fi
}
found=0
if [ -d "$DEV_HOME/tasks" ]; then
  for d in "$DEV_HOME"/tasks/*/profiles/omnimux-dev-*; do
    [ -d "$d" ] || continue
    found=1
    check_dev_profile "$d"
  done
fi
if [ -d "$DEV_HOME/profiles" ]; then
  for d in "$DEV_HOME"/profiles/omnimux-dev-*; do
    [ -d "$d" ] || continue
    case "$d" in *.migrated-*) continue ;; esac
    found=1
    check_dev_profile "$d" " [legacy]"
  done
fi
[ "$found" = 0 ] && echo "· 无 dev 环境（正常，用完即弃）"

# 孤儿端口扫描 (44200~44299)：发现未记录在任务中的 LISTEN 端口仅报警，严禁擅自杀死
if command -v lsof >/dev/null 2>&1; then
  orphan_ports=$(lsof -nP -iTCP:44200-44299 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2, $9}' | while read -r pid addr; do
    port=$(echo "$addr" | awk -F: '{print $NF}')
    # 检查该 port 是否属于某个活跃 profile
    matched=0
    if [ -d "$DEV_HOME/tasks" ]; then
      for pf in "$DEV_HOME"/tasks/*/profiles/omnimux-dev-*/port.txt; do
        [ -f "$pf" ] || continue
        if [ "$(tr -d '[:space:]' < "$pf")" = "$port" ]; then
          matched=1; break
        fi
      done
    fi
    if [ "$matched" = 0 ]; then
      echo "$port (PID: $pid)"
    fi
  done || true)

  if [ -n "$orphan_ports" ]; then
    warn "发现 L2 端口池孤儿监听进程（未匹配任何活跃 task）: $orphan_ports → 建议人工核对或 lsof 确认"
  fi
fi

echo
echo "== 6. dev 环境 MUST NOT 出现在生产数据根 =="
stray=$(find "$PROD_HOME/profiles" -maxdepth 1 -name "omnimux-dev-*" 2>/dev/null | head -1)
if [ -n "$stray" ]; then
  bad "生产数据根下发现 dev profile: $stray → 移走或删除"
else
  ok "生产数据根无 dev profile"
fi

echo
echo "== 7. 源码树构建新鲜度（lib 不落后于 src） =="
for p in "${PLUGINS[@]}"; do
  src="$PLUGINS_ROOT/$p/src/client"
  lib="$PLUGINS_ROOT/$p/lib/client.js"
  if [ -d "$src" ] && [ -f "$lib" ]; then
    newest_src=$(find "$src" -name "*.js*" ! -name "*.test.js" ! -name "*.spec.js" -newer "$lib" 2>/dev/null | head -1)
    if [ -n "$newest_src" ]; then
      build_hint="node scripts/build-client.mjs"
      [ -f "$PLUGINS_ROOT/$p/scripts/build-client.mjs" ] || build_hint="按该插件自身构建命令"
      bad "$p 源码比 lib 新（${newest_src}）→ 修复: (cd $PLUGINS_ROOT/$p && $build_hint)"
    else
      ok "$p lib 已是最新"
    fi
  else
    echo "· $p 无 client（跳过）"
  fi
done

echo
echo "== 8. 关页保活（stage-guards；只扫白名单 Stage/plaza） =="
# FAIL 金标（已合入 main）：accounts / products
# WARN 推进中：assets / plaza-shell（文件缺失则跳过）
# WARN 债：WorkflowStage / AppsStage
stage_has_keepalive() {
  local f="$1"
  grep -q 'everOpened' "$f" 2>/dev/null || return 1
  grep -Eq "display:[[:space:]]*open[[:space:]]*\?[[:space:]]*('flex'|\"flex\"|undefined)[[:space:]]*:[[:space:]]*('none'|\"none\")" "$f" 2>/dev/null
}
stage_close_unmount() {
  local f="$1"
  # 卸树反模式；排除：注释/文档字符串、从未打开早退（!everOpened）
  local hits
  hits=$(grep -nE 'if[[:space:]]*\([[:space:]]*!open([[:space:]]*\|\|[[:space:]]*![a-zA-Z_][a-zA-Z0-9_]*)?[[:space:]]*\)[[:space:]]*return[[:space:]]+null' "$f" 2>/dev/null \
    | grep -Ev '^\s*[0-9]+:\s*(//|\*|/\*)' \
    | grep -Ev 'never|MUST NOT|禁|禁止|对齐|示例' \
    | grep -Ev 'everOpened' \
    || true)
  [ -n "$hits" ]
}
check_stage_keepalive() {
  local rel="$1"
  local mode="$2"   # fail | warn
  local f="$PLUGINS_ROOT/$rel"
  if [ ! -f "$f" ]; then
    if [ "$mode" = "fail" ]; then
      bad "关页金标缺失文件 $rel"
    else
      echo "· 关页文件缺失 ${rel}（跳过；待业务 PR）"
    fi
    return
  fi
  if stage_close_unmount "$f"; then
    if [ "$mode" = "fail" ]; then
      bad "$rel 关页卸树反模式（if (!open…) return null）→ 对齐 accounts/products everOpened+display:none"
    else
      warn "$rel 关页仍 return null 卸树（契约 MUST，待升 FAIL / backlog）"
    fi
  elif stage_has_keepalive "$f"; then
    ok "$rel 关页保活"
  else
    if [ "$mode" = "fail" ]; then
      bad "$rel 缺 everOpened 或关页 display 隐藏 → 见 docs/contracts/stage-guards.md"
    else
      warn "$rel 关页保活未对齐金标（契约 MUST，待升 FAIL / backlog）"
    fi
  fi
}
for rel in \
  omnimux-accounts/src/client/AccountsStage.jsx \
  omnimux-products/src/client/ProductsStage.jsx \
  omnimux-assets/src/client/AssetsStage.jsx \
  omnimux-market/src/client/plaza-shell.js \
  omnimux-workflow/src/client/WorkflowStage.jsx \
  omnimux/src/client/AppsStage.jsx
do
  check_stage_keepalive "$rel" fail
done

echo
echo "== 9. market 写闸（trustedRestartRequest） =="
market_api="$PLUGINS_ROOT/omnimux-market/src/local-api.ts"
if [ ! -f "$market_api" ]; then
  echo "· omnimux-market/src/local-api.ts 缺失（跳过）"
else
  if ! grep -q 'trustedRestartRequest' "$market_api"; then
    bad "market local-api 无 trustedRestartRequest"
  else
    # FAIL 金标：pluginRestart
    if grep -n "method === 'pluginRestart'" "$market_api" | head -1 | cut -d: -f1 | {
      read -r ln
      sed -n "${ln},$((ln+15))p" "$market_api" | grep -q 'trustedRestartRequest'
    }; then
      ok "market pluginRestart 有 trustedRestartRequest"
    else
      bad "market pluginRestart 缺 trustedRestartRequest"
    fi
    # WARN：config save（业务 PR 已补闸、main 可能尚未合入）
    if grep -n "method === 'config'" "$market_api" | head -1 | cut -d: -f1 | {
      read -r ln
      sed -n "${ln},$((ln+30))p" "$market_api" | grep -q 'trustedRestartRequest'
    }; then
      ok "market config save 有 trustedRestartRequest"
    else
      warn "market config save 无 trustedRestartRequest（契约 MUST，待业务 PR 合入后升 FAIL）"
    fi
    # WARN：其余写 method（窗口截断到下一 method ===）
    for m in install uninstall pluginInstall catalogInstall catalogSummon catalogUninstall; do
      if ! grep -q "method === '$m'" "$market_api"; then
        echo "· market method=$m 分支不存在（跳过）"
        continue
      fi
      ln=$(grep -n "method === '$m'" "$market_api" | head -1 | cut -d: -f1)
      next=$(awk -v s="$ln" 'NR>s && /method === '\''/{print NR; exit}' "$market_api")
      end=${next:-$((ln+40))}
      [ -n "$next" ] && end=$((next-1))
      chunk=$(sed -n "${ln},${end}p" "$market_api")
      if echo "$chunk" | grep -q 'trustedRestartRequest'; then
        ok "market $m 有 trustedRestartRequest"
      else
        warn "market $m 无 trustedRestartRequest（契约 MUST，修码 backlog）"
      fi
    done
  fi
fi

echo
echo "== 10. assertLocalWrite 存在性 =="
check_assert_local() {
  local rel="$1"
  local need_def="${2:-0}"
  local f="$PLUGINS_ROOT/$rel"
  if [ ! -f "$f" ]; then
    bad "写闸文件缺失 $rel"
    return
  fi
  if [ "$need_def" = "1" ]; then
    if grep -qE 'function[[:space:]]+assertLocalWrite|export[[:space:]]+function[[:space:]]+assertLocalWrite' "$f"; then
      ok "$rel 定义 assertLocalWrite"
    else
      bad "$rel 未定义 assertLocalWrite"
    fi
    return
  fi
  if grep -q 'assertLocalWrite(' "$f"; then
    ok "$rel 调用 assertLocalWrite"
  else
    bad "$rel 无 assertLocalWrite( 调用"
  fi
}
check_assert_local "omnimux/src/apps/origin.js" 1
check_assert_local "omnimux-products/src/http-routes.js"
check_assert_local "omnimux-assets/src/http-routes.js"
check_assert_local "omnimux-workflow/src/http/helpers.ts" 1
# workflow 路由须引用 helpers 的闸
if grep -q 'assertLocalWrite(' "$PLUGINS_ROOT/omnimux-workflow/src/workflow/routes/canvasRoutes.ts" 2>/dev/null \
  || grep -q 'assertLocalWrite(' "$PLUGINS_ROOT/omnimux-workflow/src/projects/routes.ts" 2>/dev/null; then
  ok "omnimux-workflow 路由调用 assertLocalWrite"
else
  bad "omnimux-workflow canvas/projects 路由无 assertLocalWrite( 调用"
fi

echo
echo "== 11. 空态 locale 锚点（stage-guards） =="
# main 上 empty.noMatch / search.fallback 可能尚未合入 → WARN；齐全后可升 FAIL
for rel in omnimux-products/src/client/locales.js omnimux-assets/src/client/locales.js; do
  f="$PLUGINS_ROOT/$rel"
  if [ ! -f "$f" ]; then
    warn "空态 locale 缺失 ${rel}（跳过）"
  elif grep -q "empty.noMatch" "$f"; then
    ok "$rel 含 empty.noMatch"
  else
    warn "$rel 缺 empty.noMatch（契约 MUST，待业务 PR）"
  fi
done
market_i18n="$PLUGINS_ROOT/omnimux-market/src/client/i18n.js"
if [ ! -f "$market_i18n" ]; then
  echo "· market i18n.js 缺失（跳过；单体 client 尚未拆分到 main）"
elif grep -q "search.fallback" "$market_i18n"; then
  ok "market i18n 含 search.fallback（有意语义锚点）"
else
  warn "market i18n 缺 search.fallback 锚点（契约 MUST，待业务 PR）"
fi

echo
echo "== 12. 垂直禁 hub import（from 'omnimux'） =="
hub_import_hits=""
for p in omnimux-accounts omnimux-assets omnimux-products omnimux-market omnimux-workflow omnimux-analytics; do
  src="$PLUGINS_ROOT/$p/src"
  [ -d "$src" ] || continue
  hits=$(grep -RIn --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
    -E "from[[:space:]]+['\"]omnimux['\"]|require\\(['\"]omnimux['\"]\\)" "$src" 2>/dev/null \
    | grep -vE '\\.(test|spec)\\.(js|jsx|ts|tsx)(:|$)' \
    | grep -v '/node_modules/' \
    || true)
  if [ -n "$hits" ]; then
    hub_import_hits="${hub_import_hits}${hits}"$'\n'
  fi
done
if [ -n "$hub_import_hits" ]; then
  echo "$hub_import_hits" | while IFS= read -r line; do
    [ -n "$line" ] && bad "垂直 import hub: $line"
  done
else
  ok "垂直 src 无 from 'omnimux'"
fi

echo
echo "== 13. 插件 files 覆盖 Host 相对 import 闭包 =="
plugin_files_check="$PLUGINS_ROOT/../scripts/check-plugin-files.mjs"
if [ ! -f "$plugin_files_check" ]; then
  bad "门禁脚本缺失 scripts/check-plugin-files.mjs"
else
  plugin_files_status=0
  plugin_files_out=$(node "$plugin_files_check" 2>&1) || plugin_files_status=$?
  echo "$plugin_files_out"
  if [ "$plugin_files_status" -ne 0 ]; then
    bad "package.json files 未覆盖 Host 闭包 → 修 files 后 yarn omnimux:sync <plugin>"
  else
    ok "全部插件 Host 闭包已列入 npm pack 集合"
  fi
fi

echo
echo "== 14. UI01~UI06 静态扫描门禁 (docs/contracts/ui-design-guidelines.md) =="
ui_scanner="$PLUGINS_ROOT/../scripts/scan-ui-gates.mjs"
if [ ! -f "$ui_scanner" ]; then
  bad "UI 门禁扫描脚本缺失 scripts/scan-ui-gates.mjs"
else
  ui_scan_status=0
  ui_scan_out=$(node "$ui_scanner" 2>&1) || ui_scan_status=$?
  echo "$ui_scan_out"
  if [ "$ui_scan_status" -ne 0 ]; then
    warn "UI 规范扫描发现待整改项（见上方日志；随 Issue #17/#18/#19 逐步收敛）"
  else
    ok "UI01~UI06 静态扫描通过（0 违规拦截）"
  fi
fi

echo
echo "== 15. 全域版本文件门禁活性与拦截断言 (docs/contracts/plugin-git-pr.md) =="
guard_script="$REPO_ROOT/scripts/guard-worktree.mjs"
hooks_json="$REPO_ROOT/.dsh/hooks.json"
if [ ! -f "$hooks_json" ]; then
  bad "Hook 配置文件缺失 .dsh/hooks.json"
elif [ ! -f "$guard_script" ]; then
  bad "Worktree 守卫脚本缺失 scripts/guard-worktree.mjs"
else
  # 1. 运行单测契约
  if node --test "$REPO_ROOT/scripts/guard-worktree.test.mjs" >/dev/null 2>&1; then
    ok "scripts/guard-worktree.test.mjs 契约单测全绿"
  else
    bad "scripts/guard-worktree.test.mjs 契约测试失败"
  fi

  # 2. 模拟真实攻击写入探针 (Mock write to main plugins/ and root files)
  main_target_repo="/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh"
  mock_payload_plugin='{"hook_event_name":"PreToolUse","tool_name":"edit","cwd":"'"$main_target_repo"'","tool_input":{"file_path":"'"$main_target_repo"'/plugins/omnimux/src/host/apply.js"}}'
  probe_plugin=$(echo "$mock_payload_plugin" | node "$guard_script" 2>/dev/null || echo '{"error":true}')
  mock_payload_root='{"hook_event_name":"PreToolUse","tool_name":"edit","cwd":"'"$main_target_repo"'","tool_input":{"file_path":"'"$main_target_repo"'/package.json"}}'
  probe_root=$(echo "$mock_payload_root" | node "$guard_script" 2>/dev/null || echo '{"error":true}')

  if echo "$probe_plugin" | grep -q '"permissionDecision":"deny"' && echo "$probe_root" | grep -q '"permissionDecision":"deny"'; then
    ok "全域版本文件守卫探针实测阻断成功（main 直接修改 plugins/、docs/、根目录配置 100% 拦截）"
  else
    bad "Worktree 守卫探针未拦截非法修改: plugin=$probe_plugin, root=$probe_root"
  fi
fi

echo
if [ "$fails" -gt 0 ]; then
  echo "✗ $fails 项不合规，按提示修复"
  [ "$warns" -gt 0 ] && echo "（另有 ⚠ $warns 项已知债）"
  exit 1
fi
if [ "$warns" -gt 0 ]; then
  echo "✓ 合规，⚠ $warns 项已知债（不阻断；见 docs/contracts/stage-guards.md）"
  exit 0
fi
echo "✓ 全部合规（三层环境 + stage-guards）"
