# MiniMax H3 全系列分组接入规格 (All MiniMax H3 Groups Alignment Spec)

- 任务工作树：`.worktrees/minimax-h3-all-groups`（分支 `agent/minimax-h3-all-groups`，基线 `origin/main` @ `ce7fa3802`）
- 日期：2026-09-16
- 权威依据：上游网关价目表真源实测（`https://api.omnimux.ai/api/pricing`，2026-09-16 12:19 采样确证）与用户「全部接入，全部按照分组方式来路由，且每个分组单独契约」明确指令。

## 1. 背景与上游真实在售数据

上游网关今天上午（2026-09-16）完成了算力专线上新，H3 系列已全量扩充为 4 个独立模型与专属分组：

| 上游模型 ID | 模型描述 / 定位 | 上游单价 | 可用分组 (`enable_groups`) | 分组倍率 (`group_ratio`) |
|---|---|---|---|---|
| `minimax-h3` | MiniMax 海螺 3.0 原生 2K 视频生成（原生音画同步，4–15 秒自由时长） | $0.0714/次 | `["default"]` | 1.0 (基准) |
| `minimax-h3-turbo` | MiniMax 海螺 3.0 极速版（出片速度提升 3 倍） | $0.0350/次 | `["default"]` | 1.0 |
| `minimax-h3-video` | MiniMax H3 ComfyUI 工作流原生视频（国内算力专线，极低成本） | $0.0250/次 | `["default", "minimax-h3-video-fast", "minimax-h3-video-pro"]` | fast: 0.9 / pro: 1.15 |
| `minimax-h3-task` | MiniMax H3 固定 15 秒任务版 | $0.3781/次 | `["default"]` | 1.0 |

此外，网关声明了 2 个全新的专属线路分组：
- `minimax-h3-video-fast`: 倍率 0.9，折合 $0.0225/次（全场最低价）
- `minimax-h3-video-pro`: 倍率 1.15，折合 $0.02875/次（极限画质先行版）

## 2. 目标

严格按照用户的“全部接入，全部按照分组方式路由，每个分组单独契约”要求：
1. 将上游现役全部 4 款 H3 核心模型与 2 个专属分组，统一收敛在 `minimax-h3` 统一产品系列下，以 5 条线路分组呈现。
2. 每个分组显式绑定各自的契约、定价与上游真实型号：
   - `standard`（标准版）：走 `minimax-h3` 官方默认专线，支持 4–15 秒自由时长，按秒计费。
   - `turbo`（极速版）：走 `minimax-h3-turbo` 默认专线，出片速度提速 3 倍，定价折合约 540 积分。
   - `video_fast`（工作流·高速档）：走 `minimax-h3-video` 的 `minimax-h3-video-fast` 专线，AutoDL 极速出片，极致低价（约 350 积分）。
   - `video_pro`（工作流·画质档）：走 `minimax-h3-video` 的 `minimax-h3-video-pro` 专线，AutoDL 极限画质先行版，定价折合约 440 积分。
   - `task`（任务版）：走 `minimax-h3-task`，固定 15 秒长视频按次专线（5825 积分）。
3. 确保跨插件原子闭环：中枢 `channel-groups.js` 与画布 `channelGroups.ts` 镜像 100% 逐字对齐。
4. 确保智能路由按策略自动分流：
   - 成本优先（`cost_first`）：自动命中单价最低的 `video_fast`（`minimax-h3-video@minimax-h3-video-fast`）。
   - 稳定性优先（`stability_first`）：自动命中官方 99% 稳定性的 `standard`（`minimax-h3@default`）。

## 3. 验收标准（可测试）

- **AC-1 (分组集合完整)**：`getModelChannelGroups('minimax-h3')` 返回 5 条启用分组（`standard`, `turbo`, `video_fast`, `video_pro`, `task`）。
- **AC-2 (上游型号路由精准)**：
  - `standard` 路由候选为 `minimax-h3@default`
  - `turbo` 路由候选为 `minimax-h3-turbo@default`
  - `video_fast` 路由候选为 `minimax-h3-video@minimax-h3-video-fast`
  - `video_pro` 路由候选为 `minimax-h3-video@minimax-h3-video-pro`
  - `task` 路由候选为 `minimax-h3-task@default`
- **AC-3 (每分组独立契约生效)**：
  - `task` 分组声明约束 `duration: { fixed: 15 }`, `resolution: { only: ['768P', '2K'] }`
  - `video_fast` 与 `video_pro` 声明独立定价与专属 wireGroup，支持 768P/2K
  - `standard` 沿用模型全量模式契约
- **AC-4 (智能策略排序严格)**：
  - `cost_first` 模式候选首位必须为 `minimax-h3-video@minimax-h3-video-fast`
  - `stability_first` 模式候选首位必须为 `minimax-h3@default`
- **AC-5 (画布镜像与跨插件门禁)**：
  - `channelGroups.ts` 镜像与中枢一致
  - `scripts/verify-cross-plugin-model-alignment.test.mjs` 测试 100% 通过
  - `scripts/verify-model-contracts.mjs --strict` 契约门禁严格通过
- **AC-6 (单元测试完备)**：
  - 中枢 `channel-groups.test.js` 与画布 `channelGroups.test.mjs` 增补全部 5 档测试全绿通过。

## 4. 不做事项

- 不将 `minimax-official` / `minimax-pro` / `minimax-standard` 账号级空壳作为模型分组暴露（上游未绑定 H3 模型，避免 503 报错）。
- 不破坏现有历史工程兼容性：未指定分组或全选时自动落入高可用回退链。
