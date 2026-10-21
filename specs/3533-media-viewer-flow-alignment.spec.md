# 媒体生成面板对齐 Flow：历史栏与成本预估（Issue #3533）

## 背景与目标

Google Flow 的编辑页把「版本历史 + 提示词快照 + 成本前置」做成右栏与 composer 的一部分。OmniMux 的媒体生成面板（`plugins/omnimux-viewer/src/media-viewer/`）已有单图舞台、左侧缩略轨、时间线与底部 composer，但缺少可回看/复用提示词的历史记录，以及生成前的成本可见性。

本任务在 **不改动服务端接口、store 持久化格式、hub 样式** 的前提下，以现有 `mediaList` 记录（含 `request` 提示词快照、`groupId`、`timestamp`、`status`）为数据源：

1. 新增生成历史栏（宽容器右侧 260px；窄容器工具栏按钮 + 抽屉），卡片展示缩略图、提示词快照、时间/类型、批量计数，并提供「复用提示」「下载」。
2. 图像模式 composer 增加「预估消耗 ≈N 积分」，数据只取模型目录投影里的 `pricing.pointsEstimate`，无数据即隐藏。

## 用户旅程

1. 用户在单图模式生成若干图片（含批量）。
2. 右侧历史出现按时间倒序、按 `groupId` 聚合的卡片；当前结果高亮。
3. 点击任一卡片，舞台切换到该结果，左缩略轨同步选中。
4. 点击「复用提示」，composer 填入该卡提交时的提示词快照（视频记录会切到视频模式），**不自动提交**。
5. 点击「下载」，下载该条结果；无 URL 的记录禁用下载。
6. 窄容器下历史收起为工具栏「历史」按钮，点击打开覆盖抽屉；Esc、遮罩、关闭按钮均可关闭。
7. 图像模式 composer 显示成本预估；切到视频模式或打开无定价模型时隐藏。

## 布局与文案契约

- 宽容器（容器宽度 ≥900px）：`.omx-mv-stage-wrapper` 内、viewport 之后渲染 `<aside class="omx-mv-history">`，宽 260px，左边框 `--dsw-alias-border-l2`，列表滚动。
- 窄容器（<900px）：同一节点变为覆盖抽屉，`inset:0 0 0 auto; width:min(320px,86%)`；根节点 `data-history-open="true"` 时滑入；遮罩 `.omx-mv-history-scrim`；z-index 抽屉 120 / 遮罩 110 / composer 100。
- 仅 `subViewMode === 'single'` 渲染历史节点与「历史」按钮；时间线模式不渲染（避免与既有时间线重复）。
- 卡片：缩略图或状态占位、提示词两行截断（`title` 全文）、`HH:MM · 图片/视频 · ×N`、状态徽标、hover/focus 可见的「复用提示」「下载」。
- 空态：`暂无历史`。
- 成本行：`.omx-mv-cost`，位于 composer 底部右栏发送按钮之前；文案 `预估消耗 ≈{points} 积分`，`title` 为「预估值，实际以执行中枢结算为准」；容器 <520px 隐藏。
- 文案新增到 `src/client/locales.ts` 的 zh/en 双字典，key 集合一致；组件在无 `t` 时使用中文回退。

## 数据与规则

- 历史分组：`groupId || id`；组内按 `timestamp` 倒序，primary 取最新 completed，其次 generating，再次 failed；状态聚合 generating > completed > failed。
- 历史排序：按组内最大 `timestamp` 倒序（与左缩略轨一致）。
- 提示词快照：`item.request.prompt || item.prompt || ''`；为空显示「无提示词」并禁用复用。
- 成本：`points = channel.points × batch`；舍入 ≥10 取整、≥1 保留 1 位、<1 保留 2 位；`channel.points` 缺失则不显示。
- 复用通道：沿用 `queueComposerPrefill({ prompt, kind })`，不新增事件/网络请求。
- 键盘：单图模式下 ↑/↓ 切换历史；Esc 优先关历史抽屉；输入框/可编辑元素聚焦时不拦截。

## 非目标

- 不新增服务端版本模型、不做版本树分叉。
- 不做保存到资产库、删除历史（缺少资产写入 seam 与回收站语义）。
- 不做生成进度百分比（服务端未暴露进度，禁止编造）。
- 不做视频按秒成本预估。
- 不复制 Flow 的项目页/顶栏/时间线/纯黑主题。

## 验收用例

| ID | 场景 | 期望 |
| --- | --- | --- |
| A1 | 1280 宽容器 | 历史栏宽 260±2；卡片 5 张（5 个生成组，含 1 个批量 ×2 与 1 个失败组）；最新完成项 `aria-current=true`；提示词可见 |
| A2 | 640 宽容器 | 历史栏不可见；「历史」按钮可见；点击后抽屉与遮罩出现；Esc 关闭 |
| A3 | 点击第 2 张卡 | 舞台图片切换为该记录 URL；高亮转移 |
| A4 | 复用提示 | composer 文本等于快照；未发生 POST；网格模式先切单图 |
| A5 | 下载 | 触发 anchor，文件名使用记录标题；无 URL 禁用 |
| A6 | 成本 | 0.13×2 → `≈0.26`；无 points 隐藏；视频隐藏；<520 宽隐藏 |
| A7 | 批量/状态 | 同 groupId 聚合 ×N；failed/generating 卡片可选中并进入既有卡片 |
| A8 | 回归 | 现有缩略轨/时间线/composer/MIME/失败重试测试全绿；交互零网络写 |

## 假设

OmniMux 媒体生成面板的用户心智是「同一会话的生成记录」，因此按 `groupId` 聚合、按时间倒序的历史栏，配合既有 `request.prompt` 快照，足以对齐 Flow History 的核心价值；本期无需 per-source 版本树，也无需修改服务端数据模型。

## 证伪方式

若真实浏览器（1280/640）中出现以下任一可观测结果，则上述假设错误：同一批结果被拆成多卡或不同批被误合并；点击历史无法切换舞台；复用提示后 composer 文本与快照不一致或触发提交；宽档舞台/composer 被历史栏遮挡；窄档抽屉无法打开或关闭。执行 `pnpm --filter omnimux-viewer test`、jsdom 组件用例与 worktree ego 证据脚本，并以 `docs/evidence/media-viewer-flow-alignment/report.json` 的断言结果为准。

## 新用户基线

依赖已登录会话与 hub `/omnimux/model-catalog`。目录加载失败时历史栏仍可用（数据来自本地 store），成本行隐藏；无会话/无历史显示空态；不引入开发机路径、端口、本地模型或私有 profile。

## 文档与证据

- 不修改既有契约文档；新增本 spec 与 `docs/evidence/media-viewer-flow-alignment/`（report.json + 1280/640 截图）。
- 证据由 worktree 内 harness（真实 React 组件 + 真实 Chromium）生成；ego 不可用时按 QA 合同记 BLOCKED，不以 jsdom 替代布局证据。

## 回滚

单 PR、全部落在 `plugins/omnimux-viewer` 与 spec/evidence；revert 即恢复；无数据迁移。
