# Spec: 资产库预览弹窗点击「加入对话」后自动关闭

- 任务：`omnimux-assets-modal-close`（Issue #4024）
- 日期：2026-11-10
- 状态：active

## 目标

资产库（omnimux-assets）中，打开风格 / 云端素材的预览弹窗（`AssetPreviewModal`），点击底部「加入对话」把素材挂到输入框后，弹窗应自动关闭。当前它只切到「已加入」回执并保持打开，用户必须再点右上角 X 或按 Esc 才能关闭，操作不闭环。

## 用户操作旅程与期望反馈

1. 在资产库云端「风格」分类点开一张风格卡，弹出预览弹窗，正文是该风格的提示词描述。
2. 点击底部「加入对话」——素材写入当前输入框（不发送、不改草稿）。
3. 点击后预览弹窗自动关闭，回到素材列表，用户可在输入框继续提问；无需再手动关闭弹窗。
4. 「保存到本地」行为不变：只保存，不关闭弹窗；官方音色 preview-only 仍不渲染任何 footer 动作。

## 假设

- 根因是 `AssetPreviewModal.handleAdd` 完成投递与 1800ms 回执后没有调用 `onClose`；弹窗此前只能通过背景点击、右上角 X 或 Esc 关闭。
- 预览弹窗在资产库中由 `AssetsStage` 以 `onClose={() => setPreviewTarget(null)}` 挂载，调用 `onClose` 即可正确卸载弹窗，不改投递通道 `addMediaToConversation` / `onAddToConversation`。
- 对所有可在预览内「加入对话」的资产类型（图片、视频、音频、文本/风格）统一生效，属于交互收口而非按类型特判。

## 证伪方式

- 组件级真实渲染：以 `onAddToConversation` 与 `onClose` 双 spy 渲染 `AssetPreviewModal`，点击「加入对话」按钮后，若 `onAddToConversation` 未被调用、或 `onClose` 未被调用（弹窗不关闭），则修复失败；`pnpm --filter omnimux-assets test` 对应用例必须红→绿。
- 真实浏览器：在改动后的构建里打开风格预览弹窗并点击「加入对话」，若点击后弹窗仍存在于 DOM / 截图仍可见，则修复失败；证据截图见 `docs/evidence/omnimux-assets-modal-close/`。
- 回归：点击「保存到本地」不得触发 `onClose`；官方音色 preview-only 仍无 footer 动作。

## 验收标准

- `plugins/omnimux-assets/src/client/AssetPreviewModal.jsx`：`handleAdd` 投递成功后调用 `onClose?.()`。
- 新增组件级 e2e 强断言测试：点击「加入对话」→ 投递回调与关闭回调各一次；点击「保存到本地」→ 不关闭。
- `pnpm --filter omnimux-assets test` 全绿；`pnpm verify:stages` 通过。
- 真实无头 Chrome 功能路径截图（点击前弹窗在、点击后弹窗消失）落盘入库。

## 边界

- 只调整预览弹窗「加入对话」的关闭交互；不改投递/附件通道、不改卡片级「添加到会话」、不改「保存到本地」语义、不改官方音色 preview-only 边界。
