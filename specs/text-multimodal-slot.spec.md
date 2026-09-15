# 文本节点多模态卡槽显示与能力契约规格映射

## Objective
修复文本生成节点在未连线及连入多模态素材（图片、视频、音频）时，卡槽（SlotWells）完全不显示或误判定为纯文本模式的问题。根据执行中枢模型契约规格（CapabilityCatalog），当当前模型支持多模态输入（如 Gemini 3.8 / gemini-3.8-flash、GPT-5.5、Claude Opus 4.6 等）时，默认展示多模态卡槽及对应支持的文件类型与数量上限，并允许点击添加按钮；当选中纯文本模型（如 DeepSeek V4 Pro、GLM-5.3）时，卡槽自适应收起；连入超限素材时，卡槽保持展示并提供冲突状态提示，杜绝卡槽静默隐藏。

## Acceptance
- **多模态模型空态展示**：当文本节点选中支持多模态媒体输入的模型（如 `gemini-3.8-flash`）且未显式指定操作时，槽位解析自动采用支持媒体的多模态操作（如 `vision_chat`），卡槽展示图片槽位（上限 10）、视频槽位（上限 1）与添加按钮（`addButton: true`）。
- **纯文本模型自适应收起**：当文本节点选中仅支持纯文本的模型（如 `deepseek-v4-pro`）时，卡槽预设为 `none`，槽位为空，容器追加 `empty-slots` 紧凑类名消除死高。
- **提交一致性保留**：无任何素材连入时，提交操作依据执行中枢规则保持纯文本提交（`chat`），不发生误升迁；连入素材时依输入类型正常升迁为 `vision_chat`。
- **超限与冲突容错**：连入超限视频或不兼容素材时，多模态卡槽骨架不被重置为 `none`，超限素材正确记录在冲突列表中并展示错误或待解绑状态。
- **自动化测试 100% 通过**：通过相关单元测试，不破坏既有契约。

## Commands
- `node --test plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/textSlotAcceptance.test.mjs`
- `pnpm --filter omnimux-workflow test`
- `git diff --check`

## Project Structure
- 核心逻辑：`plugins/omnimux-workflow/src/shared/graph/feedSlot/resolveSlotOperation.ts`
- 契约与派生：`plugins/omnimux-workflow/src/shared/graph/feedSlot/deriveSlotLayout.ts`
- 前端配置面板：`plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx`
- 专项测试：`plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/textSlotAcceptance.test.mjs`
