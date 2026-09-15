# 文本节点多模态卡槽操作锁定解除与动态派生

## Objective
彻底解决画布老节点残留或默认写入 `params.operation = 'chat'` 导致多模态模型素材卡槽无法展示的问题。文本节点界面不包含操作切换器，用户无法手动修改 operation；只要当前选中的模型具备多模态能力（如 Gemini 3.8 / gemini-3.8-flash 包含 `vision_chat`），卡槽解析一律使用多模态操作派生卡槽与添加按钮，避免被老数据的 `chat` 锁定。

## Acceptance
- **多模态模型全面激活卡槽**：当文本节点选中多模态模型时，无论其 `params.operation` 为空还是为 `'chat'`，`resolveSlotOperation` 均返回多模态 operation（如 `vision_chat`），派生出图片/视频卡槽与添加按钮。
- **纯文本模型自适应收起**：选中纯文本模型（如 DeepSeek V4 Pro、GLM-5.3）时，`resolveSlotOperation` 依然返回 `chat`，卡槽预设为 `none`，自适应紧凑收起。
- **用户显式指定的非纯文本操作保留**：若未来支持特定 operation，非 prompt 类型的 operation 依然按原样尊重。
- **自动化测试 100% 通过**：更新并补充单测，确保测试通过。

## Commands
- `node --test plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/textSlotAcceptance.test.mjs`
- `git diff --check`
