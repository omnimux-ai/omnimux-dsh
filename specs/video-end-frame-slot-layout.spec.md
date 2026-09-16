# 视频「尾帧」模式卡槽布局规范 (Video End Frame Slot Layout Spec)

- 任务工作树：`.worktrees/fix-video-end-frame-slot`（分支 `agent/fix-video-end-frame-slot`，基线 `origin/main` @ `6029d28b0`）
- 日期：2026-09-16
- 权威依据：上游 APIMart 官方接口文档（MiniMax H3 Generation API）明确支持 `last_frame_image` 单尾帧输入；用户「那就是尾帧的业务逻辑有问题 那你先修复 然后在排查下上游是否提供了这个契约 并给我打印证据」明确指令。

## 1. 背景与根因

用户在创作画布中选择 MiniMax H3 模型的「尾帧」生成模式时，节点左下角显示了 2 个虚线加号框 `[+] [+]`。

### 根因排查与确证
1. **业务与上游契约**：
   - 官方 APIMart MiniMax-H3 文档明确定义：
     - `first_frame_image`: 首帧图像（控制视频起始第 1 帧）
     - `last_frame_image`: 尾帧图像（控制视频终止最后一帧，可与首帧组合为首尾帧，亦可单独作为纯尾帧控制）
   - 中枢 `video-models.yaml` 中，`end_frame` 声明的 inputs 仅有 1 个图片输入：`slot: last_frame, min: 1, max: 1`。
2. **前端布局策略表遗漏**：
   - 在 `slotLayoutTable.ts` 中，为 `first_frame` 声明了 `{ preset: 'named', slots: ['first_frame'] }`（1个具名槽）；
   - 为 `first_last_frame` 声明了 `{ preset: 'pair', slots: ['first_frame', 'last_frame'] }`（成对起止槽）；
   - **唯独缺失了 `end_frame` 的策略声明**。
   - 导致 `deriveSlotLayout` 在处理 `end_frame` 时因匹配不到 policy 而回退到了默认的 `'strip'`（连续素材列表）预设。
   - 在 `'strip'` 预设下，系统既渲染了 `last_frame` 的必填卡槽（框 1），又因 `addButton` 条件满足而额外渲染了一个 `wf-slot-well--append` 追加按钮（框 2），从而造成了同屏渲染出 2 个加号框的视觉缺陷。

## 2. 目标

1. 在 `SLOT_LAYOUT_TABLE` 中补齐 `end_frame: { preset: 'named', slots: ['last_frame'] }`，使尾帧模式与首帧模式保持对称的单个具名卡槽规范。
2. 当选择「尾帧」模式时，节点仅渲染 1 个虚线加号卡槽，其角色与槽位为 `last_frame`，悬停文案提示为“尾帧”。
3. 补充完善单元测试用例，确保 `end_frame` 派生的 preset 为 `named`，slots 仅包含 1 个 `last_frame`，且绝无多余追加按钮。

## 3. 验收标准（可测试）

- **AC-1 (布局预设对齐)**：`deriveSlotLayout(catalog, 'minimax-h3', 'end_frame', 'video')` 派生的 `layout.preset` 必须等于 `'named'`。
- **AC-2 (单卡槽且槽位精确)**：`layout.slots` 长度必须严格为 1，`slots[0].slot` 为 `last_frame`，`slots[0].role` 为 `last_frame`，`slots[0].type` 为 `image`。
- **AC-3 (无追加加号按钮)**：`layout.addButton` 必须为 `false`，界面不渲染 `wf-slot-well--append`。
- **AC-4 (上游证据链闭环)**：在交付回复中清晰呈现上游 APIMart 官方接口文档对 `last_frame_image` 的定义原文，彻底消除用户疑虑。
