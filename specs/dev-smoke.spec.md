# 物化后自动冒烟 + 版本时差检测（Issue #3092）

## 目标

消除「修复已物化但开发版运行旧代码，用户先发现」的断点：每次 `worktree.sh ship`/`auto_materialize_and_reload` 物化成功后自动跑一次 `dev-smoke`，确认运行中的 Dev 应用窗口真实可达且版本生效；不一致时给「重启提示」，不自动重启。

## 现状

- `auto_materialize_and_reload` 物化后调 `reload-dev-app.mjs`（纯 client→Page.reload，宿主侧→受控重启），失败被 `|| true` 吞掉，无验证。
- 已发生案例（10-04 日志）：补丁物化 40 余分钟后 Dev 仍报旧错——后台进程早于物化启动，`|| true` 静默。
- Dev 应用 CDP 调试口 `127.0.0.1:9229` 存在且可列页面（`http://127.0.0.1:45120/`）。

## 改动范围

1. 新增 `scripts/dev-smoke.mjs`：
   - 输入：`--plugins <name1,name2>`（本次物化的插件，可选）、`--range <base..target>`（用于提示文案，可选）、`--expect-restart`（宿主侧变更，可选）。
   - 步骤：① `GET /json` 取 CDP targets → 无目标 = `BLOCKED`（应用未运行/调试口未开）；② 找 `type:'page'` 且 url 含 `:45120` → `Runtime.evaluate` 探活（`document.title` + `body.innerText.length > 0`）→ `Page.captureScreenshot` 落盘；③ 版本时差：对每个 `--plugins`，比对 `~/.omnimux-dev/profiles/omnimux/node_modules/<plugin>/package.json` 的 mtime 与 Dev 主进程 `lstart`（`ps -p <pid> -o lstart=`）：mtime ≤ 进程启动 → `fresh`；mtime > 进程启动 → `needs-restart`。
   - 输出：`docs/evidence/dev-smoke-report.json` + `docs/evidence/dev-smoke-<runId>/dev-page.png`；退出码：PASS=0 / FAIL=1 / needs-restart=0（附 `needsRestart:true` + 提示）/ BLOCKED=2。
   - 依赖注入：`createDevSmoke({io, fetchImpl, spawnImpl, psImpl, now, uuid})` 便于单测。
2. `scripts/worktree.sh`：在 `auto_materialize_and_reload` 物化成功后调用 `node scripts/dev-smoke.mjs --plugins ${changed_plugins} ${needs_restart:+--expect-restart}`；失败打印醒目 ⚠️ + 报告路径，不阻断 ship。
3. `scripts/dev-smoke.test.mjs`：注入桩覆盖——CDP 无目标→BLOCKED、页面探活成功+插件 mtime 早于进程→PASS、mtime 晚于进程→needs-restart、截图写入。

## 命令

- `node scripts/dev-smoke.mjs --plugins omnimux-assets`
- 测试：`node --test scripts/dev-smoke.test.mjs`

## 边界

- 绝不自动重启应用（红线）；needs-restart 只生成提示。
- CDP 只读：不写 localStorage、不提交表单、不触发业务动作。
- 无 `--plugins` 时只做「Dev 可达+页面健康」冒烟，不做版本时差判断。

## 成功标准

- 物化后真实跑一次，PASS 时报告含 cdp/page/geometry/screenshot 断言；needs-restart 场景输出明确提示；
- 全部测试绿；`git diff --check` clean；不影响既有 ship 流程。