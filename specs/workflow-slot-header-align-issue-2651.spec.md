# 工作流生成配置面板卡槽顶栏左对齐与间距规范 (Issue #2651)

## 目标
修复 Issue #2651：解决 `GenerationConfigPanel` 顶栏 `.wf-config-panel__prompt-header` 因 `justify-content: space-between` 导致同时连入上游文本输入卡槽（`textSources`）与媒体卡槽（`SlotWells`）时，第 2 个卡槽组被强行推到 50% 正中间的问题，实现多卡槽紧凑靠左排布、操作按钮吸附最右侧。

## 用户操作旅程与期望界面反馈
1. **多卡槽连入场景**：用户在画布中为生成节点同时连入上游文本节点与参考图片/媒体节点。
2. **顶栏视觉排布反馈**：
   - 文本输入卡槽（`wf-slot-wells--strip` / `wf-effective-text--slot`）居最左侧；
   - 媒体卡槽组（`SlotWells`）紧随其后靠左排列，两组卡槽之间保持统一标准的 8px 间距；
   - 两组卡槽紧密聚合在左侧，不再出现第 2 个卡槽被强推到中间 50% 的视觉割裂；
   - 右侧操作按钮组（`wf-config-panel__prompt-header-actions`，如放大展开按钮）通过 `margin-left: auto` 稳固吸附在容器最右端。
3. **纯文本无卡槽场景（Empty Slots）**：
   - 当模型无卡槽且无上游文本时，追加 `wf-config-panel__prompt-header--empty-slots`；
   - 保持 `justify-content: flex-end; min-height: 24px; margin-bottom: 4px;`，操作按钮依然稳居最右端。

## 规格与样式变更白名单
1. **`.wf-config-panel__prompt-header`**：
   - 将 `justify-content: space-between;` 改为 `justify-content: flex-start; gap: 8px;`；
   - 保持 `margin-bottom: 8px; min-height: 44px; flex-wrap: wrap;`。
2. **`.wf-config-panel__prompt-header--empty-slots`**：
   - 保持 `min-height: 24px; margin-bottom: 4px; justify-content: flex-end;`。
3. **`.wf-config-panel__prompt-header-actions`**：
   - 保持 `display: flex; align-items: center; gap: 6px;`；
   - 新增 `margin-left: auto;`。
4. **零新增文案、零新增 UI 元素、零改动 JSX DOM 结构**。

## 验收用例
- [x] `.wf-config-panel__prompt-header` 声明 `justify-content: flex-start;` 与 `gap: 8px;`
- [x] `.wf-config-panel__prompt-header-actions` 声明 `margin-left: auto;`
- [x] `TC-T02-04` 自动化测试断言全绿通过
- [x] 既有 20 项卡槽验收测试 100% 回归通过

## 边界
- **总是**：遵循 `design.md` 间距 Token（8px）与工具栏单行流规范（CTA 声明 `margin-left: auto`）；
- **绝不**：改动组件 DOM 树结构、增加任何多余装饰元素或更改 i18n 文案。
