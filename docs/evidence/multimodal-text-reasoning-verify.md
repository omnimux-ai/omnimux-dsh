# 多模态素材节点连接「文本推理」实操验证证据

## 验证环境
- 工作树：`.worktrees/multimodal-text-reasoning`
- 分支：`feat/multimodal-text-reasoning`
- 对应规格：`specs/multimodal-text-reasoning.spec.md`

## 走查与验证结果
1. **图片节点输出菜单验证**：
   - 调用 `getOutputOptionSpecs('image')`，选项数量为 3（`text-to-text` 文本推理、`image-to-image` 图生图、`video-generation` 图生视频）。
   - `menu.option.image.text-text-to-text` 成功解析为「文本推理」，描述为「看图理解、反推提示词、描述提取」。

2. **视频节点输出菜单验证**：
   - `getOutputOptionSpecs('video')` 包含 `text-to-text`（文本推理）与 `video-generation`。
   - `menu.option.video.text-text-to-text` 统一对齐为「文本推理」，描述为「视频内容理解、解说文案生成、分镜描述」。

3. **音频节点输出菜单验证**：
   - 调用 `getOutputOptionSpecs('audio')`，选项数量为 4（`text-to-text` 文本推理、`video-generation` 视频生成、`audio-voice-clone` 声音克隆、`audio-transcription` 语音转文字）。
   - `menu.option.audio.text-text-to-text` 成功解析为「文本推理」，描述为「音频内容理解、意图分析、摘要提炼」。

4. **连线创建目标节点初始化验证**：
   - 句柄点击菜单选择：`handleOutputMenuSelect` 将 `parsed.targetTool` 传递为 `overrides.selectedTool`，生成的节点为专职多模态文本推理工具 `text-to-text`。
   - 释放拖拽菜单选择：`useConnectionMenu` 同样将 `parsed.targetTool` 传递为 `overrides.selectedTool`，连线端到端链路顺畅。

5. **输入能力矩阵验证**：
   - `NodeSpecRegistry.getToolSpec('material', 'text-to-text').acceptedInputTypes` 包含 `['text', 'image', 'video', 'audio']`，全多模态连接校验 100% 通过。
