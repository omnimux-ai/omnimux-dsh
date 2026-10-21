# 移除媒体查看器大图/网格模式切换（Issue #3571）

## 用户旅程与目标

用户打开媒体查看器后，右上角不再出现「大图浏览模式 / 四宫格时间线模式」两个切换按钮；查看器始终是当前默认的单图大图模式。用户仍可缩放、打开、下载、分栏、添加评论、使用历史栏、切换素材、上传/生成。网格模式（时间线瀑布流）的组件、分支、store 字段与样式全部移除，避免后续被重新接线。

## 范围

### 保留（单图模式）
- 工具栏：添加评论、历史、缩放/适应窗口/打开/下载、分栏、关闭。
- 舞台：单图画布、左侧缩略轨、生成中/失败卡、评论打点、composer、历史栏/抽屉。
- `layoutMode`（两栏/三栏）、`zoom`、annotations、mediaList、生成任务等既有状态不变。
- store 持久化旧数据中的 `subViewMode` 字段在 hydrate 时忽略，不迁移、不报错。

### 移除（网格模式）
- `MediaViewerTab` 中模式切换 capsule 按钮、`subViewMode` 分支、`timelineGroups` 渲染、grid 专用多选按钮。
- store 的 `subViewMode` 字段/`setSubViewMode`/`getTimelineGroups`/`formatTimelineDate` 及持久化字段。
- `image-canvas-stage` 中对 `subViewMode` 的判断，只保留 `hasActiveMedia`。
- `assistantMessageMediaEnhancer` 中的 `setSubViewMode('single')` 调用。
- grid 专用 CSS（`.omx-mv-timeline*`、`.omx-mv-capsule*`、`[data-subview]`）与相关测试/fixture。

## 验收用例

| ID | 场景 | 期望 |
| --- | --- | --- |
| S1 | 打开查看器 | 工具栏无「大图浏览模式」「四宫格时间线模式」按钮；主舞台直接显示单图 |
| S2 | 缩放/适应窗口/打开/下载/分栏/评论 | 行为与改动前单图模式一致 |
| S3 | 历史栏、窄屏抽屉、成本行、复用提示词 | 无回归 |
| S4 | 旧 localStorage 带 `subViewMode:'grid'` | hydrate 后正常单图，不报错、不残留 grid 状态 |
| S5 | 代码检索 | `subViewMode`、`setSubViewMode`、`getTimelineGroups`、`.omx-mv-timeline` 无业务引用 |
| S6 | viewer/hub 包测试 + worktree 真实浏览器 | 通过；工具栏与单图交互有截图证据 |

## 假设

- `subViewMode` 只服务于大图/网格切换，没有其他插件/宿主通过 store 快照消费它（仓库检索确认仅 viewer、store、canvas-stage、enhancer、测试引用）。
- 旧持久化数据里的 `subViewMode` 可安全忽略；默认单图不需要显式写回。

## 证伪方式

若移除后单图任一交互回归、旧数据 hydrate 报错/仍出现 grid、或仓库仍有 `subViewMode` 业务分支/样式残留，则假设不成立。执行 `pnpm --filter omnimux-viewer test`、`pnpm --filter omnimux test`、`rg "subViewMode|omx-mv-timeline|omx-mv-capsule"`、worktree ego 截图验证。

## 新用户基线

不依赖开发机状态；空会话显示单图空态，有素材直接单图展示；不需要开启任何开关。

## 非目标

- 不改 `layoutMode` 两栏/三栏、不改历史栏、不改生成/composer 逻辑。
- 不新增替代视图或模式选择入口。

## 回滚

单 PR；revert 恢复模式切换与 grid（需同时恢复 store/样式/测试）。
