# 首页自定义排序写路径收口：用户状态覆盖、重置恢复默认、同源校验（Issue #3509）

- 关联 Issue：#3509（type: chore / plugin: omnimux-market / track: D / risk: R2）
- 前置：#3503 / PR #3506 已把「写失败仍返回 200」止血为 5xx + `ok:false`
- 后续：#3528 承接客户端「写失败被空 catch 吞掉」，需要可绑定 worktree 源码的真实浏览器验收路径
- 合同：[anti-agent-fake-completion-guard §1.1](../docs/contracts/anti-agent-fake-completion-guard.md)、[plugin-qa](../docs/contracts/plugin-qa.md)、[plugin-git-pr](../docs/contracts/plugin-git-pr.md)、[product-baseline](../docs/contracts/product-baseline.md)

## 目标

1. **用户状态与打包默认分离**：自定义排序改写 `DSH_HOME/omnimux-market-home-order.json`（用户可写）；`catalog/skill-recommendations.json` 的 `homeRecommendations` 是打包默认，运行时**永不改写**。
2. **重置语义可观察**：POST `{ order: [] }` 删除用户覆盖文件（恢复打包默认）；GET 返回生效排序并带 `source: 'custom'|'default'`。`order` 缺失/非数组返回 400，不再静默当空数组。
3. **写路径同源校验**：POST 复用 `trustedRestartRequest`（与其它 mutating 方法一致），cross-site / Origin 不匹配 / 缺 Origin → 403；GET 读路径保持可用。
4. **错误体不泄露路径**：写/清除失败返回固定描述 + 错误码（如 `home order state not writable (EACCES)`），不回传绝对路径。

## 范围

| 文件 | 改动 |
|---|---|
| `plugins/omnimux-market/src/local-api.ts` | 自定义排序拆为「用户覆盖文件 + catalog 默认」；新增 `homeOrderStatePath` / `writeHomeOrderState` / `clearHomeOrderState` / `setHomeOrderPathsForTests`；POST 同源 + order 数组校验；错误文案去路径 |
| `plugins/omnimux-market/lib/local-api.js` | 构建产物（仓库跟踪） |
| `plugins/omnimux-market/src/tests/home-order-write.test.ts` | 9 个真实 HTTP 用例 + 1 个默认路径单测：自定义写入不动 catalog / 重置删覆盖并回退默认 / GET source / 非法 order 400 / 损坏覆盖容错 / 写失败 500 / 清除失败 500 / 非同源 403 / catalog 缺失仍可写 / 默认路径在 DSH_HOME |
| `docs/evidence/home-order-reset-3509/` | 实测命令/结果/证据 |
| `specs/home-custom-order-reset-3509.spec.md` | 本规格 |

## 非目标

- 不重做首页推荐排序交互；不改 `catalog/skill-recommendations.json` 的 schema 或默认值。
- 不迁移旧版本已写进 catalog 的自定义排序（运行时无法区分「旧自定义」与「打包默认」，不做猜测性回写）；打包默认以仓库文件为准。
- 不修改客户端 `plaza/plazaUtils.js` 的空 catch（拆到 #3528，需要可绑定 worktree 源码的真实浏览器验收路径）。
- 不做 C 档批量静默 catch 治理。

## 新用户基线

- 全新用户：`DSH_HOME` 可写；首页排序来自打包 `catalog/skill-recommendations.json` 的 `homeRecommendations`（GET `source: 'default'`），无需任何用户覆盖文件。
- 用户移动排序：仅写 `$DSH_HOME/omnimux-market-home-order.json`；写失败（只读 HOME / 只读目录）返回 5xx + 固定错误码，不把未落盘报告为成功。
- HOME 不可写时读路径仍可用：GET 始终返回打包默认；覆盖文件损坏按「无自定义」降级，不升级为 5xx。
- 同源校验只依赖 Origin/Host（浏览器同源请求天然携带），不依赖开发机端口、profile 或本地模型。

## 假设

1. 重置「假成功」的根因不是「空数组不写」，而是把**用户状态写进了打包默认所在的 catalog**：原实现用 `order.length > 0` 回避覆盖默认，导致重置只能 200 no-op。把用户覆盖拆到 DSH_HOME 单独文件后，「重置=删除覆盖、回退默认」与「catalog 默认不被破坏」可以同时成立。
2. 写路径可被跨站改写，是因为 `homeCustomOrder` 不在 `MUTATING_METHODS` 而 POST 分支未做同源校验；复用 `trustedRestartRequest` 能挡住 cross-site/无 Origin，同时不破坏同源客户端（客户端 `api.js` 用同源 `fetch(pluginUrl(''))` POST）。
3. 绝对路径泄露来自旧实现把 `configPath` 与 fs 原始错误拼进响应；只回传固定描述 + `err.code` 即可在保留可诊断性的同时不泄露安装路径。

## 证伪方式

1. 用临时 catalog + 临时 DSH_HOME 覆盖路径：连续 POST 自定义排序、POST `[]`、GET，断言 (a) catalog 字节始终不变；(b) 覆盖文件在自定义后被创建、重置后被删除；(c) GET 依次返回 custom / default 且 `source` 正确。若任一条不成立，假设 1 被证伪。验证命令：`pnpm --filter omnimux-market test`（含 `home-order-write.test.ts`）。
2. 构造 `sec-fetch-site: cross-site`、Origin 与 Host 不匹配、缺 Origin 的 POST：若仍返回 200 或写入覆盖文件，假设 2 被证伪；合法同源 POST 必须仍 200。
3. 让写/清除失败（只读目录）并检查 5xx `error`：若出现 `/tmp/`、DSH_HOME 路径、`home-order.json` 或 catalog 路径，假设 3 被证伪。

## 验收

- [x] 自定义排序写入用户覆盖文件；catalog 字节不变（含 `keep` 等字段）。
- [x] 重置 `order: []` → 覆盖文件被删除；GET 返回打包默认且 `source:'default'`。
- [x] 自定义后 GET 返回自定义排序且 `source:'custom'`。
- [x] 非法 `order`（缺失/非数组）→ 400 `ok:false`，不写覆盖文件。
- [x] 覆盖文件损坏 → GET 容错回退默认；下一次写入可恢复。
- [x] 写失败 / 清除失败（只读目录）→ 500 + 固定错误码，错误体不含路径。
- [x] 非同源 POST（cross-site / Origin 不匹配 / 缺 Origin）→ 403，不写覆盖文件。
- [x] `pnpm --filter omnimux-market test` 全绿（993 pass）；`git diff --check`；改动文件无新增 SC1/SC2。

## 风险复核

- Issue 定级 `risk:R2`（单插件本地写路径修复，非破坏性）。实际 diff：新增用户状态文件（`$DSH_HOME/omnimux-market-home-order.json`，不触碰打包默认）、同源校验收紧、错误文案去路径；不改存储格式兼容性，不触及凭据/生产发布。若评审认为本地 HTTP 写路径属「公开 I/O」，按合同上调 R1 后再合入。

## 文档影响

不新增合同条款。语义变化（用户覆盖文件位置、重置=恢复默认、非法 order 400、非同源 403、错误体去路径）写入本规格 + 测试 + 证据；客户端失败留痕拆到 #3528 并在该 Issue 记录原因。
