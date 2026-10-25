# Issue #3762 离线验证证据（画布渠道菜单改读中枢目录）

- 日期：2026-10-25
- 任务：P0「画布渠道菜单改读中枢目录，删除本地模型/线路/价格镜像」
- 工作树：`.worktrees/canvas-catalog-truth`，分支 `agent/canvas-catalog-truth-issue-3762`，基线提交 `a2a3c5286`（P1b 之后）
- 说明：本文件是**离线**证据（单测 + 门禁 + 等价性对照）。**真实浏览器证据被阻断**，见
  `docs/evidence/blockers/canvas-catalog-truth-issue-3762.json`；本文件不替代浏览器验收。

## 一、目录真源对照（画布解析 vs 中枢目录投影）

用同一份随包网关快照，把中枢目录行喂给画布侧解析函数，与改动前的本地镜像逐项对照：

| 型号 | 目录线路 id | 画布解析 id/label 与旧镜像一致 | 说明 |
| --- | --- | --- | --- |
| seedance-2-0 | standard | 是 | 仅价格从 4.9 → 4.86（快照口径） |
| seedance-2-5 | 480p, 720p, seedance-2-5-480p, seedance-2-5-720p | 否（2 → 4 条） | 快照多发布两条专线（20.96 / 28.82 积分） |
| gpt-image-2.5 | standard, economy, nanobanana-economy | 否（2 → 3 条） | 快照多发布 nanobanana-economy；三条均为表达式计费（无逐项可比数字，带 pointsNote） |
| gemini-3.8-flash | standard | 是 | 表达式计费，不再显示 100 积分 |
| suno | standard | 是 | 0.76 积分（快照口径） |
| seedance-2-0-fast / -mini、seedream-5-0-pro、minimax-h3 | （空） | 否（旧镜像列价 → 现在无线路） | 网关已下架 |

## 二、线路约束（爆炸半径）行为等价

`resolveLineConstraints` 改为目录驱动后，与改动前逐项对照（`JSON.stringify` 全等）：

| 调用 | 结果 |
| --- | --- |
| gpt-image-2.5 `{group:'standard'}` / `undefined` | EQUAL（固定 1K、关闭 quality、张数 1） |
| gpt-image-2.5 `{allowedGroups:['economy']}` | EQUAL（无约束） |
| seedance-2-5 `{group:'480p'}` / `{group:'720p'}` / `undefined` | EQUAL（480p/720p 固定分辨率；自动路由不额外收紧） |
| seedance-2-0 `{allowedGroups:['standard']}` | EQUAL（无约束） |
| BYOK 视频兜底（单图 + 16:9/9:16/1:1 + 5/10 秒） | 单测全绿，语义未变 |

## 三、保留的纯函数等价性（逐输入对照旧模块）

`parseModelAndGroup`、`resolveShortModelName`、`detectModelModality`、`isByokGroup`、`sanitizeProviderKey`、
`formatPriceChip/Label/BillingLabel/PointsLabel`、`isLineConstraintsShape`、`isRuntimeByokChannelSettings`、
`buildChannelSelectionPayload`、BYOK 渠道合并（6 组 settings × 4 个模型）：全部逐项相同；
唯一差异是官方线路改由目录行提供（预期变更）。

## 四、门禁与测试（实际命令与结果）

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter omnimux-workflow test` | 3064 pass / 0 fail |
| `pnpm --filter omnimux-workflow typecheck` | 0 error（canvas + host + director 三个 tsconfig） |
| `pnpm --filter omnimux test` | 2 fail（`src/agents/local.test.js`，本机 codex CLI 相关；基线 `a2a3c5286` 同样红） |
| `pnpm check:boundaries` | 4502 files verified |
| `pnpm verify:product-baseline` | 通过（1 处历史豁免，与本次无关） |
| `pnpm verify:model-contracts` | `ok=true`，无基线外新缺口 |
| `pnpm verify:cross-plugin-models` | 5 whitelist models / 4 defaults / 10 aspect ratios / **5 channel groups verified** |
| `pnpm verify:group-naming` | 产品命名 7 条命中白名单；网关命名 3 条只受禁用词约束；画布显示名与目录逐字一致 |
| `pnpm verify:group-pricing` | 6 条线路积分 = 快照口径；4 条无可比价格的线路带说明；画布零本地价格表 |
| `node --test scripts/verify-{channel-group-naming,channel-group-pricing,pricing-points-integrity,cross-plugin-model-alignment}.test.mjs` | 36 pass / 0 fail |
| `pnpm test:gates` | 485 pass / 1 fail（`scripts/public-plugin-apply.test.mjs` 的 worktree 授权用例；基线同样红） |
| `node scripts/impact-matrix.mjs --git-diff --base origin/main` | `browser.required = true` |
| `rg 'pointsEstimate\s*:\s*-?\d|MODEL_CHANNEL_GROUPS' .../channelGroups.ts` | 无命中 |

## 五、浏览器证据（阻断）

- 命令：`corepack pnpm verify:app --request test-support/canvas-catalog-truth-3762/request.json --journey plugins/omnimux-workflow/tests/e2e/canvas-catalog-truth-3762.journey.mjs`
- 结果：`TEST_ENV_INSTALL_FAILED`（`raw-run.json` 在 `.workbuddy/evidence/contract/canvas-catalog-truth-issue-3762/52464118-ab9e-4aee-ae62-fc6f8be3b0f9/`）
- 根因：本分支钉 `dsh-better-sidebar@0.18.0`，本机已装 dsh 为 `0.2.1-rc.3`，官方 plugin 命令以 peer 不兼容拒绝安装；
  origin/main 的 `19e4a74a5`（#3769）已把该依赖提到 `0.19.1` 并新增 `scripts/sidebar-support-identity.json`，但不在本分支。
- 旅程与请求已就位，变基到 origin/main 后原样重跑即可产出证据（旅程断言：菜单渠道列 == 目录 DTO、已下架型号不在候选）。
