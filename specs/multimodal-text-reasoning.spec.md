# 多模态素材节点连接「文本推理」功能规格

## Objective
在画布中，针对图片节点、视频节点和音频节点的连接手柄（加号生成菜单），新增/对齐「文本推理」选项。点击后在画布右侧创建文本节点并建立连线，将图片、视频、音频多模态素材作为输入传递给文本节点，实现基于多模态大模型的看图析意、视频理解与音频内容问答。

## Acceptance Criteria
1. **连接生成选项矩阵扩充**：
   - 图片节点（`image`）：在连接生成选项列表中新增 `{ targetMaterialType: 'text', targetTool: 'text-to-text', icon: 'TextGen' }`。
   - 视频节点（`video`）：确保已有 `{ targetMaterialType: 'text', targetTool: 'text-to-text', icon: 'TextGen' }` 菜单选项，文案对齐为「文本推理」。
   - 音频节点（`audio`）：在连接生成选项列表中新增 `{ targetMaterialType: 'text', targetTool: 'text-to-text', icon: 'TextGen' }`。
2. **工具输入契约支持全多模态**：
   - `text-to-text` 工具的 `acceptedInputTypes` 扩充为 `['text', 'image', 'video', 'audio']`，类型系统与连接校验完全接纳音频输入。
3. **新建节点工具初始化**：
   - 用户从连接生成菜单选中「文本推理」后，新创建的文本节点必须显式指定 `selectedTool: 'text-to-text'`（而非回退为不支持上游输入的默认编辑器 `text-editor`）。
   - 源节点与目标文本节点自动建立连线（sourceHandle: 'out' -> targetHandle: 'in'）。
4. **多语言与文案对齐**：
   - 国际化字典新增与统一 `menu.option.<type>.text-text-to-text` 及其描述，中英文对照清晰。
5. **测试覆盖与无回归**：
   - 现有单测及工具输入契约测试同步对齐并全部绿灯。

## Commands
- `pnpm --filter omnimux-workflow test`
- `git diff --check`

## Project Structure
- 节点连接配置：`plugins/omnimux-workflow/src/shared/graph/connectionConfig.ts`
- 节点与工具规格：`plugins/omnimux-workflow/src/shared/specs/nodes/materialNodeSpec.ts`
- 句柄菜单选择逻辑：`plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/NodeHandles/MaterialNodeHandles.tsx`
- 画布拖放释放菜单逻辑：`plugins/omnimux-workflow/src/canvas/editor/hooks/useConnectionMenu.ts`
- 国际化字典：`plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts`, `dict.en.ts`
- 规格测试：`plugins/omnimux-workflow/src/shared/specs/nodeSpecRegistry.test.mjs`
