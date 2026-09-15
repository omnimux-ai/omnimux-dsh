# 下架 seedance-2-5「30 秒 / 9 图」特惠线路（上游断货）

- 任务工作树：`.worktrees/seedance-2-5-cheap-delist`（分支 `agent/seedance-2-5-cheap-delist`，基线 `origin/main` @ `74cfb97b1`）
- 日期：2026-09-16
- 上游依据：用户 2026-09-16 明确指令「seedance 2.5 9图 30秒这个分组的模型 移除 下架 不提供服务 上游断货了」；网关价目表实测复核确认。

## 1. 背景与问题

创作画布与执行中枢中，`seedance-2-5` 当前挂着三条线路（分组）：

| 分组 id | 名称 | 计费 | 特征 | wire 分组 |
|---|---|---|---|---|
| `pro` | 进阶版 | 按次 | 时长固定 30 秒 | `seedance-2-5-task-pro` |
| `standard` | 标准版 | 按秒 | 无约束 | `default` |
| `cheap` | 特惠版 | 按次 | **时长固定 30 秒 + 最多 9 张参考图** + 仅 720p + 仅 16:9/9:16 + 仅「全能参考」模式 | `seedance-cheap` |

用户所指「9 图 30 秒这个分组」即上表的 **`cheap` 特惠版**：其约束里 `duration.fixed: 30` 与 `inputs.image.max: 9` 同时成立，且界面徽标明写「限时特惠 · 30秒按次专线」，是该线路唯一的识别特征。

上游复核（2026-09-16 00:04 实测 `https://api.omnimux.ai/api/pricing`）：
- 昨天还在售的 `seedance-2-5-task`（30 秒固定时长、参考图 min1/max9、720p）**已从网关模型目录整体消失**；
- `seedance-2-5` 的 `enable_groups` 现在**只有 `default`**，不再广告任何按次专线。

即该线路的上游供货通道已断，继续在画布与中枢中提供会造成「选中即 503 无可用渠道」。

## 2. 目标

1. 从执行中枢与创作画布中移除 `seedance-2-5` 的 `cheap`（`wireGroup: seedance-cheap`）分组，两侧镜像保持一致。
2. 保留 `pro` 与 `standard` 两条线路，`seedance-2-5` 模型本身仍在售、仍为画布视频默认模型。
3. 已经选中该线路的历史工程不得因为线路消失而扩散到其它（更贵）线路：一旦其 `allowedGroups` 只剩已下架分组，必须**失败关闭**（零候选），而不是回退到全量线路。

## 3. 验收标准（可测试）

- **AC-1（中枢除牌）**：`MODEL_CHANNEL_GROUPS['seedance-2-5']` 只剩 `pro` 与 `standard`；不再包含 id `cheap`，也不含 `wireGroup: seedance-cheap`。
- **AC-2（画布镜像同步）**：创作画布侧 `MODEL_CHANNEL_GROUPS['seedance-2-5']` 与中枢逐字一致（同样只剩 `pro` 与 `standard`）。
- **AC-3（列表与智能路由）**：`getModelChannelGroups('seedance-2-5')` 返回长度 2；`resolveChannelCandidates('seedance-2-5', { strategy: 'cost_first' })` 首位为 `seedance-2-5@default`（原首位 `seedance-2-5@seedance-cheap` 不复存在）。
- **AC-4（显式请求不再命中）**：`resolveChannelCandidates('seedance-2-5', { group: 'seedance-cheap' })` 的 `unresolvedGroups` 必须包含 `seedance-cheap`（明确报告不可解析，而非静默当成有效线路）。
- **AC-5（历史工程失败关闭）**：`resolveChannelPlan('seedance-2-5', { allowedGroups: ['seedance-cheap'] })` 返回空候选集合，不得放宽为全量线路。
- **AC-6（画布约束不再泄漏）**：`resolveLineConstraints('seedance-2-5', { allowedGroups: ['cheap'] })` 返回 `{}`（该线路的 30 秒 / 9 图 / 720p 约束随分组一并消失，不再施加到节点上）。
- **AC-7（模型仍在售）**：`seedance-2-5` 仍在画布视频白名单中，默认模型不变；`pnpm verify:model-contracts` 严格模式仍全绿。
- **AC-8（回归）**：`plugins/omnimux` 与 `plugins/omnimux-workflow` 的定向单测全绿。

## 4. 不做事项

- 不改 `seedance-2-5` 模型本身的在售状态、默认线路与白名单归属（AC-7 只要求不变）。
- 不动 `pro`（进阶版）与 `standard`（标准版）两条线路——用户本次只指认 9 图 / 30 秒的 `cheap` 线路。
- 不改写历史规格与证据文档（`specs/seedance-2-5-task-channels.spec.md`、`docs/evidence/2026-09-14-seedance-2-5-task-channels-verification.md`）——它们是当时的记录。
- 不删除 `id-universe.js` 中 `seedance-2-5-task → seedance-2-5` 的输入归一别名：该别名只做入参归一、不产生路由候选（`seedance-2-5` 已在 `auto-serving-manifest` 注册，候选走 `gatewayIds`），删它属于另一件事。

## 5. 待用户拍板的相邻发现（本次不改）

实测发现 `seedance-2-5` 的 `pro`（进阶版，`wireGroup: seedance-2-5-task-pro`）同样可疑：该 wire 分组不在网关 `group_ratio` 中，且网关对 `seedance-2-5` 只广告 `default`。本次按用户指令只下架 `cheap`，`pro` 是否一并下架需用户单独确认。
