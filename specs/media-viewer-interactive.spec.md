# 规格文档：媒体查看器 7 大交互闭环与双轨打点自适应机制 (Issue #2673)

## 1. 目标（Objective）
在工作区 `plugins/omnimux/src/client/media-viewer/` 中，正式实现并闭环经 `deliverables/media-viewer-interactive-demo/index.html` 验证的 7 大交互闭环与方案 C 双轨打点自适应机制：
1. **槽位与自适应推导 (`media-slot.js`)**：
   - 增加纯函数 `deriveAdaptiveOperation(model, kind, buckets)`，依据入槽素材与模型操作契约自适应收敛目标操作；
   - 在 `slotPlan` 中为图像模式纯文生图常驻提供 1 个 1:1 虚线空卡槽，为视频模式提供首尾帧引导槽。
2. **选择参考面板 (`ReferencePickerPopover.jsx`)**：
   - 输入框正上方 8px 弹出，包含 4 个 Tab（`上传资产`、`AI 生成`、`数字人`、`商品`）与 `只看我的` 过滤开关；
   - 首格固定 `从本地上传`，点击卡片填入目标卡槽并关闭面板。
3. **卡槽组 (`MediaSlotGroup.jsx`)**：
   - 锁定 64×64 1:1 物理尺寸；
   - 虚线卡槽点击时调用 `onOpenReferencePicker(slot)` 唤起参考面板；
   - 支持已填入卡片角标渲染（`标记 N` / `首帧` / `尾帧`）。
4. **生成输入区 (`MediaViewerComposer.jsx`)**：
   - 输入框左侧外置垂直胶囊切换器（上 `图像`、下 `视频`，间距 10px），移除内部重复的模式下拉按钮；
   - 跨模态平滑迁移素材（图像素材自动迁移为视频首帧，反之亦然）；
   - 订阅 `media-viewer-store` 的 `savedAnnotations` 实施方案 C 双向联动：
     * 画布保存打点时，自动将当前模特原图注入卡槽 Slot 1 并带上 `标记 N` 角标；
     * 输入框自动同步 `标记 1：...；标记 2：...`，保留用户补充描述；
     * 清空打点时，输入框打点前缀精准清除，原图退槽，模式切回 `文生图`；
   - 提交时组装方位 Prompt 与 `annotations` 数组及结构化资产。
5. **顶栏状态条 (`MediaViewerTab.jsx`)**：
   - 顶栏评论状态条更新为极简 `已标记 N 处` + 矢量 SVG 清空按钮，移除冗余指导文案。
6. **视觉样式规范 (`styles.js`)**：
   - 补齐垂直模式切换胶囊 `.omx-external-mode-rail`、1:1 卡槽角标、参考面板样式，全部消费 `--dsw-alias-*` 原生 Token，无 Emoji，符合 UI04。

## 2. 验证命令（Commands）
```bash
# 1. 运行卡槽槽位推导单元测试
node --test plugins/omnimux/src/client/media-viewer/media-slot.test.js

# 2. 运行构建验证
pnpm --filter omnimux build
```

## 3. 项目结构（Project Structure）
- `plugins/omnimux/src/client/media-viewer/media-slot.js`: 核心槽位规划与自适应契约操作推导纯函数。
- `plugins/omnimux/src/client/media-viewer/media-slot.test.js`: 对应单元测试，覆盖纯文生图空卡槽、视频引导槽与自适应推导状态机。
- `plugins/omnimux/src/client/media-viewer/ReferencePickerPopover.jsx`: [新建] 参考素材选择面板。
- `plugins/omnimux/src/client/media-viewer/MediaSlotGroup.jsx`: 64×64 1:1 卡槽组与角标渲染。
- `plugins/omnimux/src/client/media-viewer/MediaViewerComposer.jsx`: 外置垂直胶囊、跨模态迁移、打点双向同步与提交组装。
- `plugins/omnimux/src/client/media-viewer/MediaViewerTab.jsx`: 极简「已标记 N 处」状态条。
- `plugins/omnimux/src/client/media-viewer/styles.js`: 消费 `--dsw-alias-*` 原生 Token 的对应样式。

## 4. UI 元素与文案锁定表（SaaS Copy & UI Whitelist）
- **垂直模式切换胶囊**：上 `图像`、下 `视频`（纯矢量 SVG + 文本，间距 10px）。
- **参考面板 Tab**：`上传资产`、`AI 生成`、`数字人`、`商品`。
- **参考面板过滤**：`只看我的`。
- **参考面板首格**：`从本地上传`。
- **卡槽角标**：`标记 N`（打点图）、`首帧`（视频首帧）、`尾帧`（视频尾帧）。
- **输入框打点前缀**：`标记 1：{文本}；标记 2：{文本}；`。
- **顶栏状态条**：`已标记 N 处` + 矢量 SVG 清空按钮。
- **反过度设计禁忌**：严禁 Emoji、严禁私造 Badge、严禁冗余营销副标题。

## 5. 测试与验收策略（Testing Strategy）
1. `media-slot.test.js`：
   - 图像模型纯文生图常驻返回 1 个 1:1 虚线空卡槽；
   - 视频模式 text_to_video 常驻返回首尾帧引导槽；
   - `deriveAdaptiveOperation` 覆盖图像 0/1/>1 素材及视频无/首帧/首尾帧/编辑各状态；
2. 构建测试：
   - `pnpm --filter omnimux build` 零编译错误；
3. 代码自检：
   - 100% 符合 design.md 与 UI04 矢量图标无 Emoji 规范。
