# 首页自定义排序写路径收口：重置落盘、同源校验、错误体去路径（Issue #3509）

- 关联 Issue：#3509（type: chore / plugin: omnimux-market / track: D / risk: R2）
- 前置：#3503 / PR #3506 已把「写失败仍返回 200」止血为 5xx + `ok:false`
- 后续：#3528 承接客户端「写失败被空 catch 吞掉」，需要可绑定 worktree 源码的真实浏览器验收路径
- 合同：[anti-agent-fake-completion-guard §1.1](../docs/contracts/anti-agent-fake-completion-guard.md)、[plugin-qa](../docs/contracts/plugin-qa.md)、[plugin-git-pr](../docs/contracts/plugin-git-pr.md)

## 目标

1. **重置语义可观察**：`handleHomeCustomOrder` POST `{ order: [] }` 真正落盘为 `homeRecommendations: []`（清空自定义排序），GET 能读回 `[]`；`order` 缺失/非数组返回 400，不再静默当空数组。
2. **写路径同源校验**：POST 复用 `trustedRestartRequest`（与其它 mutating 方法一致），非同源/缺 Origin 返回 403；GET 读路径保持可用。
3. **错误体不泄露路径**：5xx 错误改为固定文案 + 错误码（如 `recommendations catalog not writable (EACCES)`），不再回传 `configPath` 或临时文件绝对路径。

## 范围

| 文件 | 改动 |
|---|---|
| `plugins/omnimux-market/src/local-api.ts` | `persistHomeCustomOrder` 错误文案去路径；POST 增加同源校验与 `order` 数组校验；`order: []` 落盘清空 |
| `plugins/omnimux-market/lib/local-api.js` | 构建产物（仓库跟踪） |
| `plugins/omnimux-market/src/tests/home-order-write.test.ts` | 更新既有失败断言；新增重置落盘、GET 读回、非法 order 400、非同源 403、错误体无绝对路径用例 |
| `docs/evidence/home-order-reset-3509/` | 实测命令/结果/证据 |
| `specs/home-custom-order-reset-3509.spec.md` | 本规格 |

## 非目标

- 不重做首页推荐排序交互、不改 catalog 数据结构、不改 `featuredSkills` 语义。
- 不修改客户端 `plaza/plazaUtils.js` 的空 catch（拆到 #3528，需浏览器验收路径）。
- 不做 C 档批量静默 catch 治理。
- 不改 GET 读侧的容错降级（文件缺失/损坏时仍返回空数组，不升级为 5xx）。

## 新用户基线

- 普通安装目录（可能只读）：重置请求写盘失败时返回 5xx + 固定文案错误码，不把未落盘报告为成功；写成功时 GET 读回真实排序。
- 同源校验只依赖请求头 Origin/Host（浏览器同源请求天然携带），不依赖开发机端口、profile 或本地模型；缺失 Origin 即 403，不静默放行。
- 无 market 客户端改动，因此不需要浏览器验收；真实 HTTP 行为由包内测试用临时目录 + 真实端口验证。

## 假设

1. 重置「不落盘」的根因是 POST 仅在 `order.length > 0` 时调用 `persistHomeCustomOrder`，且非数组被静默 `[]`；把「数组校验 + 无条件落盘（含空数组）」集中到 handler 即可让清空可观察。
2. 写路径可被跨站改写，是因为 `homeCustomOrder` 不在 `MUTATING_METHODS` 而 POST 分支未做同源校验；复用 `trustedRestartRequest` 能挡住 cross-site/无 Origin，同时不破坏同源客户端（客户端 `api.js` 用同源 `fetch(pluginUrl(''))` POST）。
3. 绝对路径泄露来自 `persistHomeCustomOrder` 的异常文案直接拼接 `configPath` 与 fs 错误原文；改成固定文案 + `err.code` 既保留可诊断性又不泄露安装路径。

## 证伪方式

1. 用临时 catalog 依次 POST `{order:[]}`、GET：若文件 `homeRecommendations` 未变成 `[]` 或 GET 读回旧值，假设 1 被证伪。验证命令：`pnpm --filter omnimux-market test`（含 `home-order-write.test.ts`）。
2. 构造 `sec-fetch-site: cross-site` 或 Origin 与 Host 不匹配的 POST：若仍返回 200/改写文件，假设 2 被证伪；同时同源 Origin 的 POST 必须仍 200。
3. 让写盘失败（只读目录）并检查 5xx `error`：若出现 `/tmp/`、worktree 路径或 `skill-recommendations.json` 绝对路径，假设 3 被证伪。

## 验收

- [x] POST `{ order: [] }` → 200 且 catalog `homeRecommendations` 落盘为 `[]`；GET 返回 `order: []`。
- [x] 非法 `order`（缺失/非数组）→ 400 `ok:false`，catalog 不被改写。
- [x] 非同源 POST（cross-site / Origin 不匹配 / 缺 Origin）→ 403，catalog 不被改写；同源 POST 正常。
- [x] 缺文件/损坏 JSON/只读目录 → 5xx + 固定文案错误码，错误体不含绝对路径；成功路径行为不回归。
- [x] `pnpm --filter omnimux-market test` 全绿（990 pass）；`git diff --check`；改动文件无新增 SC1/SC2。

## 风险复核

- Issue 定级 `risk:R2`（单插件、非破坏性写路径修复）。实际 diff 仅 market 本地 HTTP 写路径：新增同源校验（收紧）、重置落盘（修正语义）、错误文案（去路径），不改存储格式、不触及生产发布/凭据。若评审认为本地 HTTP 写路径属「公开 I/O」，按合同上调 R1 后再合入。

## 文档影响

不新增合同条款。可观察语义变化（重置 = 清空、非法 order 400、非同源 403）写入本规格 + 测试；客户端反馈拆到 #3528 并在该 Issue 记录原因。
