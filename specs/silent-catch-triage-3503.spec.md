# 静默吞错存量分诊：先止血假成功与凭据残留（Issue #3503）

- 关联 Issue：#3503（type: chore / plugin: common / track: D / risk: R1）
- 关联合同：[anti-agent-fake-completion-guard §1.1、§3.2.1](../docs/contracts/anti-agent-fake-completion-guard.md)、[plugin-git-pr](../docs/contracts/plugin-git-pr.md)
- 前置：PR #3492（已合入 main `914d80f9b`）只做**增量**静默兜底拦截；本任务只做存量**分诊与止血**，不清零。

## 目标

1. **止血假成功**：`plugins/omnimux-market/src/local-api.ts` 的 `handleHomeCustomOrder` POST 写接口在写盘失败时仍返回 `200 { ok: true }`，改为返回 5xx + 可读错误。
2. **止血凭据残留**：`plugins/omnimux/src/auth/store.js` 的 `unsetSecrets()` / `unsetConfig()` 整体被空 catch 包住，删除/原子写失败时 token 仍留在磁盘却向上报告登出成功；改为 warn 留痕并向上回传失败（登出路由因此返回 5xx，而不是假成功）。
3. **P1 收敛**：`plugins/omnimux/src/client/sidebar-toggle-topbar.js` 内 41 处 `catch {}` / `catch { /* ignore */ }` 收敛为 `safeDom(fn, fallback)` helper，文件内 SC1/SC2 命中归零，可观察行为不变。
4. **存量基线可复现**：以 `node scripts/verify-silent-catch.mjs --json` 自报数为唯一基线并登记 Issue 评论。

## 范围

| 文件 | 改动 |
|---|---|
| `plugins/omnimux-market/src/local-api.ts` | 写盘失败 → 500；抽 `persistHomeCustomOrder(configPath, order)`；测试接缝 `setHomeOrderConfigPathForTests` |
| `plugins/omnimux-market/lib/local-api.js` | 上述 TS 的构建产物（仓库跟踪） |
| `plugins/omnimux-market/src/tests/home-order-write.test.ts` | 新增：成功 / 损坏 JSON / 只读目录 / 缺文件四类可观察结果 |
| `plugins/omnimux/src/auth/store.js` | `logger` 注入、`unsetConfig`/`unsetSecrets` 留痕并回传、`unset()` 聚合失败后抛错 |
| `plugins/omnimux/src/auth/store.test.js` | 新增：`rmSync` 失败可观察 warn + `unset()` reject；正常路径不回归 |
| `plugins/omnimux/src/client/sidebar-toggle-topbar.js` | 41 处 catch → `safeDom` helper；文件 SC1/SC2 = 0；不改变导出面与可观察行为 |
| `plugins/omnimux/src/client/sidebar-toggle-topbar.e2e.test.js` | 新增：DOM 操作抛错时安装/触发/清理仍完成（jsdom 真实 DOM 语义） |
| `docs/evidence/silent-catch-triage-3503/` | 基线 + 真实内核 QA + 测试结果证据 |
| `specs/silent-catch-triage-3503.spec.md` | 本规格 |

## 非目标

- 不清零 685 处存量；不设「685→0」KPI。
- 不动 SC3（有语句无痕迹）881 处（本任务后为 882）。
- 不批量改 C 档 client best-effort catch 的语义；不新增豁免条目替代真实修复。
- 不改 `auth/store.js` 的读侧容错（json 解析、stat、chmod、legacy 缓存、seam 探测）与 `set()` 的 credentials 镜像 best-effort。
- 不改 market 写接口除错误上报外的业务逻辑（含 POST `order: []` 仍不落盘的既有语义，另立 Issue 跟进）。
- 不对 `:167`、`:229` 做写路径改造：当前 main 上这两行分别是 host 通知镜像（best-effort）与评分读取，不是同类的持久化写路径。

## 新用户基线

- market 写接口：普通安装目录（可能只读）。写失败时必须返回 5xx + 错误，不再把未落盘报告为成功；只读/缺文件/损坏 JSON 都是显式失败，不依赖任何开发机私有状态。
- auth 登出：只依赖 `$HOME/.config/omnimux/`（或测试注入目录）。清理失败时留 `warn` 并让登出请求 5xx；不把「token 仍在磁盘」报告为登出成功。
- sidebar：纯 DOM best-effort，宿主结构缺失时静默降级并保持页面可操作（与改动前一致），不依赖 Dev 端口、本地模型或开发 profile。

## 假设

1. `handleHomeCustomOrder` 的假成功根因是 `catch {}` 吞掉 `readFileSync`/`JSON.parse`/`writeFileSync` 的异常后无条件 `200`；把写盘收敛进会抛错的 `persistHomeCustomOrder` 并映射为 5xx 即可消除。
2. `unsetSecrets`/`unsetConfig` 的凭据残留根因是空 catch 让 `rmSync`/`atomicWriteFileSync` 失败对调用方不可见；warn 留痕 + `unset()` 聚合失败并 reject，会让登出路由（已有 `catch → 500`）如实返回失败。
3. `sidebar-toggle-topbar.js` 的 41 处 catch 属同一类 DOM best-effort（探测/注入/移除/监听解绑），收敛为统一 helper 不改变任何可观察行为，且真实内核几何/交互与改动前一致。

## 证伪方式

1. 用损坏 JSON 或只读目录调用 market POST：若仍返回 `200 ok:true`（或响应缺错误信息），假设 1 被证伪。验证命令：`pnpm --filter omnimux-market test`（含 `home-order-write.test.ts`）。
2. 把 `secrets.json` 变成目录、或把配置目录设为只读后调用 `store.unset()`：若 promise 正常 resolve 且无 warn，或 token 仍可被 `resolve()` 读出而调用方无感，假设 2 被证伪。验证命令：`pnpm --filter omnimux test`（含 `store.test.js` 新用例）。
3. 对改动后的 sidebar 文件跑 `node scripts/verify-silent-catch.mjs --json`，若该文件 SC1/SC2 > 0 则 P1 假设部分证伪；再跑 jsdom e2e、真实内核 `node scripts/three-column-collapse-qa.mjs` 与 `pnpm verify:stages`，任一失败即行为不变假设被证伪。

## 验收

- [ ] market 写失败（损坏 JSON / 只读目录 / 缺 catalog）返回 5xx 且 `ok:false`；成功路径仍返回 200 并真实落盘。
- [ ] auth 清理失败可观察到 warn，且 `store.unset()` reject；http 登出路由返回 5xx 而非 200。
- [ ] `sidebar-toggle-topbar.js` 的 SC1/SC2 命中数 = 0（SC3 helper 内部允许）。
- [ ] `node scripts/verify-silent-catch.mjs --json` 基线数字（改动前后）记录到 Issue #3503 评论。
- [ ] 未新增任何 SC1/SC2（`scripts/lib/silent-catch-delta.mjs` 对改动文件返回 0 新增）。
- [ ] 隔离 worktree 内真实内核 QA（`scripts/three-column-collapse-qa.mjs`）通过并留存 PNG/JSON；新增 jsdom e2e。

## 存量基线（main `d2d54d177`，本任务记录）

| 口径 | 数量 |
|---|---|
| SC1 空 catch | 242 |
| SC2 仅注释 catch | 444 |
| 确证合计 | 686 |
| SC3 有语句无痕迹（疑似） | 882 |

Issue 正文的 685 / 881 采集于 `914d80f9b`；其后 #3496/#3499 等合入使 SC2 +1、SC3 +1，属正常漂移，本任务以现基线为准并记录到 Issue 评论。

## 文档影响

不新增合同条款；`anti-agent-fake-completion-guard` §3.2.1 的增量口径不变。本任务的分诊结论、基线漂移和残留项写入本规格 + Issue #3503 评论，作为存量治理的可追溯记录。

## 检查命令

- `node scripts/verify-silent-catch.mjs --json`（基线/归零核对）
- `pnpm --filter omnimux-market build && pnpm --filter omnimux-market test`
- `pnpm --filter omnimux test`
- `node --test scripts/verify-silent-catch.test.mjs scripts/lib/silent-catch-delta.test.mjs`
- `node scripts/impact-matrix.mjs --git-diff --base origin/main`
- `pnpm verify:product-baseline`
- `pnpm verify:stages` + `node --test scripts/verify-anti-slop.test.mjs`
- `node scripts/three-column-collapse-qa.mjs`（真实内核，工作树内动态端口、测完即焚）
- `git diff --check`
