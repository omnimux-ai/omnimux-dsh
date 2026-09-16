# MiniMax H3 全系列接入：统一按分组路由，每个分组独立契约

- 任务工作树：`.worktrees/minimax-h3-series-groups`（分支 `agent/minimax-h3-series-groups`，基线 `origin/main` @ `8c7dc7682`）
- 日期：2026-09-16
- 上游依据：用户 2026-09-16 指令「把 H3 系列都接入 但是全部按照分组方式来路由，且每个分组单独的契约」；上游实测复核。

## 1. 背景与问题

上游 `GET https://api.omnimux.ai/api/pricing`（2026-09-16 09:30 实测）中，H3 系列共两个在售型号：

| 上游型号 | 时长 | 分辨率 | 价格 | 挂载分组 | 上游 operations |
|---|---|---|---|---|---|
| `minimax-h3` | 4–15 秒 | 768P / 2K | $0.0714/次 | `default` | text_to_video、first_frame、first_last_frame、video_multi_ref、video_edit |
| `minimax-h3-task` | 固定 15 秒 | 768P / 2K | $0.3781/次 | `default` | 同上（无 end_frame） |

现状问题：本地只把 `minimax-h3` 作为唯一在售型号接入，`minimax-h3-task` 仅存在于 `id-universe.js` 的输入归一别名（`minimax-h3-task → minimax-h3`），画布上完全看不到「固定 15 秒」这条线；用户选中它会被静默当成 4–15 秒的普通版跑。

**关键机制事实（本次改动的前提，已核对源码）**：
1. 分组只走请求头：`withRoutingGroup`（`media/protocols/openai-media.js`）只设置 `X-Omnimux-Group`，请求体型号保持原样。
2. 请求体型号来自候选字符串：`execute.js` 的失败重试循环用 `splitRoutingCandidate`（**纯拆分、不做别名归一**）把 `型号@分组` 拆开，型号部分直接作为请求体 model 下发。
3. 候选字符串由 `channel-groups.js` 的 `wireOf` 生成，当前形如 `${产品id}@${wireGroup}`——无法表达「同一产品、不同上游型号」。
4. 画布侧 `ModelCascadeMenu` 默认把该模型的**全部启用分组**作为 `allowedGroups` 传下去，用户选中某一分组即持久化该分组 id。

因此：要让「固定 15 秒任务版」按分组路由，分组必须能声明自己的上游型号。

## 2. 目标

1. 在 `minimax-h3` 下以**分组**形式接入 H3 全系列：`standard`（普通版）与 `task`（任务版·固定 15 秒），画布型号列仍只有一个「MiniMax H3」，线路列出现两条。
2. 每个分组携带**自己的契约**：任务版固定 15 秒、且按其上游 operations 收窄生成方式。
3. 分组可选地声明上游型号（`wireModel`），使路由候选能指向正确的上游型号，请求体型号随之正确。

## 3. 验收标准（可测试）

- **AC-1（分组扩展点）**：`resolveChannelPlan` 生成的候选，其型号部分取 `group.wireModel ?? 产品id`。对 `minimax-h3` 的 `task` 分组，候选必须逐字等于 `minimax-h3-task@default`。
- **AC-2（普通版不受影响）**：`standard` 分组候选仍为 `minimax-h3@default`；未声明 `wireModel` 的其它模型候选格式逐字不变（回归）。
- **AC-3（分组与契约）**：`getModelChannelGroups('minimax-h3')` 返回两条启用分组；`task` 分组自带 `constraints`：`parameters.duration = { fixed: 15 }`、`parameters.resolution = { only: ['768P','2K'] }`、`operations` 收窄为 `['text_to_video','first_frame','first_last_frame','video_multi_ref']`；`standard` 不施加约束（沿用模型契约）。
- **AC-4（显式选择与失败关闭）**：`resolveChannelPlan('minimax-h3', { allowedGroups: ['task'] })` 只产出任务版候选；`{ allowedGroups: ['task','standard'] }` 产出两条且默认（auto）排序首位为 `minimax-h3@default`（普通版更便宜、稳定性更高）。
- **AC-5（画布镜像一致）**：创作画布侧 `MODEL_CHANNEL_GROUPS['minimax-h3']` 与中枢逐字一致；`resolveLineConstraints('minimax-h3', { allowedGroups: ['task'] })` 返回任务版契约（节点上时长被锁为 15 秒）。
- **AC-6（请求体型号正确）**：候选 `minimax-h3-task@default` 经执行层拆分后，请求体 model 为 `minimax-h3-task`、请求头分组为 `default`。
- **AC-7（门禁）**：`pnpm verify:model-contracts`（strict）全绿；`scripts/verify-cross-plugin-model-alignment.test.mjs` 全绿；两侧分组单测全绿。

## 4. 不做事项

- 不接入 `minimax-official` / `minimax-pro` / `minimax-standard` 三个账号档位：上游实测**没有任何 H3 模型挂载其上**，接入即「选中即 503」。上游证据：两个 H3 型号的 `enable_groups` 均为 `["default"]`。
- 不改 `minimax-h3` 模型契约（`video-models.yaml`）本身：模型级 operations/参数保持原样，任务版的差异用**分组契约**表达。
- 不删除 `id-universe.js` 中 `minimax-h3-task → minimax-h3` 的输入归一别名：它只作用于入参归一，不参与候选构造（候选由 `splitRoutingCandidate` 纯拆分，不受别名影响）。
- 不编造任务版的 SLA 数据：该分组不声明 `sla`，排序走 `calculateAutoScore` 的中性默认值（源码已明确支持「未公布 SLA 时用中性默认值，不对外声称稳定率」）。
