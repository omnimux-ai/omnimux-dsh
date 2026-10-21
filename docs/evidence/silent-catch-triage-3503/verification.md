# Issue #3503 集成验收证据（Lead 汇总）

- 任务：`chore(common): 685 处静默吞错存量分诊——先止血假成功与凭据残留`
- Worktree：`.worktrees/common-silent-catch-triage-issue-3503`
- 分支：`agent/common-silent-catch-triage-issue-3503`
- base：`origin/main` = `d2d54d177dac869f8a8cdabeb0c601a81ac571dc`（提交时 HEAD 未包含本次改动，故 head SHA 以 PR 为准）
- 采集时间：2026-10-21 11:58–12:20 (Asia/Taipei)
- 规格：`specs/silent-catch-triage-3503.spec.md`

## 影响面（`node scripts/impact-matrix.mjs --git-diff --base origin/main`）

- `isUiChange: true`，`browser.required: true`（client 文件变更）→ 必须隔离工作树真实浏览器证据。
- `dev.required: false`（Dev 45120 真机验收归人工，不是 Agent 卡点）。
- 原始输出：`impact-matrix.json`。

## P0-A 假成功止血：market `handleHomeCustomOrder` POST

实现：`persistHomeCustomOrder(configPath, order)` 对 缺文件 / 损坏 JSON / 写盘失败 均 throw（原子临时文件 + rename）；handler 把失败映射为 `500 { ok: false, error: 'home custom order not saved: …' }`，成功仍 200；`order.length > 0` 与 `order: []` 既有语义保持不变。测试接缝 `setHomeOrderConfigPathForTests` 仅测试使用。

| 场景（临时目录 + 真实 port:0 HTTP 请求） | 观察结果 |
|---|---|
| 正常写 | `200 {"ok":true,"order":["b","a"]}`，文件 `homeRecommendations=["b","a"]` 且保留其它字段 |
| 损坏 JSON | `500 {"ok":false,"error":"home custom order not saved: … config JSON invalid …"}`，坏文件未被覆盖 |
| 只读目录（chmod 0500，finally 恢复） | `500 … EACCES/permission denied …`，原文件保持旧值 |
| 缺 catalog 文件 | `500 … config file not found …`，未创建文件 |

命令与结果：

- `pnpm --filter omnimux-market test` → **988 pass / 0 fail**（含 build；新增 `home-order-write.test.ts` 5 用例）
- `node --test lib/tests/home-order-write.test.js` → 5 pass / 0 fail
- 真实 `catalog/skill-recommendations.json` 哈希与 HEAD 一致（测试全程只写临时目录）

## P0-B 凭据残留止血：auth 登出清理

实现：`createTokenStore` 支持 `opts.logger`（缺省 console）；`unsetSecrets`/`unsetConfig` 失败 → `warn`（仅步骤 + 错误消息，无凭据值）+ 抛带步骤的 Error；`unset()` 四步（secrets → config → credentials seam → profile）独立执行、逐项收集失败，最后聚合抛错。登出路由既有 `catch → 500` 因此返回 5xx。读侧容错与 `set()` 的 credentials mirror 未改。

| 场景 | 观察结果 |
|---|---|
| `secrets.json` 变目录（rmSync EISDIR） | `unset()` reject：`logout cleanup incomplete: unsetSecrets failed: …`；`logger.warn` 1 次，不含 token |
| 配置目录只读（原子写 EACCES） | `unset()` reject 且包含 `unsetConfig failed`；其余步骤继续执行 |
| 双失败 + token 泄漏检查 | warn/reject 消息均不含 token/access_token |
| POST `/omnimux/auth/logout` 且 `store.unset()` reject | handler 返回 **500**（body 不含 token）；正常登出仍 200 |
| env `OMNIMUX_ACCESS_TOKEN` + 官方 credentials seam 拒绝 unset（assertUnshadowed） | 登出仍成功（200 路径）：env 是进程级配置，不尝试 unset 被遮蔽的 seam；磁盘 secrets/config/profile 仍被清理 |

命令与结果：

- `cd plugins/omnimux && node --test src/auth/store.test.js src/auth/http-routes.test.js` → **27 pass / 0 fail**
- `pnpm --filter omnimux test`（最终工作树）→ **3604 pass / 0 fail**（386 文件，exit 0）

## P1 sidebar catch 收敛

- `plugins/omnimux/src/client/sidebar-toggle-topbar.js`：SC1 0→0、SC2 **41→0**、SC3 3→4（新增的是 helper 自身 `return fallback` 意图 catch）；导出面/选择器/CSS/几何逻辑未改。
- 增量检查（`scripts/lib/silent-catch-delta.mjs`，base `origin/main`）对全部改动源码：`hits (SC1/SC2) = []`；仅 3 条预期 SC3（market handler 500 留痕、auth 聚合 catch、sidebar helper）。
- jsdom E2E：`sidebar-toggle-topbar.test.js` + `.e2e.test.js` → **95 pass / 0 fail**（88 既有 + 7 新增，强断言覆盖 remove/disconnect 抛错、节点已移除、三段式 fallback）。
- 真实内核：`node scripts/three-column-collapse-qa.mjs` → **PASS**，34 断言全过，`errors: []`，`cleanup.allReleased: true`；截图 1920×993 与 2560×1080（见同目录 PNG / QA report）。

## 存量基线（`node scripts/verify-silent-catch.mjs --json`）

| 口径 | 改动前 @ `d2d54d177` | 改动后（本工作树） | Δ |
|---|---|---|---|
| SC1 空 catch | 242 | 241 | -1 |
| SC2 仅注释 catch | 444 | 399 | -45 |
| 确证合计 | 686 | 640 | -46 |
| SC3 有语句无痕迹 | 882 | 885 | +3 |
| 合计 | 1568 | 1525 | -43 |

- 机器可读：`baseline-before.json`、`after.json`、`silent-catch-after-summary.json`。
- SC3 +3 均为「有语句且留痕」的新形态（market 500 返回、auth 聚合 catch、sidebar helper），扫描器启发式不把它们算作已留痕，但都不属于 SC1/SC2 新增。
- 说明：Issue 正文的 685/881 采集于 `914d80f9b`，其后合入使 SC2 +1、SC3 +1；本任务以 `d2d54d177` 基线为准。

## 最终检查命令与结果

| 命令 | 结果 |
|---|---|
| `node scripts/verify-silent-catch.mjs --json` | exit 0；SC1 241 / SC2 399 / SC3 885；目标文件 sidebar SC1/SC2 = 0 |
| `node --test scripts/verify-silent-catch.test.mjs scripts/lib/silent-catch-delta.test.mjs` | 44 pass / 0 fail |
| `pnpm --filter omnimux test` | exit 0；3604 pass / 0 fail |
| `pnpm --filter omnimux-market test` | exit 0；988 pass / 0 fail |
| `node --test plugins/omnimux/src/client/sidebar-toggle-topbar*.test.js` | 95 pass / 0 fail |
| `node scripts/three-column-collapse-qa.mjs` | exit 0；PASS 34 断言，cleanup 全释放 |
| `pnpm verify:product-baseline` | exit 0；未发现未豁免的开发机私有状态依赖 |
| `pnpm verify:stages` | exit 0；14 Stage / 8 sidebar targets PASS |
| `node --test scripts/verify-anti-slop.test.mjs` | 3 pass / 0 fail |
| `git diff --check` | exit 0 |
| `pnpm test:ui` | **exit 1，但与干净 `origin/main` 完全一致（同为 8 条 `omnimux-video-preview/CarouselPager.jsx` 既有 UI01 违规）**；本任务新增/修改文件无新增违规，记为 pre-existing，不冒充 PASS |

## 非目标与残留

- 不清零存量（本任务只减 46 条确证形态），不设「685→0」KPI；SC3 881/882 未动。
- C 档约 540 处 client best-effort 未批量挂账（Issue 允许分批，另立任务）。
- #3509 承接评审残留：`order: []` 重置语义、客户端 `catch(() => {})` 吞掉 5xx、写路径同源校验、错误体绝对路径。
- `homeCustomOrder` POST `order: []`（重置）仍按既有语义不落盘（已加回归用例锁定），属业务语义问题，另立 Issue 跟进。
- 真实浏览器证据覆盖三分栏几何/缩放档位；「DOM 注入按钮在极端异常下的交互」由 jsdom E2E 覆盖，真实内核不注入 DOM 异常。
- 未做 Electron 证据：本改动不涉及壳层/平台门控行为。

## 风险复核

- Issue 为 `risk:R1`（维护者定级）。本任务不做生产发布/回滚、不改凭据存储/删除逻辑、不新增凭据读取、不写真实凭据；只把既有清理失败从静默改为 warn 并向上回传。测试断言 warn/响应体不含 token。按实际 diff 维持 R1，理由记录于此供合入核对。

## 证据文件索引

| 文件 | 内容 |
|---|---|
| `README.md` | P1 catch 收敛的过程证据（扫描/真实内核/单测/E2E） |
| `verification.md` | 本文件：集成验收汇总 |
| `baseline-before.json` / `after.json` / `silent-catch-after-summary.json` | 存量基线前后与 Δ |
| `silent-catch-counts.json` | sidebar 文件前后计数（task-3 采集） |
| `impact-matrix.json` | 影响面判定原始输出 |
| `three-column-collapse-qa-report.json` | 真实 Chrome QA 原始报告（34 断言） |
| `three-column-collapse-collapsed.png` / `three-column-collapse-viewport-tiers.png` | 真实内核截图 |
